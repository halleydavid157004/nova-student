export function authConfig(env=process.env){
 const key=String(env.SUPABASE_PUBLISHABLE_KEY||'');let publicKey=key.startsWith('sb_publishable_');
 if(!publicKey)try{publicKey=JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString()).role==='anon';}catch{}
 const url=String(env.SUPABASE_URL||'').replace(/\/$/,'');
 const valid=/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)&&publicKey&&!key.startsWith('sb_secret_');
 const enabled=valid&&env.SUPABASE_AUTH_ENABLED==='true';
 return enabled?{enabled:true,url,key}:{enabled:false,reason:'Las cuentas todavía no están activadas. Tus favoritos siguen disponibles en este dispositivo.'};
}
