import test from 'node:test';
import {buildSite} from '../static/build.js';
import {auditStatic} from './static-audit.js';
test('static home and detail meet Lighthouse 90 for performance, accessibility and SEO',async()=>{
 const site=buildSite({schema:1,offers:[{id:1,brand:'Fixture',title:'Beneficio educativo',benefit:'Herramienta para estudiantes',status:'active',official:true,verified_at:new Date().toISOString(),requirements:['Matrícula vigente'],steps:['Consultar fuente'],countries:['CO'],source_url:'https://example.invalid/student'}]},{baseUrl:'https://example.invalid/'});
 console.log('Static Lighthouse',JSON.stringify(await auditStatic(site)));
});

test('static browser: catalog index, combined filters and an offer detail',async()=>{
 const {createServer}=await import('node:http');const {chromium}=await import('playwright');const assert=(await import('node:assert/strict')).default;
 const stamp=new Date().toISOString();
 const site=buildSite({schema:1,offers:[{id:1,brand:'AWS',title:'Créditos de nube',benefit:'Cloud para estudiantes',category:'Cloud',verification:'Educational email',status:'active',official:true,verified_at:stamp,countries:['CO'],requirements:['Correo institucional'],source_url:'https://example.invalid/student'},{id:2,brand:'Notion',title:'Plan de notas',category:'Productivity',status:'active',official:true,verified_at:stamp,countries:['GLOBAL']}]},{baseUrl:'https://example.invalid/'});
 const server=createServer((req,res)=>{const name=new URL(req.url,'http://localhost').pathname.slice(1);const key=name.endsWith('/')?name+'index.html':name||'index.html';const file=site.files.get(key);res.writeHead(file===undefined?404:200,{'Content-Type':key.endsWith('.js')?'text/javascript':key.endsWith('.css')?'text/css':key.endsWith('.json')?'application/json':'text/html'});res.end(file);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{browser=await chromium.launch();const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());await page.goto(`http://127.0.0.1:${server.address().port}/`);
 await page.waitForFunction(()=>document.querySelectorAll('#country option').length===250);
 await page.fill('#busqueda','nueb');await page.selectOption('#category','Cloud');await page.selectOption('#email','educational');await page.check('#week');await page.selectOption('#country','MX');assert.equal(await page.locator('[data-offer]:visible').count(),0);
 await page.selectOption('#country','CO');assert.equal(await page.locator('[data-offer]:visible').count(),1);
 await page.locator('[data-offer]:visible h2 a').click();await page.waitForSelector('h1');assert.equal(await page.locator('h1').textContent(),'Créditos de nube');assert.equal(errors.length,0);
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
});
