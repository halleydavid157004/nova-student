import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {buildSite} from '../tools/static/build.js';
const offer=()=>({id:1,brand:'Notion',title:'Notion para estudiantes',benefit:'Plan educativo',status:'active',official:true,verified_at:new Date().toISOString(),countries:['CO','GLOBAL'],requirements:['Correo educativo'],steps:['Verificar matrícula'],source_url:'https://www.notion.so/students?token=private',email:'private@example.invalid',admin_notes:'private-note'});
test('static HTML contains real published offers, details, SEO and no private fields',()=>{
 const input={schema:1,offers:[offer(),{...offer(),id:2,official:false,reviewed:false},{...offer(),id:3,expires_at:'2000-01-01'}]};
 const site=buildSite(input);assert.equal(site.offers,1);
 const page=new JSDOM(site.files.get('index.html')).window.document;
 assert.equal(page.querySelector('article h2').textContent,'Notion para estudiantes');
 const detail=new JSDOM(site.files.get('ofertas/1-notion/index.html')).window.document;
 assert.match(detail.body.textContent,/Correo educativo/);assert.match(detail.body.textContent,/Verificar matrícula/);
 assert.equal(JSON.parse(detail.querySelector('[type="application/ld+json"]').textContent)['@type'],'WebPage');
 assert.ok(page.querySelector('link[rel="canonical"]').href.endsWith('/nova-student/'));
 const all=[...site.files.values()].join('');assert.ok(!all.includes('private@example.invalid'));assert.ok(!all.includes('private-note'));assert.ok(!all.includes('token=private'));
 assert.match(site.files.get('sitemap.xml'),/ofertas\/1-notion/);assert.match(site.files.get('robots.txt'),/Sitemap:/);
 assert.ok(site.bytes<100000);
});
test('untrusted text cannot inject HTML, JSON-LD or filesystem paths',()=>{
 const x={...offer(),title:'</script><img src=x onerror=alert(1)>',slug:'../../etc',requirements:['<script>bad()</script>']};
 const site=buildSite({schema:1,offers:[x]});
 assert.ok(site.files.has('ofertas/1-etc/index.html'));
 const page=new JSDOM(site.files.get('ofertas/1-etc/index.html')).window.document;
 assert.equal(page.querySelectorAll('img').length,0);assert.equal(page.querySelectorAll('script').length,2);
 assert.equal(JSON.parse(page.querySelector('[type="application/ld+json"]').textContent).name,x.title);
 assert.throws(()=>buildSite({schema:1,offers:[{...offer(),id:'../../secret'}]}),/ID/);
 assert.throws(()=>buildSite({schema:1,offers:[offer(),offer()]}),/duplicate/);
});
test('client search handles accents and hides expired or stale cached offers',()=>{
 const site=buildSite({schema:1,offers:[{...offer(),title:'Diseño estudiantil'}]});
 const dom=new JSDOM(site.files.get('index.html'),{runScripts:'outside-only'});
 dom.window.eval(site.files.get('catalog.js'));
 const input=dom.window.document.getElementById('busqueda');input.value='diseno';input.dispatchEvent(new dom.window.Event('input'));
 assert.equal(dom.window.document.querySelector('article').hidden,false);
 input.value='unknown';input.dispatchEvent(new dom.window.Event('input'));assert.equal(dom.window.document.getElementById('vacio').hidden,false);
 const item=dom.window.document.querySelector('article');item.dataset.verified='2000-01-01';dom.window.eval(site.files.get('catalog.js').replaceAll('const ','var '));assert.equal(item.hidden,true);
 dom.window.close();
});
