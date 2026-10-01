import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chromium} from 'playwright';
test('browser: confirmation requires a click, preferences and unsubscribe clear private URL tokens',{timeout:30000},async()=>{
 const browser=await chromium.launch();
 try{
  const context=await browser.newContext(),page=await context.newPage(),errors=[];page.setDefaultTimeout(7000);page.on('pageerror',e=>errors.push(e.message));let confirmed=0,withdrawn=0,updated=null;
  const files=new Map(['preferences.html','account.css','subscriptions/preferences.js'].map(name=>['/'+name,readFileSync(new URL('../../public/'+name,import.meta.url),'utf8')]));
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());assert.equal(url.hash,'');
   if(url.pathname.startsWith('/api/subscriptions/')){
    assert.equal(new URL(page.url()).hash,'');const action=url.pathname.split('/').pop(),input=request.postDataJSON();assert.ok(input.token);
    let data={ok:true};if(action==='preview')data={query:'<img src=x onerror=alert(1)>',country:'CO',frequency:'daily'};
    if(action==='confirm')confirmed++;
    if(action==='preferences')data={status:'confirmed',alerts:[{id:12,query:'<script>throw 1</script>',frequency:'daily',enabled:true,confirmed:true}]};
    if(action==='update')updated=input;if(action==='unsubscribe')withdrawn++;
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
   }
   if(files.has(url.pathname))return route.fulfill({status:200,contentType:url.pathname.endsWith('.js')?'text/javascript':url.pathname.endsWith('.css')?'text/css':'text/html',body:files.get(url.pathname)});
   return route.abort();
  });
  const base='http://127.0.0.1:4321/preferences.html';
  await page.goto(base+'#confirm=fixture');await page.locator('#confirm').waitFor({state:'visible'});assert.equal(confirmed,0);assert.equal(await page.locator('#preview img').count(),0);
  await page.locator('#confirm').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Alerta confirmada'));assert.equal(confirmed,1);
  await page.goto(base+'#preferences=fixture');await page.locator('#alerts select').waitFor();assert.equal(await page.locator('#alerts script').count(),0);
  await page.locator('#alerts select').selectOption('weekly');await page.locator('#alerts button').click();await page.waitForFunction(()=>document.querySelector('#status').textContent==='Preferencias guardadas.');assert.equal(updated.alert_id,12);assert.equal(updated.frequency,'weekly');
  await page.goto(base+'#unsubscribe=fixture');await page.locator('#unsubscribe').waitFor({state:'visible'});assert.equal(withdrawn,0);await page.locator('#unsubscribe').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Baja registrada'));assert.equal(withdrawn,1);assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
