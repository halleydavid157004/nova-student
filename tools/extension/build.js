import {readFileSync,writeFileSync} from 'node:fs';
export function extensionFiles(settings){const url=new URL(settings.apiOrigin);if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('Invalid production origin');
 const manifest={manifest_version:3,name:'Nova Student Radar',version:'1.1.0',description:'Detecta beneficios estudiantiles publicados y revisados.',permissions:['storage','activeTab'],host_permissions:[url.origin+'/*'],background:{service_worker:'background.js'},action:{default_popup:'popup.html',default_title:'Nova Student'},content_scripts:[{matches:['https://*/*'],js:['content.js'],run_at:'document_idle'}]};
 return {'manifest.json':JSON.stringify(manifest,null,2)+'\n','config.js':'const NOVA_CONFIG = Object.freeze('+JSON.stringify({apiOrigin:url.origin})+');\n'};
}
if(process.argv[1]?.endsWith('/tools/extension/build.js'))for(const [name,text] of Object.entries(extensionFiles(JSON.parse(readFileSync(new URL('../../extension/settings.json',import.meta.url),'utf8')))))writeFileSync(new URL('../../extension/'+name,import.meta.url),text);
