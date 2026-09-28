/**
 * Nova Student Radar — Background Worker v2.0
 * 
 * Schedules:
 *  - Discovery cycle: every SCAN_INTERVAL_MS (default 6h)
 *    → Discovers new sources from APIs + web searches
 *    → Scans all known sources for changes
 *    → Auto-creates offers from new sources
 * 
 *  - Email digest: every DIGEST_INTERVAL_MS (default 1h)
 *    → Sends due alert emails (instant, daily, weekly)
 * 
 *  - First run: triggers an initial scan 30s after startup
 */

import { scanAll, discoverAll } from './services/crawler.js';
import { sendDueDigests } from './services/email.js';
import { db } from './db.js';

let scanning = false;
let lastScanResult = null;
let scanCount = 0;

async function runDiscoveryAndScan() {
  if (scanning) {
    console.log('[Worker] Scan already in progress, skipping.');
    return;
  }

  scanning = true;
  scanCount++;
  const cycleId = scanCount;
  const start = Date.now();

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`[Worker] Discovery & Scan Cycle #${cycleId} started`);
  console.log(`[Worker] Current DB: ${db.offers.length} offers, ${db.sources.length} sources`);
  console.log(`${'═'.repeat(60)}`);

  try {
    // Phase 1: Discovery — find new sources from external APIs
    console.log('\n[Worker] Phase 1: Discovery…');
    const discovery = await discoverAll();

    // Phase 2: Scan — check all known sources for changes
    console.log('\n[Worker] Phase 2: Scanning all sources…');
    const scan = await scanAll();

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    const changed = scan.filter(x => x.changed).length;
    const errors = scan.filter(x => x.error).length;

    lastScanResult = {
      cycle: cycleId,
      timestamp: new Date().toISOString(),
      elapsed: `${elapsed}s`,
      discovery: {
        newSources: discovery.discovered || 0,
        studentOffers: discovery.studentOffers?.discovered || 0,
        brave: discovery.brave?.discovered || 0,
        github: discovery.github?.discovered || 0,
      },
      scan: {
        total: scan.length,
        changed,
        errors,
        ok: scan.length - changed - errors,
      },
      db: {
        offers: db.offers.length,
        sources: db.sources.length,
      },
    };

    console.log(`\n${'─'.repeat(60)}`);
    console.log(`[Worker] Cycle #${cycleId} complete in ${elapsed}s`);
    console.log(`[Worker] Discovery: ${discovery.discovered || 0} new sources`);
    console.log(`[Worker] Scan: ${scan.length} sources checked, ${changed} changed, ${errors} errors`);
    console.log(`[Worker] DB totals: ${db.offers.length} offers, ${db.sources.length} sources`);
    console.log(`${'─'.repeat(60)}\n`);

  } catch (e) {
    console.error('[Worker] Scan error:', e);
  } finally {
    scanning = false;
  }
}

async function runDigest() {
  try {
    const results = await sendDueDigests();
    if (results.length > 0) {
      console.log(`[Worker] Digest: sent ${results.filter(r => r.sent).length} emails`);
    }
  } catch (e) {
    console.error('[Worker] Digest error:', e);
  }
}

export function getWorkerStatus() {
  return {
    scanning,
    scanCount,
    lastScanResult,
    nextScanIn: scanning ? 'Running now' : undefined,
  };
}

export function startWorker() {
  const scanMs = Number(process.env.SCAN_INTERVAL_MS || 21600000); // default: 6 hours
  const digestMs = Number(process.env.DIGEST_INTERVAL_MS || 3600000); // default: 1 hour

  const scanHours = (scanMs / 3600000).toFixed(1);
  const digestMinutes = (digestMs / 60000).toFixed(0);

  console.log(`\n🛰️  Nova Student Radar — Worker v2.0`);
  console.log(`   Discovery & Scan: every ${scanHours}h`);
  console.log(`   Email digest: every ${digestMinutes}min`);
  console.log(`   Initial scan: in 30 seconds\n`);

  // Periodic scan
  setInterval(runDiscoveryAndScan, scanMs).unref();

  // Periodic digest
  setInterval(runDigest, digestMs).unref();

  // Initial scan after a short delay (lets the server start first)
  setTimeout(runDiscoveryAndScan, 30_000);
}
