import {createHash} from 'node:crypto';
import {publicCatalog} from './catalog-export.js';
import {buildSite} from './static-site.js';
import {PUBLIC_ORIGIN} from './subscriptions.js';
// Shared generator: no browser dependencies or user data on Render.
export function createWebCatalog(){
 let cached;
 return offers=>{
  const catalog=publicCatalog(offers);const key=createHash('sha256').update(JSON.stringify(catalog.offers)).digest('hex');
  if(!cached||cached.key!==key)cached={key,site:buildSite(catalog,{baseUrl:PUBLIC_ORIGIN+'/catalogo/'})};
  return cached.site;
 };
}
