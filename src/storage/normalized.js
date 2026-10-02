const collections = ['sources', 'offers', 'alerts', 'events'];
const ignoredFields = new Set(['updated_at', 'created_at', 'search_document']);
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function runtimeValue(key, value) {
  if (key !== 'brave' || !value) return value;
  const {month, used, lookupUsed, ...metadata} = value;
  return metadata;
}

// Only changed rows/fields leave the process. Expected values prevent lost edits.
export function changesBetween(before, after) {
  const changes = [];
  for (const collection of collections) {
    const previous = new Map((before[collection] || []).map(row => [row.id, row]));
    for (const row of after[collection] || []) {
      if (!Number.isSafeInteger(row.id) || row.id < 1) throw new Error('Invalid numeric row ID');
      const old = previous.get(row.id);
      previous.delete(row.id);
      if (!old) {
        changes.push({collection, patch: row, expected: null, operation: 'upsert'});
        continue;
      }
      const patch = {id: row.id}, expected = {};
      for (const key of new Set([...Object.keys(old), ...Object.keys(row)])) {
        if (key === 'id' || ignoredFields.has(key) || same(old[key], row[key])) continue;
        patch[key] = row[key] ?? null;
        expected[key] = old[key] ?? null;
      }
      if (Object.keys(patch).length > 1) changes.push({collection, patch, expected, operation: 'upsert'});
    }
    for (const row of previous.values()) {
      // Full expected content: deletion must not erase an edit from another writer.
      const expected = Object.fromEntries(Object.entries(row).filter(([key]) => !ignoredFields.has(key)));
      changes.push({collection, patch: {id: row.id}, expected, operation: 'delete'});
    }
  }
  const oldRuntime = before.runtime || {}, nextRuntime = after.runtime || {};
  for (const key of Object.keys(nextRuntime)) {
    if(key==='_workerExecution')continue; // Read-only projection from worker_runs/lease.
    const value = runtimeValue(key, nextRuntime[key]);
    const old = runtimeValue(key, oldRuntime[key]);
    if (!same(old, value)) changes.push({collection: 'runtime', patch: {key, value}, expected: {value: old ?? null}});
  }
  return changes;
}

export function createNormalizedStorage(rpc) {
  let baseline, pools = {}, lastRead = 0;
  const refill = async () => {
    const next = await rpc('nova_reserve_ids', {amount: 1000});
    for (const key of collections) {
      if (!Number.isSafeInteger(next[key]?.next) || !Number.isSafeInteger(next[key]?.last)) {
        throw new Error('Invalid database ID reservation');
      }
    }
    // Each refill reserves fresh blocks; unused IDs may be skipped, never reused.
    pools = next;
  };
  return {
    async load({activate = false, canAdopt = () => true} = {}) {
      const state = await rpc(activate ? 'nova_activate_rows' : 'nova_load_rows');
      if (!state || typeof state !== 'object' || collections.some(key => !Array.isArray(state[key]))) {
        throw new Error('Invalid normalized storage response');
      }
      // A local write may start while the remote read is in flight.
      if (!canAdopt()) return null;
      baseline = structuredClone(state);
      lastRead = Date.now();
      if (activate) await refill();
      return state;
    },
    nextId(kind) {
      const pool = pools[kind];
      if (!pool || pool.next > pool.last) throw new Error('Database ID reservation exhausted; refresh storage');
      return pool.next++;
    },
    async persist(state) {
      if (!baseline) throw new Error('Normalized storage is not loaded');
      const next = structuredClone(state);
      const changes = changesBetween(baseline, next);
      // One RPC transaction: rows and their related events either all commit or none do.
      if (changes.length > 1000) throw new Error('Change batch exceeds 1000 rows; flush more often');
      if (changes.length) await rpc('nova_apply_changes', {changes});
      // Native alert writes may finish during this RPC. Apply only this batch's
      // changes to the baseline, preserving those independently committed rows.
      for (const change of changes) {
        if (change.collection === 'runtime') {
          baseline.runtime ||= {};
          baseline.runtime[change.patch.key] = structuredClone(change.patch.value);
          continue;
        }
        const rows = baseline[change.collection];
        const index = rows.findIndex(row => row.id === change.patch.id);
        if (change.operation === 'delete') { if (index >= 0) rows.splice(index, 1); }
        else if (index < 0) rows.push(structuredClone(change.patch));
        else Object.assign(rows[index], structuredClone(change.patch));
      }
      if (Object.values(pools).some(pool => pool.last - pool.next < 100)) await refill();
    },
    dueForRefresh() { return Date.now() - lastRead >= 60000; },
    reserveBrave(month, purpose, limit) {
      return rpc('nova_reserve_brave', {month_key: month, purpose, total_limit: limit});
    },
    async createAlert(input) {
      const row = await rpc('nova_create_alert', {input});
      if (!row || !Number.isSafeInteger(row.id)) throw new Error('Invalid alert storage response');
      const index = baseline.alerts.findIndex(alert => alert.id === row.id);
      if (index < 0) baseline.alerts.push(structuredClone(row));
      else baseline.alerts[index] = structuredClone(row);
      return row;
    },
    claimWorker(jobKey,window,token) {return rpc('nova_claim_worker',{request_key:jobKey,window_key:window,owner_token:token});},
    assertWorker(token) {return rpc('nova_assert_worker',{owner_token:token});},
    finishWorker(token,status,summary) {return rpc('nova_finish_worker',{owner_token:token,result_status:status,result_summary:summary});},
    forgetAlerts(ids) {const removed=new Set(ids);baseline.alerts=baseline.alerts.filter(a=>!removed.has(a.id));},
    maintenance() {return rpc('nova_worker_maintenance');},
    claimDigest(alertId,key) {return rpc('nova_claim_digest',{alert_key:alertId,delivery_key:key});},
    async finishDigest(key,status,providerId) {
      const row=await rpc('nova_finish_digest',{delivery_key:key,result_status:status,provider_key:providerId||null});
      const existing=baseline.alerts.find(a=>a.id===row.id);if(existing)Object.assign(existing,row);return row;
    },
    validationContext(offerId) { return rpc('nova_validation_context',{offer_id:offerId}); },
    configureValidation(days) { return rpc('nova_configure_validation',{days}); },
    async recordCheck(input) {
      const result=await rpc('nova_record_check',{input});
      if(!Number.isSafeInteger(result?.offer?.id))throw new Error('Invalid validation storage response');
      const index=baseline.offers.findIndex(row=>row.id===result.offer.id);
      if(index<0)throw new Error('Validation offer is not loaded');
      baseline.offers[index]=structuredClone(result.offer);
      return result.offer;
    },
    async adminReview(op,input){
      const result=await rpc('nova_admin_review',{op,input});
      for(const [key,collection] of [['offer','offers'],['source','sources']])if(result[key]){
        const row=result[key],index=baseline[collection].findIndex(o=>o.id===row.id);
        if(index>=0)baseline[collection][index]=structuredClone(row);
      }
      return result;
    },
    submitReport(offerId,reporter,reason) {return rpc('nova_submit_report',{offer_id:offerId,reporter,report_reason:reason});},
    async autoApprove(input){
      const result=await rpc('nova_auto_approve',{input});
      for(const row of result?.offers||[]){
        const index=baseline.offers.findIndex(o=>o.id===row.id);
        if(index>=0)baseline.offers[index]=structuredClone(row);
      }
      return result;
    },
  };
}
