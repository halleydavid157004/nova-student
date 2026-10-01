importScripts('config.js');
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
 if(sender.id!==chrome.runtime.id||message?.type!=='nova-domain'||typeof message.domain!=='string'||message.domain.length>253||!/^[a-z0-9.-]+$/i.test(message.domain))return;
 // No page URL, query parameters, credentials or account identifiers are forwarded.
 fetch(NOVA_CONFIG.apiOrigin+'/api/domain-offers?domain='+encodeURIComponent(message.domain),{credentials:'omit',signal:AbortSignal.timeout(15000)}).then(async response=>{if(!response.ok)throw new Error();const data=await response.json();reply({offers:(Array.isArray(data.offers)?data.offers:[]).slice(0,20),apiOrigin:NOVA_CONFIG.apiOrigin});}).catch(()=>reply({error:true,offers:[]}));return true;
});
