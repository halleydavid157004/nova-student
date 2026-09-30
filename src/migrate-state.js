import './env.js';
import {importLegacySnapshot} from './db.js';

// Idempotent import before cutover. Prints counts only, never subscriber records.
const counts = await importLegacySnapshot();
console.log('Legacy import completed:', JSON.stringify(counts));
