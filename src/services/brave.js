import {db, save, flushSave, reserveBraveBudget} from '../db.js';
import {performance} from 'node:perf_hooks';

export const RADAR_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const RADAR_OFFSET_MS = 17 * 60 * 1000;
let requestInFlight = false;
let previousRequestAt = -Infinity;

export function radarWindow(now = Date.now()) {
  return Math.floor((now - RADAR_OFFSET_MS) / RADAR_INTERVAL_MS);
}

export function nextRadarRun(now = Date.now()) {
  return new Date((radarWindow(now) + 1) * RADAR_INTERVAL_MS + RADAR_OFFSET_MS).toISOString();
}

export function braveState() {
  db.runtime ||= {};
  db.runtime.brave ||= {};
  return db.runtime.brave;
}

function monthlyLimit() {
  const value = Number(process.env.BRAVE_MONTHLY_LIMIT ?? 600);
  return Number.isInteger(value) && value >= 0 ? Math.min(value, 600) : 600;
}

function monthAt(now) { return new Date(now).toISOString().slice(0, 7); }

export function braveStatus(now = Date.now()) {
  const state = braveState();
  const month = monthAt(now);
  const used = state.month === month ? Math.max(0, Number(state.used) || 0) : 0;
  const lookupUsed = state.month === month ? Math.max(0, Number(state.lookupUsed) || 0) : 0;
  const limit = monthlyLimit();
  return {
    enabled: Boolean(process.env.BRAVE_SEARCH_API_KEY?.trim()),
    intervalHours: 6,
    nextRunAt: nextRadarRun(now),
    lastRunAt: state.lastRunAt || null,
    lastCompletedAt: state.lastCompletedAt || null,
    lastSuccessAt: state.lastSuccessAt || null,
    lastError: state.lastError || null,
    lastHttpStatus: state.lastHttpStatus || null,
    lastRun: state.lastRun || null,
    budget: {month, used, limit, remaining: Math.max(0, limit - used), lookupUsed, lookupLimit: 100},
    retryAt: state.retryAt > now ? new Date(state.retryAt).toISOString() : null,
  };
}

function retryDelay(value, now) {
  const seconds = Number(value);
  const until = Number.isFinite(seconds) ? now + seconds * 1000 : Date.parse(value);
  return Math.min(24 * 60 * 60 * 1000, Math.max(60_000, Number.isFinite(until) ? until - now : 60_000));
}

// All Brave calls, including AI-assisted URL lookup, share this reservation.
// Count and persist attempts BEFORE sending: retries/restarts cannot erase usage.
export async function braveSearch(query, {count = 20, freshness, purpose = 'discovery'} = {}) {
  const key = process.env.BRAVE_SEARCH_API_KEY?.trim();
  if (!key) return {enabled: false, results: [], skipped: 'not_configured'};
  const state = braveState();
  const now = Date.now();
  const status = braveStatus(now);
  if (status.budget.remaining === 0) return {enabled: true, results: [], skipped: 'monthly_limit'};
  if (purpose === 'lookup' && status.budget.lookupUsed >= 100)
    return {enabled: true, results: [], skipped: 'lookup_limit'};
  if (state.retryAt > now) return {enabled: true, results: [], skipped: 'cooldown'};
  if (requestInFlight) return {enabled: true, results: [], skipped: 'busy'};
  requestInFlight = true;
  try {
    if (state.month !== status.budget.month) {
      state.month = status.budget.month;
      state.used = 0;
      state.lookupUsed = 0;
    }
    let reservation;
    try { reservation = await reserveBraveBudget(status.budget.month,purpose,status.budget.limit); }
    catch { state.lastError='storage'; return {enabled:true,results:[],error:'storage'}; }
    if(reservation){
      state.used=reservation.used;state.lookupUsed=reservation.lookupUsed;
      if(reservation.skipped)return {enabled:true,results:[],skipped:reservation.skipped};
    }else{
      state.used = Math.max(0, Number(state.used) || 0) + 1;
      if (purpose === 'lookup') state.lookupUsed = Math.max(0, Number(state.lookupUsed) || 0) + 1;
    }
    state.lastRequestAt = new Date(now).toISOString();
    save();
    try { await flushSave(); }
    catch { state.lastError = 'storage'; return {enabled: true, results: [], error: 'storage'}; }

    // Also supports legacy free keys limited to one request per second.
    const delay = Math.max(0, 1100 - (performance.now() - previousRequestAt));
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    previousRequestAt = performance.now();
    const url = new URL('https://api.search.brave.com/res/v1/web/search');
    url.searchParams.set('q', String(query).slice(0, 400));
    url.searchParams.set('count', String(Math.max(1, Math.min(20, count))));
    if (freshness) url.searchParams.set('freshness', freshness);
    let result;
    try {
      const response = await fetch(url, {
        headers: {'X-Subscription-Token': key, Accept: 'application/json'},
        signal: AbortSignal.timeout(15000), redirect: 'error',
      });
      state.lastHttpStatus = response.status;
      if (!response.ok) {
        await response.body?.cancel();
        const error = response.status === 401 || response.status === 403 ? 'authentication'
          : response.status === 402 ? 'quota' : response.status === 429 ? 'rate_limited' : 'upstream';
        state.lastError = error;
        if (response.status === 429) state.retryAt = Date.now() + retryDelay(response.headers.get('retry-after'), Date.now());
        // Do not log provider bodies, which may include credentials or account data.
        result = {enabled: true, results: [], error, httpStatus: response.status, attempted: true};
      } else {
        let json;
        try { json = await response.json(); }
        catch { throw new Error('invalid_response'); }
        if (!json || typeof json !== 'object' || Array.isArray(json)) throw new Error('invalid_response');
        if (json.web?.results !== undefined && !Array.isArray(json.web.results)) throw new Error('invalid_response');
        state.lastError = null;
        state.retryAt = null;
        state.lastSuccessAt = new Date().toISOString();
        result = {enabled: true, results: (json.web?.results || []).slice(0, 20), attempted: true};
      }
    } catch (error) {
      state.lastError = error.message === 'invalid_response' ? 'invalid_response' : 'network';
      result = {enabled: true, results: [], error: state.lastError, attempted: true};
    }
    save();
    try { await flushSave(); }
    catch { state.lastError = 'storage'; return {...result, results: [], error: 'storage'}; }
    return result;
  } finally { requestInFlight = false; }
}
