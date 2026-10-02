import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {authConfig} from '../src/services/auth-config.js';
import {createAccountClient} from '../public/accounts/client.js';
const memory=()=>{const map=new Map();return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k),map};};
const config={enabled:true,url:'https://fixture.supabase.co',key:'sb_publishable_fixture'};
const uid='11111111-1111-4111-8111-111111111111';
const session=()=>({access_token:'fixture-access',refresh_token:'fixture-refresh',expires_in:3600});
const slot='nova-auth:fixture.supabase.co';
test('public config rejects service keys and remains disabled by default',()=>{
 for(const key of ['sb_secret_private','', 'a.'+Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url')+'.c'])assert.equal(authConfig({SUPABASE_URL:config.url,SUPABASE_PUBLISHABLE_KEY:key,SUPABASE_AUTH_ENABLED:'true'}).enabled,false);
 assert.equal(authConfig({SUPABASE_URL:config.url,SUPABASE_PUBLISHABLE_KEY:config.key}).enabled,false);
 assert.equal(authConfig({SUPABASE_URL:config.url,SUPABASE_PUBLISHABLE_KEY:config.key,SUPABASE_AUTH_ENABLED:'true'}).enabled,true);
 assert.ok(!JSON.stringify(authConfig({SUPABASE_URL:config.url,SUPABASE_SECRET_KEY:'sb_secret_private'})).includes('sb_secret_private'));
});
test('PKCE works across tabs in same browser, clears verifier and never persists tokens in local storage',async()=>{
 const browser=memory(),tab=memory(),other=memory(),calls=[];
 const fetcher=async(url,options)=>{calls.push({url,options});if(url.includes('/otp?'))return Response.json({});if(url.includes('/token?'))return Response.json(session());if(url.endsWith('/user'))return Response.json({id:uid,is_anonymous:false});if(url.includes('/logout'))return new Response(null,{status:204});throw new Error(url);};
 const client=await createAccountClient(config,{storage:tab,verifierStorage:browser,cryptoApi:webcrypto,fetcher});
 await client.signIn('fixture@example.invalid','https://nova-student-radar.onrender.com/account.html');
 const request=JSON.parse(calls[0].options.body);assert.equal(request.code_challenge_method,'s256');assert.equal(request.code_challenge.length,43);assert.ok(!calls[0].options.body.includes('code_verifier'));
 await assert.rejects(client.signIn('fixture@example.invalid','https://nova-student-radar.onrender.com/account.html'),/un minuto/);
 const callback=await createAccountClient(config,{storage:other,verifierStorage:browser,cryptoApi:webcrypto,fetcher});await callback.callback('fixture-code');
 assert.equal((await callback.current()).user.id,uid);assert.equal(browser.getItem(slot+':verifier'),null);assert.equal(tab.getItem(slot),null);assert.ok(other.getItem(slot));assert.ok(![...browser.map.values()].join('').includes('fixture-access'));
 assert.equal(calls[1].options.credentials,'omit');assert.ok(calls[1].options.headers.apikey.startsWith('sb_publishable_'));
 await callback.signOut();assert.equal(other.getItem(slot),null);assert.equal(await callback.current(),null);
 await assert.rejects(callback.callback('replayed-code'),/mismo navegador/);
});
test('merging favorites imports only published IDs, does not overwrite remote favorites',async()=>{
 const storage=memory();storage.setItem(slot,JSON.stringify({...session(),expires_at:Date.now()/1000+3600,user:{id:uid}}));const writes=[];
 const fetcher=async(url,options)=>{
 if(url.endsWith('/user'))return Response.json({id:uid,is_anonymous:false});
 if(url.includes('/public_offers'))return Response.json([{id:12}]);
 if(url.includes('/user_favorites')&&options.method==='POST'){writes.push(JSON.parse(options.body));return new Response(null,{status:201});}
 if(url.includes('/user_favorites')&&options.method==='DELETE'){writes.push({query:url});return new Response(null,{status:204});}
 if(url.includes('/user_favorites'))return Response.json([{offer_id:12},{offer_id:99}]);throw new Error(url);
 };
 const client=await createAccountClient(config,{storage,cryptoApi:webcrypto,fetcher});await client.restore();
 assert.deepEqual(await client.mergeFavorites([12,12,13,-1,'99']),[12,99]);assert.deepEqual(writes[0],[{user_id:uid,offer_id:12}]);
 await client.favorite(12,false);assert.match(writes[1].query,/user_id=eq\.11111111/);
 await assert.rejects(client.favorite('12',true),/inválida/);await assert.rejects(client.table('subscribers'),/Recurso inválido/);
});
test('refresh is shared, transient failures retain session and revoked sessions clear it',async()=>{
 const storage=memory();storage.setItem(slot,JSON.stringify({...session(),expires_at:0,user:{id:uid}}));let refreshes=0;
 const fetcher=async url=>{if(url.includes('/token?')){refreshes++;await new Promise(r=>setTimeout(r,5));return Response.json(session());}return Response.json({id:uid,is_anonymous:false});};
 const client=await createAccountClient(config,{storage,cryptoApi:webcrypto,fetcher});await Promise.all([client.current(),client.current()]);assert.equal(refreshes,1);
 const failure=await createAccountClient(config,{storage,cryptoApi:webcrypto,fetcher:async()=>new Response(null,{status:503})});await assert.rejects(failure.restore());assert.ok(storage.getItem(slot));
 const revoked=await createAccountClient(config,{storage,cryptoApi:webcrypto,fetcher:async()=>new Response(null,{status:401})});await assert.rejects(revoked.restore());assert.equal(storage.getItem(slot),null);
});

test('PKCE redirects allow HTTP only on explicit loopback development hosts',async()=>{
 const options={storage:memory(),cryptoApi:webcrypto,fetcher:async()=>Response.json({})};
 const client=await createAccountClient(config,options);
 await assert.rejects(client.signIn('fixture@example.invalid','http://external.invalid/account.html'),/Destino inválido/);
 await assert.rejects(client.signIn('fixture@example.invalid','ftp://localhost/account.html'),/Destino inválido/);
 await client.signIn('fixture@example.invalid','http://127.0.0.1:4310/account.html');
});

test('accepted account deletion clears session and verifier; an unaccepted failure preserves them',async()=>{
 for(const outcome of ['completed','pending','failed']){
  const storage=memory(),verifier=memory();storage.setItem(slot,JSON.stringify({...session(),expires_at:Date.now()/1000+3600,user:{id:uid}}));verifier.setItem(slot+':verifier','fixture');let calls=0;
  const client=await createAccountClient(config,{storage,verifierStorage:verifier,fetcher:async(url,options)=>{calls++;assert.equal(url,'/api/account/delete');assert.deepEqual(JSON.parse(options.body),{confirm:'ELIMINAR'});assert.equal(options.headers.Authorization,'Bearer fixture-access');assert.equal(options.headers.apikey,undefined);return outcome==='failed'?new Response(null,{status:503}):Response.json({status:outcome},{status:outcome==='pending'?202:200});}});
  await assert.rejects(client.deleteAccount('yes'),/ELIMINAR/);assert.equal(calls,0);
  if(outcome==='failed'){await assert.rejects(client.deleteAccount('ELIMINAR'));assert.ok(storage.getItem(slot));assert.ok(verifier.getItem(slot+':verifier'));}
  else{assert.equal((await client.deleteAccount('ELIMINAR')).status,outcome);assert.equal(storage.getItem(slot),null);assert.equal(verifier.getItem(slot+':verifier'),null);assert.equal(await client.current(),null);}
 }
});
