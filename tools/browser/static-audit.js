import {createServer} from 'node:http';
import {chromium} from 'playwright';
import lighthouse from 'lighthouse';
export async function auditStatic(site){
 const server=createServer((req,res)=>{
  const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1);
  const file=name.endsWith('/')?name+'index.html':name||'index.html';
  const body=site.files.get(file);if(body===undefined){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.json')?'application/json':'text/html');res.end(body);
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let browser;
 try{
  browser=await chromium.launch({args:['--remote-debugging-port=9222']});
  const base=`http://127.0.0.1:${server.address().port}/`;
  const pages=['',...[...site.files.keys()].filter(p=>p.startsWith('ofertas/')&&p.endsWith('index.html')).slice(0,1)];
  const scores=[];
  for(const page of pages){const {lhr}=await lighthouse(base+page,{port:9222,output:'json',logLevel:'error',onlyCategories:['performance','accessibility','seo']});
   const row={page,...Object.fromEntries(Object.entries(lhr.categories).map(([key,value])=>[key,value.score]))};scores.push(row);
   for(const [name,score] of Object.entries(row))if(name!=='page'&&(score===null||score<0.9))throw new Error(`Lighthouse ${name} below 90 for ${page||'home'}: ${score}`);
  }
  return scores;
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
}
