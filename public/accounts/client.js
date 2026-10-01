// Supabase Auth REST + PKCE, no server SDK or service key in the browser.
const ids=values=>[...new Set(values.filter(v=>Number.isSafeInteger(v)&&v>0))].slice(0,1000);
const encode=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
export async function createAccountClient(config,{fetcher=fetch,storage=sessionStorage,cryptoApi=crypto,verifierStorage=(typeof localStorage==='undefined'?storage:localStorage)}={}){
 if(!config?.enabled)return null;
 if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(config.url)||!config.key||config.key.startsWith('sb_secret_'))throw new Error('Configuración de cuenta inválida');
 const slot='nova-auth:'+new URL(config.url).hostname,verifierSlot=slot+':verifier';let session=null,refreshing;
 try{session=JSON.parse(storage.getItem(slot)||'null');}catch{storage.removeItem(slot);}
 async function request(path,{method='GET',body,token,headers={}}={}){
 const response=await fetcher(config.url+path,{method,headers:{apikey:config.key,...(token?{Authorization:'Bearer '+token}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{}),...headers},...(body!==undefined?{body:JSON.stringify(body)}:{}),credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(15000)});
 if(!response.ok){const error=new Error(response.status===401?'Tu sesión ha caducado. Vuelve a iniciar sesión.':response.status===429?'Demasiados intentos. Espera antes de volver a intentar.':'No se pudo completar la operación de cuenta.');error.status=response.status;throw error;}
 if(response.status===204)return null;const text=await response.text();return text?JSON.parse(text):null;
 }
 function store(value){session=value;if(value)storage.setItem(slot,JSON.stringify(value));else storage.removeItem(slot);}
 async function accept(value){
 if(typeof value?.access_token!=='string'||typeof value?.refresh_token!=='string')throw new Error('Sesión inválida');
 const user=await request('/auth/v1/user',{token:value.access_token});
 if(!user?.id||user.is_anonymous)throw new Error('Se requiere una cuenta verificada');
 store({access_token:value.access_token,refresh_token:value.refresh_token,expires_at:Math.floor(Date.now()/1000)+(Number(value.expires_in)||3600),user:{id:user.id}});return session;
 }
 async function current(){
 if(!session)return null;
 if(session.expires_at*1000>Date.now()+60000)return session;
 if(!refreshing)refreshing=(async()=>{try{return await accept(await request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:session.refresh_token}}));}catch(error){if(error.status===400||error.status===401)store(null);throw error;}finally{refreshing=null;}})();
 return refreshing;
 }
 async function table(name,{query='',method='GET',body,headers={}}={}){
 if(!['user_profiles','user_favorites','user_saved_searches','public_offers'].includes(name))throw new Error('Recurso inválido');
 const active=await current();if(!active)throw new Error('Inicia sesión para sincronizar');
 return request('/rest/v1/'+name+query,{method,body,headers,token:active.access_token});
 }
 async function signIn(email,redirect){
 if(typeof email!=='string'||email.length>254||!/^\S+@\S+\.\S+$/.test(email))throw new Error('Introduce un correo válido');
 let pending;try{pending=JSON.parse(verifierStorage.getItem(verifierSlot)||'null');}catch{}if(pending&&Date.now()-pending.created<60000)throw new Error('Espera un minuto antes de solicitar otro enlace.');
 const destination=new URL(redirect);if(destination.protocol!=='https:'&&destination.hostname!=='localhost')throw new Error('Destino inválido');
 const verifier=encode(cryptoApi.getRandomValues(new Uint8Array(32)));
 const challenge=encode(new Uint8Array(await cryptoApi.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));
 verifierStorage.setItem(verifierSlot,JSON.stringify({verifier,created:Date.now()}));
 try{await request('/auth/v1/otp?redirect_to='+encodeURIComponent(destination.href),{method:'POST',body:{email,create_user:true,code_challenge:challenge,code_challenge_method:'s256'}});}catch(error){verifierStorage.removeItem(verifierSlot);throw error;}
 }
 async function callback(code){
 let state;try{state=JSON.parse(verifierStorage.getItem(verifierSlot)||'null');}catch{}
 verifierStorage.removeItem(verifierSlot);
 if(!state?.verifier||Date.now()-state.created>3600000||typeof code!=='string'||code.length>2048)throw new Error('Abre el enlace en el mismo navegador donde lo solicitaste.');
 return accept(await request('/auth/v1/token?grant_type=pkce',{method:'POST',body:{auth_code:code,code_verifier:state.verifier}}));
 }
 async function signOut(){const token=session?.access_token;store(null);verifierStorage.removeItem(verifierSlot);if(token)await request('/auth/v1/logout?scope=local',{method:'POST',token});}
 async function favorites(){return (await table('user_favorites',{query:'?select=offer_id&order=offer_id.asc&limit=1000'})).map(o=>o.offer_id);}
 async function mergeFavorites(values){
 const selected=ids(values),active=await current();if(!active)throw new Error('Inicia sesión para sincronizar');
 // Public view determines which local IDs are safe to import. Never import hidden leads.
 for(let start=0;start<selected.length;start+=100){const batch=selected.slice(start,start+100);const published=await table('public_offers',{query:'?select=id&id=in.('+batch.join(',')+')'});
 if(published.length)await table('user_favorites',{method:'POST',query:'?on_conflict=user_id,offer_id',headers:{Prefer:'resolution=ignore-duplicates'},body:published.map(o=>({user_id:active.user.id,offer_id:o.id}))});}
 return favorites();
 }
 async function favorite(offer_id,enabled){if(!Number.isSafeInteger(offer_id)||offer_id<1)throw new Error('Oferta inválida');const active=await current();if(!active)throw new Error('Inicia sesión para sincronizar');
 return enabled?table('user_favorites',{method:'POST',query:'?on_conflict=user_id,offer_id',headers:{Prefer:'resolution=ignore-duplicates'},body:{user_id:active.user.id,offer_id}}):table('user_favorites',{method:'DELETE',query:'?offer_id=eq.'+offer_id+'&user_id=eq.'+encodeURIComponent(active.user.id)});
 }
 async function restore(){if(!session)return null;try{const active=await current();const user=await request('/auth/v1/user',{token:active.access_token});if(user.is_anonymous||user.id!==active.user.id)throw Object.assign(new Error('Sesión inválida'),{status:401});return active;}catch(error){if(error.status===401)store(null);throw error;}}
 return {current,restore,signIn,callback,signOut,table,favorites,mergeFavorites,favorite};
}
export async function configuredClient(options={}){const fetcher=options.fetcher||fetch;const response=await fetcher('/api/auth-config',{cache:'no-store'});if(!response.ok)throw new Error('No se pudo consultar la configuración de cuentas');return createAccountClient(await response.json(),options);}
