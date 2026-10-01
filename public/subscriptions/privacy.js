export function renderPrivacy(doc,policy){
 doc.getElementById('privacyStatus').textContent=policy.ready?'Aviso disponible. La autorización de correo es opcional y separada.':'Aviso pendiente de identificar al responsable. No se activan envíos públicos.';
 doc.getElementById('controller').textContent=policy.ready?'Responsable del tratamiento: '+policy.controller:'';
 const contact=doc.getElementById('contact');contact.replaceChildren();
 if(policy.ready){contact.append('Solicitudes sobre tus datos: ');const link=doc.createElement('a');link.href='mailto:'+policy.contact;link.textContent=policy.contact;contact.append(link);}
}
if(typeof document!=='undefined')fetch('/api/privacy',{cache:'no-store',credentials:'omit'}).then(r=>{if(!r.ok)throw new Error();return r.json();}).then(p=>renderPrivacy(document,p)).catch(()=>{document.getElementById('privacyStatus').textContent='No se pudo verificar el aviso. Los envíos siguen pendientes.';});
