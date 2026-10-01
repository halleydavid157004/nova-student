const results=document.querySelector('#results');
const text=message=>{results.replaceChildren();const node=document.createElement('p');node.className='empty';node.textContent=message;results.append(node);};
chrome.tabs.query({active:true,currentWindow:true},async tabs=>{try{
 const url=new URL(tabs[0]?.url);if(!['https:','http:'].includes(url.protocol))throw new Error();document.querySelector('#domain').textContent=url.hostname;
 const response=await chrome.runtime.sendMessage({type:'nova-domain',domain:url.hostname});if(response?.error)throw new Error();results.replaceChildren();
 for(const offer of response.offers){if(!Number.isSafeInteger(offer.id)||offer.id<1)continue;const div=document.createElement('div'),title=document.createElement('b'),benefit=document.createElement('p'),link=document.createElement('a');div.className='deal';title.textContent=offer.title;benefit.textContent=offer.benefit;link.href=NOVA_CONFIG.apiOrigin+'/?offer='+offer.id;link.textContent='Consultar ficha y requisitos ↗';link.target='_blank';link.rel='noopener noreferrer';div.append(title,benefit,link);results.append(div);}
 if(!results.children.length)text('No hay beneficios publicados para este dominio todavía.');
}catch{text('Abre una página web o vuelve a intentar cuando Nova esté disponible.');}});
const account=document.querySelector('#account');account.href=NOVA_CONFIG.apiOrigin+'/account.html';
chrome.storage.local.get({radarNotice:false},settings=>{document.querySelector('#notice').checked=settings.radarNotice;});
document.querySelector('#notice').addEventListener('change',event=>chrome.storage.local.set({radarNotice:event.target.checked}));
