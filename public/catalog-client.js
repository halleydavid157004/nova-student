import {createSearchIndex,gapTopics} from './search/engine.js';
import {countryOptions} from './search/countries.js';
export async function initStaticSearch(doc,catalog){
 const items=[...doc.querySelectorAll('[data-offer]')],search=doc.getElementById('busqueda');
 const days=Number(doc.querySelector('meta[name="nova-max-age"]')?.content)||14;
 const index=createSearchIndex(catalog.offers,{maxAge:days});
 const select=(id,values)=>{const control=doc.getElementById(id);if(!control)return;for(const [value,label] of values){const option=doc.createElement('option');option.value=value;option.textContent=label;control.append(option);}};
 select('country',countryOptions().map(c=>[c.code,c.name]));
 for(const key of ['category','verification'])select(key,[...new Set(catalog.offers.map(o=>o[key]).filter(Boolean))].sort().map(x=>[x,x]));
 let timer,lastTopics='';
 function update(){
  const filters={q:search?.value||'',email:doc.getElementById('email')?.value||'ALL',week:doc.getElementById('week')?.checked||false,cross:doc.getElementById('cross')?.checked||false};
  for(const key of ['country','category','verification'])filters[key]=doc.getElementById(key)?.value||'ALL';
  const found=index.search(filters),ids=new Set(found.map(o=>String(o.id)));
  for(const item of items){item.hidden=!ids.has(item.dataset.id);const offer=catalog.offers.find(o=>String(o.id)===item.dataset.id);let note=item.querySelector('[data-regional-note]');if(!note){note=doc.createElement('p');note.dataset.regionalNote='';item.append(note);}const foreign=offer&&filters.country!=='ALL'&&!(offer.countries||[]).includes('GLOBAL')&&!(offer.countries||[]).includes(filters.country);note.textContent=foreign?'Oferta de otro país: comprueba residencia, matrícula y requisitos.':'';note.hidden=!foreign;}
  const grid=doc.getElementById('offersGrid');if(grid)for(const o of found){const card=items.find(item=>item.dataset.id===String(o.id));if(card)grid.append(card);}
  const result=doc.getElementById('resultados');if(result)result.textContent=found.length+' beneficios disponibles';
  const empty=doc.getElementById('vacio');if(empty)empty.hidden=found.length>0;
  const status=doc.getElementById('vigencia');if(status&&items[0]?.hidden)status.textContent='Esta ficha requiere una nueva verificación. Consulta la fuente para conocer su estado actual.';
  const hints=doc.getElementById('sugerencias');if(hints){hints.replaceChildren();if(!found.length)for(const term of index.suggestions(filters.q)){const button=doc.createElement('button');button.textContent='Buscar '+term;button.addEventListener('click',()=>{search.value=term;update();});hints.append(button);}}
  clearTimeout(timer);if(search&&!found.length&&filters.q){const topics=gapTopics(filters.q),key=topics.join(',');if(topics.length&&key!==lastTopics)timer=setTimeout(()=>{lastTopics=key;fetch('https://nova-student-radar.onrender.com/api/search-gap',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({topics}),credentials:'omit'}).catch(()=>{});},1500);}
 }
 search?.addEventListener('input',update);
 for(const id of ['country','category','verification','email','week','cross'])doc.getElementById(id)?.addEventListener('change',update);
 update();return {update,index,dispose(){clearTimeout(timer);}};
}
if(typeof document!=='undefined')fetch(new URL('catalog.json',import.meta.url),{cache:'no-cache'}).then(r=>{if(!r.ok)throw new Error('Catalog unavailable');return r.json();}).then(catalog=>initStaticSearch(document,catalog)).catch(()=>{const status=document.getElementById('resultados');if(status)status.textContent='La búsqueda no está disponible. Consulta las fichas y su fecha de verificación.';});
