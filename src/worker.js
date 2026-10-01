import {scanAll, discoverAll, getBraveDiscoveryStatus} from './services/crawler.js';
import {sendDueDigests} from './services/email.js';
import crypto from 'node:crypto';
import {db,save,flushSave,claimWorker,assertWorker,finishWorker,setWorkerContext,workerMaintenance} from './db.js';
import {publicCatalog} from './services/catalog-export.js';
import {radarWindow, nextRadarRun} from './services/brave.js';

let scanTask = null;
let digestRunning = false;
let started = false;
export function radarEngine(){return process.env.RADAR_ENGINE==='actions'?'actions':'render';}

function workerState() {
  db.runtime ||= {};
  db.runtime.worker ||= {};
  return db.runtime.worker;
}

// Automatic jobs and the authenticated manual endpoint share one task.
export function runDiscoveryAndScan({force = false,sourceOptions,actionRunner=false,validationOnly=false,onCatalog} = {}) {
  if(radarEngine()==='actions'&&!actionRunner)return Promise.resolve({skipped:'external_runner',discovery:{},scan:[]});
  if (scanTask) return scanTask;
  const state = workerState();
  if (!force && !actionRunner && Number.isSafeInteger(state.lastWindow) && state.lastWindow >= radarWindow())
    return Promise.resolve({skipped: 'not_due', discovery: {}, scan: []});
  scanTask = performCycle({sourceOptions,force,validationOnly,onCatalog}).finally(() => { scanTask = null; });
  return scanTask;
}

async function performCycle({sourceOptions,force,validationOnly,onCatalog}) {
  const window=radarWindow();
  const jobKey=validationOnly?`validate:${window}:${crypto.randomUUID()}`:force?`radar:manual:${window}:${crypto.randomUUID()}`:`radar:${window}`;
  const lease=await claimWorker(jobKey,window);
  if(lease.skipped)return {skipped:lease.skipped,discovery:{},scan:[]};
  setWorkerContext(lease);

  const state = workerState();
  const startedAt = Date.now();
  state.lastWindow = radarWindow(startedAt);
  state.lastStartedAt = new Date(startedAt).toISOString();
  state.scanCount = (Number(state.scanCount) || 0) + 1;
  state.lastError = null;
  try {
    save();
    await flushSave();
    const capacity=await workerMaintenance();
    if(capacity.capacity_low){state.lastError='capacity_low';save();await flushSave();await finishWorker(lease.token,'failed',{error:'capacity_low'});return {skipped:'capacity_low',discovery:{},scan:[]};}
    console.log(`[Worker] Six-hour radar cycle #${state.scanCount} started.`);
    await assertWorker(lease.token);
    const discovery = validationOnly?{discovered:0}:await discoverAll(sourceOptions);
    await assertWorker(lease.token);
    const scan = await scanAll({...sourceOptions,beforeBatch:()=>assertWorker(lease.token)});
    const catalog=publicCatalog(db.offers);
    await onCatalog?.(catalog);
    const deliveries=validationOnly?[]:await sendDueDigests({beforeSend:()=>assertWorker(lease.token)});

    state.lastCompletedAt = new Date().toISOString();
    state.lastScanResult = {
      cycle: state.scanCount, timestamp: state.lastCompletedAt,
      elapsed: `${((Date.now() - startedAt) / 1000).toFixed(1)}s`,
      discovery: {
        newSources: discovery.discovered || 0,
        studentOffers: discovery.studentOffers?.discovered || 0,
        brave: discovery.brave?.discovered || 0,
        github: discovery.github?.discovered || 0,
      },
      scan: {
        total: scan.length, changed: scan.filter(item => item.changed).length,
        errors: scan.filter(item => item.error).length,
        skipped: scan.filter(item => item.skipped).length,
        unavailable: scan.filter(item => item.status === 404 || item.status === 410).length,
        ok: scan.filter(item => item.status >= 200 && item.status < 400).length,
      },
      db: {offers: db.offers.length, sources: db.sources.length},
      catalog:{offers:catalog.offers.length},digests:{sent:deliveries.filter(x=>x.sent).length,skipped:deliveries.filter(x=>x.skipped).length,errors:deliveries.filter(x=>x.error).length},
      brave:{used:getBraveDiscoveryStatus().budget?.used||0},engine:radarEngine(),attempt:lease.attempt,

    };
    save();
    await flushSave();
    console.log(`[Worker] Cycle complete: ${scan.length} sources checked; ${state.lastScanResult.scan.errors} external source errors.`);
    await finishWorker(lease.token,'completed',state.lastScanResult);
    return {discovery,scan,summary:state.lastScanResult};
  } catch {
    state.lastError = 'cycle_failed';
    save();
    await flushSave().catch(() => {});
    await finishWorker(lease.token,'failed',{error:'cycle_failed'}).catch(()=>{});
    throw Object.assign(new Error('No se pudo completar el ciclo del radar.'), {status: 503});
  }finally{setWorkerContext(null);}
}

async function runDigest() {
  if (digestRunning) return;
  digestRunning = true;
  try {
    const results = await sendDueDigests();
    if (results.length) console.log(`[Worker] Digest: ${results.filter(result => result.sent).length} emails sent.`);
  } catch { console.error('[Worker] Email digest failed.'); }
  finally { digestRunning = false; }
}

export function getWorkerStatus() {
  const state = workerState();
  const execution=db.runtime?._workerExecution;
  const remoteRunning=radarEngine()==='actions'&&execution?.status==='started'&&Date.parse(execution.leased_until)>Date.now();
  return {
    enabled: radarEngine()==='actions'||process.env.WORKER_ENABLED !== 'false',engine:radarEngine(),localEnabled:radarEngine()==='render'&&process.env.WORKER_ENABLED !== 'false',
    scanning: Boolean(scanTask)||!!remoteRunning,localScanning:Boolean(scanTask),execution:execution||null,scanCount: state.scanCount || 0,
    intervalHours: 6, nextRunAt: nextRadarRun(),
    lastStartedAt: state.lastStartedAt || null,
    lastCompletedAt: state.lastCompletedAt || null,
    lastError: state.lastError || null,
    lastScanResult: state.lastScanResult || null,
    brave: getBraveDiscoveryStatus(),
  };
}

export function startWorker() {
  if (started || radarEngine()==='actions' || process.env.WORKER_ENABLED === 'false') return;
  started = true;
  const run = () => runDiscoveryAndScan().catch(error => console.error('[Worker]', error.message));
  const schedule = () => {
    const wait = Math.max(1000, Date.parse(nextRadarRun()) - Date.now());
    setTimeout(() => { run(); schedule(); }, wait).unref();
  };
  schedule();
  setTimeout(run, 30_000).unref();
  const configuredDigest = Number(process.env.DIGEST_INTERVAL_MS || 3600000);
  const digestMs = Number.isFinite(configuredDigest) ? Math.max(60000, Math.min(configuredDigest, 86400000)) : 3600000;
  setInterval(runDigest, digestMs).unref();
  console.log('[Worker] Radar scheduled every six hours at 00:17, 06:17, 12:17 and 18:17 UTC.');
  if (process.env.SCAN_INTERVAL_MS && Number(process.env.SCAN_INTERVAL_MS) !== 21600000)
    console.log('[Worker] Legacy SCAN_INTERVAL_MS replaced by the fixed six-hour schedule.');
}
