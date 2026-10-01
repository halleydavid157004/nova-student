(async()=>{try{
 // Automatic domain checks are opt-in; popup checks only run on user request.
 const settings=await chrome.storage.local.get({radarNotice:false});if(!settings.radarNotice)return;
 const response=await chrome.runtime.sendMessage({type:'nova-domain',domain:location.hostname});if(!response?.offers?.length||response.error)return;
 const offer=response.offers[0];if(!Number.isSafeInteger(offer.id)||offer.id<1)return;
 const button=document.createElement('button');button.textContent='🎓 Beneficio estudiantil';Object.assign(button.style,{position:'fixed',right:'18px',bottom:'18px',zIndex:'2147483647',border:'0',borderRadius:'999px',padding:'11px 14px',background:'#6d4aff',color:'white',font:'600 12px Arial',cursor:'pointer'});button.addEventListener('click',()=>window.open(response.apiOrigin+'/?offer='+offer.id,'_blank','noopener,noreferrer'));document.documentElement.append(button);
}catch{}})();
