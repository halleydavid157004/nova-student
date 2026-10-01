export async function initPreferences(doc,{location=globalThis.location,history=globalThis.history,fetcher=globalThis.fetch}={}){
 const params=new URLSearchParams(location.hash.slice(1));const purpose=['confirm','unsubscribe','preferences'].find(k=>params.has(k)),token=purpose?params.get(purpose):null;
 history.replaceState(null,'',location.pathname); // Before any API call or other resource request.
 const status=doc.getElementById('status'),confirm=doc.getElementById('confirm'),unsubscribe=doc.getElementById('unsubscribe'),list=doc.getElementById('alerts');
 confirm.hidden=true;unsubscribe.hidden=true;confirm.disabled=false;unsubscribe.disabled=false;list.replaceChildren();doc.getElementById('preview').textContent='';
 const post=async(action,extra={})=>{const r=await fetcher('/api/subscriptions/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,...extra}),credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error('Enlace inválido, vencido o servicio no disponible. Solicita uno nuevo o usa el contacto del aviso.');return r.json();};
 if(!token||token.length>1024){status.textContent='Abre el enlace privado recibido por correo.';return;}
 const act=(button,action,done)=>{button.onclick=async()=>{button.disabled=true;try{await post(action);status.textContent=done;button.hidden=true;}catch(e){status.textContent=e.message;button.disabled=false;}};};
 if(purpose==='confirm'){
  try{const a=await post('preview');doc.getElementById('preview').textContent=`Alerta: ${a.query||'Todos los beneficios'} · ${a.country} · ${a.frequency}`;confirm.hidden=false;status.textContent='Confirma solo si solicitaste esta alerta.';act(confirm,'confirm','Alerta confirmada. Los futuros digests respetarán tu frecuencia y el presupuesto disponible.');}catch(e){status.textContent=e.message;}
 }else if(purpose==='unsubscribe'){
  unsubscribe.hidden=false;status.textContent='Confirma la baja de todos los correos de Nova Student.';act(unsubscribe,'unsubscribe','Baja registrada. No se programarán nuevos digests.');
 }else{
  try{
   const data=await post('preferences');status.textContent=data.status==='confirmed'?'Tus alertas confirmadas.':'Tu suscripción no está activa.';
   for(const a of data.alerts){
    const row=doc.createElement('form'),title=doc.createElement('h2');title.textContent=a.query||'Todos los beneficios';row.append(title);
    const label=doc.createElement('label'),toggle=doc.createElement('input');toggle.type='checkbox';toggle.checked=a.enabled&&a.confirmed;toggle.disabled=!a.confirmed||data.status!=='confirmed';label.append(toggle,doc.createTextNode(' Recibir esta alerta'));row.append(label);
    const frequencyLabel=doc.createElement('label');frequencyLabel.textContent='Frecuencia';const select=doc.createElement('select');select.setAttribute('aria-label','Frecuencia de '+(a.query||'todos los beneficios'));for(const [value,text] of [['daily','Diaria'],['weekly','Semanal'],['instant','Cada ciclo del radar']]){const option=doc.createElement('option');option.value=value;option.textContent=text;select.append(option);}select.value=a.frequency;frequencyLabel.append(select);row.append(frequencyLabel);
    const button=doc.createElement('button');button.textContent='Guardar preferencias';row.append(button);
    row.addEventListener('submit',async e=>{e.preventDefault();button.disabled=true;try{await post('update',{alert_id:a.id,enabled:toggle.checked,frequency:select.value});status.textContent='Preferencias guardadas.';}catch(err){status.textContent=err.message;}finally{button.disabled=false;}});list.append(row);
   }
  }catch(e){status.textContent=e.message;}
 }
}
if(typeof document!=='undefined'){initPreferences(document);globalThis.addEventListener('hashchange',()=>initPreferences(document));}
