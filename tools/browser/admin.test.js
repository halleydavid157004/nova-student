import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
test('browser: admin evidence is safe text; approval needs explicit review and only sends bounded metadata', {timeout:45000},async()=>{
 const root=fileURLToPath(new URL('../../public/',import.meta.url));const server=createServer((req,res)=>{try{const p=new URL(req.url,'http://localhost').pathname;const file=readFileSync(path.join(root,p));res.setHeader('Content-Type',p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':'text/html');res.end(file);}catch{res.writeHead(404);res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;let browser;
 try{
  browser=await chromium.launch();const context=await browser.newContext();const actions=[],errors=[];
  const stamp=new Date().toISOString(),title='<img src=x onerror="window.pwned=1">';
  const item={offer:{id:123,title,source_url:'https://example.invalid/student',updated_at:stamp,steps:['Consultar fuente'],status:'pending'},check:{id:456,score:100,checked_at:stamp,signals:{http:200}},version:{evidence:'<script>window.pwned=1</script>',extraction:{benefit:'Plan gratuito'}},approved:null,problems:[],duplicates:[]};
  await context.addInitScript(()=>sessionStorage.setItem('nova-auth:fixture.supabase.co',JSON.stringify({access_token:'fixture-token',refresh_token:'fixture-refresh',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'fixture-user'}})));
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());const json=data=>route.fulfill({contentType:'application/json',headers:{'Access-Control-Allow-Origin':base,'Access-Control-Allow-Headers':'apikey,authorization'},body:JSON.stringify(data)});
   if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':base,'Access-Control-Allow-Headers':'apikey,authorization'}});
   if(url.pathname==='/api/auth-config')return json({enabled:true,url:'https://fixture.supabase.co',key:'sb_publishable_fixture'});
   if(url.hostname==='fixture.supabase.co'&&url.pathname==='/auth/v1/user')return json({id:'fixture-user',is_anonymous:false});
   if(url.pathname==='/api/admin/review'){
    assert.equal(req.headers().authorization,'Bearer fixture-token');assert.equal(req.headers().apikey,undefined);
    if(req.method()==='POST'){actions.push(req.postDataJSON());return json({ok:true});}
    if(url.searchParams.get('section')==='sources')return json({items:[{id:9,name:'Source fixture',url:'javascript:window.pwned=1',enabled:true,updated_at:stamp}]});
    if(url.searchParams.get('section')==='audit')return json({items:[{id:1,action:'approve',reason:title,details:{benefit:title},created_at:stamp}]});
    return json({items:actions.length?[]:[item]});
   }
   if(url.origin===base)return route.continue();return route.abort();
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/admin.html');await page.waitForSelector('#admin-panel:not([hidden])');
  assert.equal(await page.locator('article h3').textContent(),title);assert.equal(await page.locator('article img,article script').count(),0);
  await page.locator('article form').first().locator('textarea').fill('Revisé el beneficio y todos sus requisitos.');
  await page.getByRole('button',{name:'Aprobar',exact:true}).click();assert.equal(actions.length,0);assert.match(await page.locator('#admin-status').textContent(),/Confirma/);
  await page.locator('input[name=confirm_source]').check();await page.getByRole('button',{name:'Aprobar',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#admin-status').textContent.includes('No hay registros'));
  assert.equal(actions[0].confirm_source,true);assert.equal(actions[0].check_id,456);assert.equal(actions[0].user_id,undefined);
  await page.getByRole('button',{name:'Fuentes',exact:true}).click();await page.waitForSelector('article h3');assert.equal(await page.locator('article a').count(),0);
  await page.locator('article textarea').fill('Fuente deshabilitada para revisar requisitos.');const sent=page.waitForResponse(r=>r.url().includes('/api/admin/review')&&r.request().method()==='POST');await page.getByRole('button',{name:'Deshabilitar',exact:true}).click();await sent;
  assert.equal(actions[1].action,'source');assert.equal(actions[1].enabled,false);
  await page.getByRole('button',{name:'Registro de acciones',exact:true}).click();await page.waitForSelector('article h3');assert.equal(await page.locator('article img,article script').count(),0);assert.equal(await page.evaluate(()=>window.pwned),undefined);assert.deepEqual(errors,[]);
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
});
