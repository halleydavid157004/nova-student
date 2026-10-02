import {configuredClient} from '../accounts/client.js?v=3';
import {reviewDiff} from './policy.js';
const $=id=>document.getElementById(id),status=message=>{$('admin-status').textContent=message;};
const titles={queue:'Cola de revisión',sources:'Fuentes',audit:'Registro de acciones'};
let client,section='queue',after=0,busy=false;
const node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=typeof text==='string'?text:JSON.stringify(text,null,2);return n;};
function link(value){try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password)return node('p','URL no disponible');const a=node('a','Consultar fuente');a.href=u.href;a.target='_blank';a.rel='noopener noreferrer';return a;}catch{return node('p','URL no disponible');}}
async function request(input){
 const active=await client.current();if(!active)throw new Error('Inicia sesión con una cuenta administradora.');
 const r=await fetch('/api/admin/review'+(input?'':'?section='+section+'&after='+after),{method:input?'POST':'GET',headers:{Authorization:'Bearer '+active.access_token,...(input?{'Content-Type':'application/json'}:{})},...(input?{body:JSON.stringify(input)}:{}),credentials:'omit',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(30000)});
 const data=await r.json();if(!r.ok)throw new Error(data.error||'No se pudo completar la operación.');return data;
}
function reason(form){const label=node('label','Motivo de la decisión (10 a 500 caracteres)');const input=node('textarea');input.name='reason';input.required=true;input.minLength=10;input.maxLength=500;label.append(input);form.append(label);return input;}
function button(form,text,action){const b=node('button',text);b.type='submit';b.name='action';b.value=action;form.append(b);return b;}
function offerCard(item){
 const o=item.offer,article=node('article');article.append(node('h3',o.title),link(o.source_url),node('p',`Estado: ${o.status} · Puntaje: ${item.check?.score??'sin datos'} · Verificación: ${item.check?.checked_at??'sin datos'}`));
 if(item.auto_approved)article.append(node('p','Publicada automáticamente por el radar (fuente oficial con evidencia fuerte). Recházala si no corresponde.'));
 if(item.version?.evidence)article.append(node('blockquote',item.version.evidence));
 const details=node('details');details.append(node('summary','Diferencias entre versión aprobada y extraída'));
 const table=node('table'),head=node('tr');for(const value of ['Campo','Aprobado','Extraído'])head.append(node('th',value));table.append(head);
 for(const diff of reviewDiff(item.approved,item.version?.extraction)){const row=node('tr');row.append(node('th',diff.field),node('td',diff.before??'—'),node('td',diff.after??'—'));table.append(row);}details.append(table);article.append(details);
 const signals=node('details');signals.append(node('summary','Señales de la verificación'),node('pre',item.check?.signals||{}));article.append(signals);
 for(const problem of item.problems||[])article.append(node('p',problem));if(item.duplicates?.length)article.append(node('p','Duplicada de las fichas: '+item.duplicates.join(', ')));
 const form=node('form'),why=reason(form),label=node('label'),confirm=node('input');confirm.type='checkbox';confirm.name='confirm_source';label.append(confirm,document.createTextNode(' Revisé la fuente, los países, el beneficio y sus requisitos; la información extraída es correcta.'));form.append(label);
 const actions=node('div');actions.className='actions';const approve=button(actions,'Aprobar','approve');approve.disabled=!!item.problems?.length||!!item.duplicates?.length;button(actions,'Rechazar','reject');form.append(actions);
 form.addEventListener('submit',async event=>{event.preventDefault();const action=event.submitter.value;if(action==='approve'&&!confirm.checked){status('Confirma la revisión de la fuente.');return;}await act({action,id:o.id,expected_updated_at:o.updated_at,check_id:item.check?.id,reason:why.value,confirm_source:confirm.checked});});article.append(form);
 const edit=node('details');edit.append(node('summary','Editar título y pasos'));const editForm=node('form'),titleLabel=node('label','Título'),title=node('input');title.value=o.title;title.required=true;title.maxLength=200;titleLabel.append(title);editForm.append(titleLabel);const stepsLabel=node('label','Pasos (uno por línea)'),steps=node('textarea');steps.value=(o.steps||[]).join('\n');steps.maxLength=10000;stepsLabel.append(steps);editForm.append(stepsLabel);const editReason=reason(editForm);button(editForm,'Guardar edición','edit');editForm.addEventListener('submit',async e=>{e.preventDefault();await act({action:'edit',id:o.id,expected_updated_at:o.updated_at,title:title.value,steps:steps.value.split('\n').map(s=>s.trim()).filter(Boolean),reason:editReason.value});});edit.append(editForm);article.append(edit);return article;
}
function sourceCard(s){const article=node('article');article.append(node('h3',s.name),link(s.url),node('p',s.enabled?'Escaneo habilitado':'Escaneo deshabilitado'));const form=node('form'),why=reason(form);button(form,s.enabled?'Deshabilitar':'Habilitar','source');form.addEventListener('submit',async e=>{e.preventDefault();await act({action:'source',id:s.id,expected_updated_at:s.updated_at,enabled:!s.enabled,reason:why.value});});article.append(form);return article;}
const ACTION_LABELS={approve:'Aprobada',reject:'Rechazada',edit:'Editada',source:'Fuente',auto_approve:'Aprobada automáticamente'};
function auditCard(a){const article=node('article');article.append(node('h3',ACTION_LABELS[a.action]||a.action),node('p',`${a.created_at} · Oferta ${a.offer_id??'—'} · Fuente ${a.source_id??'—'}`),node('p',a.reason),node('pre',a.details));return article;}
async function load(){
 $('more').hidden=true;status('Consultando '+titles[section].toLowerCase()+'…');
 const data=await request();$('section-title').textContent=titles[section];$('items').replaceChildren(...data.items.map(section==='queue'?offerCard:section==='sources'?sourceCard:auditCard));$('admin-panel').hidden=false;
 const last=data.items.at(-1);$('more').hidden=data.items.length<50;$('more').dataset.cursor=String(last?.offer?.id||last?.id||0);status(data.items.length?`${data.items.length} registros en esta página.`:'No hay registros en esta página.');
}
async function act(input){if(busy)return;busy=true;let succeeded=false;for(const b of document.querySelectorAll('button'))b.disabled=true;try{await request(input);status('Acción registrada.');await load();succeeded=true;}catch(error){status(error.message);}finally{busy=false;for(const b of document.querySelectorAll('nav button,#more'))b.disabled=false;/* Reload before another decision, even after an uncertain outcome. */if(!succeeded)for(const b of document.querySelectorAll('form button'))b.disabled=true;}}
for(const b of document.querySelectorAll('[data-section]'))b.addEventListener('click',async()=>{if(busy)return;section=b.dataset.section;after=0;try{await load();}catch(e){status(e.message);}});
$('more').addEventListener('click',async()=>{if(busy)return;after=Number($('more').dataset.cursor);try{await load();}catch(e){status(e.message);}});
try{client=await configuredClient();if(!client){status('Las cuentas todavía no están activadas.');$('admin-login').hidden=false;}else if(!await client.restore()){$('admin-login').hidden=false;status('Inicia sesión con una cuenta administradora.');}else await load();}catch(e){status(e.message);$('admin-login').hidden=false;}
