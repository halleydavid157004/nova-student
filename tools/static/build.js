// Shared production-safe generator; browser dependencies remain in Actions.
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {buildSite,writeSite} from '../../src/services/static-site.js';
export {buildSite,writeSite};
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){const input=JSON.parse(readFileSync(process.argv[2]||'generated/catalog.json','utf8'));const site=buildSite(input,{baseUrl:process.env.STATIC_BASE_URL});writeSite(site,process.argv[3]||'generated/site');console.log(JSON.stringify({offers:site.offers,bytes:site.bytes}));}
