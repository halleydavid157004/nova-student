import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

test('browser: search, open offer and persist an alert', {timeout:45000},async()=>{
  const root=fileURLToPath(new URL('../../',import.meta.url));const dir=mkdtempSync(path.join(tmpdir(),'nova-e2e-'));
  const state=JSON.parse(readFileSync(path.join(root,'test/fixtures/legacy-state.json'),'utf8'));
  state.alerts=[];state.offers.forEach(offer=>offer.verified_at=new Date().toISOString());
  const database=path.join(dir,'test.json');writeFileSync(database,JSON.stringify(state));
  const listener=createServer();await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
  const child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),DATABASE_PATH:database,SUPABASE_URL:'',SUPABASE_SECRET_KEY:'',SEED_DATABASE_PATH:'',WORKER_ENABLED:'false',GROQ_API_KEY:'',BRAVE_SEARCH_API_KEY:'',RESEND_API_KEY:'',SMTP_USER:'',SMTP_PASS:'',ADMIN_TOKEN:''},stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>output+=chunk);
  let browser;
  try{
    const base=`http://127.0.0.1:${port}`;let ready=false;
    for(let i=0;i<80;i++){try{if((await fetch(base+'/api/health')).ok){ready=true;break}}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
    assert.ok(ready,output);
    browser=await chromium.launch();const context=await browser.newContext();
    await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
    const page=await context.newPage();await page.goto(base);
    await page.locator('#nav-discover').click();await page.locator('#q').fill('cloud');await page.locator('#searchBtn').click();
    await page.locator('#grid .card').first().waitFor();assert.match(await page.locator('#grid').innerText(),/Educación cloud/);
    await page.locator('#grid .card').first().click();await page.locator('#modalTitle').waitFor();assert.match(await page.locator('#modalTitle').innerText(),/Educación cloud/);
    await page.locator('#modal [data-close]').first().click();
    await page.locator('#createAlert-header').click();await page.locator('#alertEmail').fill('browser-fixture@example.invalid');
    await page.locator('#alertSubmitBtn').click();
    await page.waitForFunction(()=>/guardada|creada|activada/i.test(document.querySelector('#alertStatus')?.textContent||''));
    const stored=JSON.parse(readFileSync(database,'utf8'));assert.ok(stored.alerts.some(alert=>alert.email==='browser-fixture@example.invalid'));
  }finally{
    if(browser)await browser.close();child.kill('SIGTERM');await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);setTimeout(()=>{child.kill('SIGKILL');resolve()},2000).unref()});rmSync(dir,{recursive:true,force:true});
  }
});
