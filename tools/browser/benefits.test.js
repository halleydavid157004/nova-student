import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildSite} from '../static/build.js';
test('browser: benefits match, savings, calendar, no duplicates, safe evidence and explicit feedback work on Render and static subpath', {timeout:45000},async()=>{
 const publicRoot=fileURLToPath(new URL('../../public/',import.meta.url));const stamp=new Date().toISOString(),deadline=new Date(Date.now()+400*86400000).toISOString();
 const o={id:1,brand:'Fixture',title:'<img src=x onerror="window.pwned=1">',benefit:'Plan educativo',status:'active',reviewed:true,countries:['CO'],verification:'Educational email',requirements:['Matrícula vigente'],steps:['Consultar fuente'],source_url:'https://example.invalid/student',liveness_verified_at:stamp,liveness_status:'active',evidence:'<script>window.pwned=1</script>',expires_at:deadline};
 const rows=[o,{...o,id:2,source_url:o.source_url+'?utm_source=copy'},{...o,id:3,title:'Otro país',countries:['MX']},{...o,id:4,status:'pending',reviewed:false}];
 const site=buildSite({schema:1,offers:rows},{baseUrl:'https://example.invalid/nova-student/'});let browser;
 try{
  browser=await chromium.launch();
  for(const mode of ['render','static']){
   const requests=[],errors=[];const server=createServer((req,res)=>{try{
    const pathname=new URL(req.url,'http://localhost').pathname;
    if(pathname==='/api/catalog'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({schema:1,max_age_days:14,offers:rows}));}
    const p=mode==='static'?pathname.replace(/^\/nova-student\//,''):pathname.slice(1);const file=mode==='static'?site.files.get(p):readFileSync(path.join(publicRoot,p));if(file===undefined)throw new Error();
    res.setHeader('Content-Type',p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':p.endsWith('.json')?'application/json':'text/html');res.end(file);
   }catch{res.writeHead(404);res.end();}});
   await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;const context=await browser.newContext({timezoneId:'America/Bogota'});
   try{
    await context.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());requests.push({url:req.url(),method:req.method(),body:req.postData(),headers:req.headers()});if(url.pathname==='/api/offers/1/reports')return route.fulfill({contentType:'application/json',headers:{'Access-Control-Allow-Origin':base},body:'{"ok":true}'});if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':base,'Access-Control-Allow-Headers':'content-type','Access-Control-Allow-Methods':'POST'}});if(url.origin===base)return route.continue();return route.abort();});
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(base+(mode==='static'?'/nova-student/benefits.html':'/benefits.html'));await page.waitForFunction(()=>document.querySelectorAll('.benefit').length===2);
    assert.equal(await page.locator('.benefit img,.benefit script').count(),0);assert.equal(await page.evaluate(()=>window.pwned),undefined);
    assert.ok(requests.every(r=>new URL(r.url).origin===base),'no Render or Auth requests while loading static catalog');
    assert.equal(await page.locator('#benefits-account').isVisible(),mode==='render');
    await page.selectOption('#benefits-country','CO');await page.selectOption('#benefits-email','educational');await page.selectOption('#benefits-student','yes');await page.getByRole('button',{name:'Comparar mi perfil',exact:true}).click();await page.check('#benefits-compatible');assert.equal(await page.locator('.benefit').count(),1);
    const card=page.locator('[data-offer-id="1"]');await card.locator('[name=regular_monthly]').fill('20');await card.locator('[name=student_monthly]').fill('5');await card.locator('[name=selected]').check();assert.match(await page.locator('#benefits-total').textContent(),/180,00/);assert.match(await page.locator('#benefits-total').textContent(),/No es ahorro confirmado/);
    assert.equal(await page.locator('.calendar-event').count(),1);assert.match(await page.locator('#benefits-timezone').textContent(),/America\/Bogota/);
    await card.locator('[data-worked]').click();await page.waitForFunction(()=>document.querySelector('[data-worked]').nextElementSibling.textContent.includes('Gracias'));
    const sent=requests.find(r=>new URL(r.url).pathname==='/api/offers/1/reports'&&r.method==='POST');assert.deepEqual(JSON.parse(sent.body),{reason:'worked'});assert.equal(sent.headers.authorization,undefined);assert.equal(sent.headers.apikey,undefined);
    await page.getByRole('button',{name:'Borrar mis cálculos',exact:true}).click();assert.match(await page.locator('#benefits-total').textContent(),/Sin precios/);assert.equal(await card.locator('[name=regular_monthly]').inputValue(),'');assert.deepEqual(await page.evaluate(()=>[localStorage.length,sessionStorage.length]),[0,0]);assert.deepEqual(errors,[]);
   }finally{await context.close();await new Promise(r=>server.close(r));}
  }
 }finally{if(browser)await browser.close();}
});
