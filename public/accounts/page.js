import {configuredClient} from './client.js?v=3';
import {countryOptions} from '../search/countries.js';
const $=id=>document.getElementById(id),status=message=>{$('account-status').textContent=message;};
const code=new URL(location.href).searchParams.get('code');
// Clear the callback URL before any Auth/configuration request.
if(location.search||location.hash)history.replaceState(null,'',location.pathname);
for(const name of ['profile-country','search-country'])for(const country of countryOptions()){const option=document.createElement('option');option.value=country.code;option.textContent=country.name;$(name).append(option);}
let client;
async function listings(){
 const active=await client.current(),favorites=await client.favorites();$('favorites').replaceChildren();
 for(let start=0;start<favorites.length;start+=100){const batch=favorites.slice(start,start+100);const offers=await client.table('public_offers',{query:'?select=id,title&id=in.('+batch.join(',')+')'});for(const offer of offers){const li=document.createElement('li'),link=document.createElement('a'),remove=document.createElement('button');link.href='/?offer='+offer.id;link.textContent=offer.title;remove.textContent='Quitar';remove.addEventListener('click',()=>perform(remove,async()=>{await client.favorite(offer.id,false);await listings();}));li.append(link,' ',remove);$('favorites').append(li);}}
 if(!$('favorites').children.length)$('favorites').textContent='No hay favoritos publicados disponibles. Los favoritos retirados conservan su historial.';
 const searches=await client.table('user_saved_searches',{query:'?select=id,query,country&order=created_at.desc&limit=50'});$('searches').replaceChildren();
 for(const search of searches){const li=document.createElement('li'),remove=document.createElement('button');li.append(document.createTextNode(search.query+' · '+search.country+' '));remove.textContent='Eliminar búsqueda';remove.addEventListener('click',()=>perform(remove,async()=>{await client.table('user_saved_searches',{method:'DELETE',query:'?id=eq.'+encodeURIComponent(search.id)+'&user_id=eq.'+active.user.id});await listings();}));li.append(remove);$('searches').append(li);}
}
async function member(){
 const active=await client.current();$('signin').hidden=!!active;$('oauth').hidden=!!active||!client.providers.includes('github');$('member').hidden=!active;
 if(!active){status('Inicia sesión para sincronizar tus datos.');return;}
 let guest=[];try{guest=JSON.parse(localStorage.getItem('nova-saved-offers')||'[]');}catch{}
 if(Array.isArray(guest)&&guest.length){await client.mergeFavorites(guest);localStorage.removeItem('nova-saved-offers');}
 const rows=await client.table('user_profiles',{query:'?select=country,career,email_type&limit=1'}),profile=rows[0];
 if(profile){$('profile-country').value=profile.country||'';$('career').value=profile.career;$('email-type').value=profile.email_type;}
 await listings();status('Sesión activa. Tus datos se sincronizan con tu cuenta.');
}
async function perform(button,action){button.disabled=true;try{await action();}catch(error){status(error.message);}finally{button.disabled=false;}}
$('signin').addEventListener('submit',event=>{event.preventDefault();const button=event.currentTarget.querySelector('button');perform(button,async()=>{await client.signIn($('email').value,location.origin+'/account.html');status('Solicitud aceptada. Revisa tu correo y abre el enlace en este navegador.');});});
$('github-signin').addEventListener('click',event=>perform(event.currentTarget,async()=>{location.assign(await client.oauthUrl('github',location.origin+'/account.html'));}));
$('signout').addEventListener('click',event=>perform(event.currentTarget,async()=>{try{await client.signOut();}finally{$('member').hidden=true;$('signin').hidden=false;$('oauth').hidden=!client.providers.includes('github');$('favorites').replaceChildren();$('searches').replaceChildren();$('profile').reset();status('Sesión cerrada en esta pestaña.');}}));
$('profile').addEventListener('submit',event=>{event.preventDefault();perform(event.currentTarget.querySelector('button'),async()=>{const active=await client.current();await client.table('user_profiles',{method:'POST',query:'?on_conflict=user_id',headers:{Prefer:'resolution=merge-duplicates'},body:{user_id:active.user.id,country:$('profile-country').value||null,career:$('career').value.trim(),email_type:$('email-type').value}});status('Perfil guardado.');});});
$('saved-search').addEventListener('submit',event=>{event.preventDefault();perform(event.currentTarget.querySelector('button'),async()=>{const active=await client.current();await client.table('user_saved_searches',{method:'POST',body:{user_id:active.user.id,query:$('query').value,country:$('search-country').value}});await listings();status('Búsqueda guardada. El envío de correos aún no está activado.');});});
$('delete-account').addEventListener('submit',event=>{event.preventDefault();perform(event.currentTarget.querySelector('button'),async()=>{const result=await client.deleteAccount($('delete-confirm').value);localStorage.removeItem('nova-saved-offers');$('member').hidden=true;$('signin').hidden=false;$('favorites').replaceChildren();$('searches').replaceChildren();$('profile').reset();$('delete-account').reset();$('signin').reset();status(result.status==='completed'?'Cuenta y datos eliminados. Tus sesiones fueron cerradas.':'Eliminación registrada y acceso a datos bloqueado. El radar completará el borrado de Auth pendiente.');});});
try{client=await configuredClient();if(!client)status('Las cuentas todavía no están activadas. Tus favoritos siguen disponibles en este dispositivo.');else{if(code)await client.callback(code);else await client.restore();await member();}}catch(error){status(error.message);if(client){$('signin').hidden=false;$('oauth').hidden=!client.providers.includes('github');$('member').hidden=true;}}
