import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
test('browser: PKCE account callback, local favorite merge, profile and logout', {timeout:45000},async()=>{
 const root=fileURLToPath(new URL('../../',import.meta.url)),dir=mkdtempSync(path.join(tmpdir(),'nova-account-e2e-'));
 const state=JSON.parse(readFileSync(path.join(root,'test/fixtures/legacy-state.json'),'utf8'));state.offers.forEach(o=>o.verified_at=new Date().toISOString());writeFileSync(path.join(dir,'db.json'),JSON.stringify(state));
 const listener=createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));
 const child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),DATABASE_PATH:path.join(dir,'db.json'),SUPABASE_URL:'',SUPABASE_SECRET_KEY:'',SUPABASE_AUTH_ENABLED:'false',WORKER_ENABLED:'false',GROQ_API_KEY:'',BRAVE_SEARCH_API_KEY:'',RESEND_API_KEY:'',SMTP_USER:'',SMTP_PASS:'',ADMIN_TOKEN:''},stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',c=>output+=c);child.stderr.on('data',c=>output+=c);let browser;
 try{const base='http://127.0.0.1:'+port;let ready=false;for(let i=0;i<80;i++){try{if((await fetch(base+'/api/health')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ready,output);
 browser=await chromium.launch();const context=await browser.newContext();let profile=null,otp=false,loggedOut=false;const favorites=new Set([14]),uid='11111111-1111-4111-8111-111111111111';
 await context.route('**/*',async route=>{const request=route.request(),url=new URL(request.url());const cors={'Access-Control-Allow-Origin':base,'Access-Control-Allow-Headers':'apikey,authorization,content-type,prefer','Access-Control-Allow-Methods':'GET,POST,DELETE,OPTIONS'};const json=data=>route.fulfill({status:200,contentType:'application/json',headers:cors,body:JSON.stringify(data)});
 if(request.method()==='OPTIONS')return route.fulfill({status:204,headers:cors});
 if(url.origin===base&&url.pathname==='/api/auth-config')return json({enabled:true,url:'https://fixture.supabase.co',key:'sb_publishable_fixture'});
 if(url.hostname==='fixture.supabase.co'){
 if(url.pathname==='/auth/v1/otp'){otp=true;assert.equal(request.postDataJSON().code_challenge_method,'s256');return json({});}
 if(url.pathname==='/auth/v1/token'){assert.ok(request.postDataJSON().code_verifier);return json({access_token:'fixture-token',refresh_token:'fixture-refresh',expires_in:3600});}
 if(url.pathname==='/auth/v1/user')return json({id:uid,is_anonymous:false});
 if(url.pathname==='/auth/v1/logout'){loggedOut=true;return route.fulfill({status:204,headers:cors});}
 if(url.pathname==='/rest/v1/public_offers'){const selected=url.searchParams.get('id')||'';return json(state.offers.filter(o=>selected.includes(String(o.id))&&o.id!==13&&o.id!==15).map(o=>({id:o.id,title:o.title})));}
 if(url.pathname==='/rest/v1/user_favorites'){if(request.method()==='POST'){const rows=request.postDataJSON();for(const o of Array.isArray(rows)?rows:[rows]){assert.equal(o.user_id,uid);favorites.add(o.offer_id);}}return json([...favorites].map(offer_id=>({offer_id})));}
 if(url.pathname==='/rest/v1/user_profiles'){if(request.method()==='POST'){profile=request.postDataJSON();assert.equal(profile.user_id,uid);return json({});}return json(profile?[profile]:[]);}
 if(url.pathname==='/rest/v1/user_saved_searches')return json([]);
 throw new Error('Unexpected fixture URL '+url.pathname);
 }if(url.origin===base)return route.continue();return route.abort();});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/account.html');await page.locator('#signin').waitFor({state:'visible'});
 await page.evaluate(()=>localStorage.setItem('nova-saved-offers','[12,13]'));await page.fill('#email','fixture@example.invalid');await page.locator('#signin button').click();try{await page.waitForFunction(()=>document.querySelector('#account-status').textContent.includes('Solicitud aceptada'),{},{timeout:10000});}catch(error){throw new Error('Magic link request failed: '+await page.locator('#account-status').textContent(),{cause:error});}assert.ok(otp);
 await page.goto(base+'/account.html?code=fixture-code');await page.waitForFunction(()=>document.querySelector('#account-status').textContent.includes('Sesión activa'));assert.equal(new URL(page.url()).search,'');assert.deepEqual([...favorites].sort(),[12,14]);assert.equal(await page.evaluate(()=>localStorage.getItem('nova-saved-offers')),null);
 await page.selectOption('#profile-country','CO');await page.fill('#career','Engineering');await page.locator('#profile button').click();await page.waitForFunction(()=>document.querySelector('#account-status').textContent==='Perfil guardado.');assert.equal(profile.country,'CO');assert.equal(profile.career,'Engineering');
 await page.locator('#signout').click();await page.waitForFunction(()=>document.querySelector('#account-status').textContent.includes('Sesión cerrada'));assert.ok(loggedOut);assert.equal(await page.evaluate(()=>sessionStorage.getItem('nova-auth:fixture.supabase.co')),null);assert.equal(errors.length,0);
 }finally{if(browser)await browser.close();child.kill('SIGTERM');await new Promise(r=>{if(child.exitCode!==null)return r();child.once('exit',r);setTimeout(()=>{child.kill('SIGKILL');r();},2000).unref();});rmSync(dir,{recursive:true,force:true});}
});
