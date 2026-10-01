import '../../src/env.js';
import {chromium} from 'playwright';
import {migrate,configureValidation,flushSave} from '../../src/db.js';
import {maxAgeDays} from '../../src/services/liveness.js';
import {scanAll} from '../../src/services/crawler.js';
import {createHeadlessRenderer} from './headless.js';

if(process.env.GITHUB_ACTIONS!=='true')throw new Error('Production headless validation runs only in GitHub Actions');
await migrate();await configureValidation(maxAgeDays());
const browser=await chromium.launch();
try{
  const headless=await createHeadlessRenderer(browser);
  const results=await scanAll({headless});await flushSave();
  console.log(JSON.stringify({checked:results.length,sourceErrors:results.filter(r=>r.error).length,blocked:results.filter(r=>r.skipped).length}));
}finally{await browser.close()}
