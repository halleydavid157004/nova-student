import '../../src/env.js';
import {writeFileSync,mkdirSync,appendFileSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';
import {migrate,configureValidation,storageStatus,flushSave} from '../../src/db.js';
import {maxAgeDays} from '../../src/services/liveness.js';
import {runDiscoveryAndScan} from '../../src/worker.js';
import {jobSummary} from '../../src/services/job-summary.js';
import {createHeadlessRenderer} from './headless.js';

if(process.env.GITHUB_ACTIONS!=='true')throw new Error('Production radar runs in GitHub Actions');
if(process.env.RADAR_ENGINE!=='actions')throw new Error('Set RADAR_ENGINE=actions in the workflow');
if(!process.env.SUPABASE_URL||!process.env.SUPABASE_SECRET_KEY)throw new Error('Configure Supabase in GitHub Secrets');
let browser;
try{
 await migrate();if(storageStatus().schema!=='normalized')throw new Error('Normalized storage required');
 await configureValidation(maxAgeDays());browser=await chromium.launch();
 const headless=await createHeadlessRenderer(browser);
 const result=await runDiscoveryAndScan({actionRunner:true,validationOnly:process.env.RADAR_VALIDATE_ONLY==='true',sourceOptions:{headless,prioritize:true},onCatalog:catalog=>{
  const dir=path.resolve('generated');mkdirSync(dir,{recursive:true});const body=JSON.stringify(catalog);
  if(Buffer.byteLength(body)>2*1024*1024)throw new Error('Public catalog exceeds 2 MB; review before export');
  writeFileSync(path.join(dir,'catalog.json'),body);
 }});
 if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,jobSummary(result));
 console.log(JSON.stringify(result.skipped?{skipped:result.skipped}:result.summary));
 await flushSave();
}catch{
 if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,'### Radar\n\nCiclo fallido. Comprueba las variables privadas y worker_runs; no se registran claves ni destinatarios.\n');
 console.error('Radar cycle failed; inspect private worker state.');process.exitCode=1;
}finally{if(browser)await browser.close();}
