import test from 'node:test';
import assert from 'node:assert/strict';
import {createSearchIndex,gapTopics,emailRequirement} from '../public/search/engine.js';
import {COUNTRY_CODES} from '../public/search/countries.js';
const base={status:'active',official:true,countries:['GLOBAL'],verified_at:new Date().toISOString(),confidence:90};
const offers=[
 {...base,id:1,brand:'Notion',title:'Plan educativo',summary:'Organización y notas gratis',category:'Productivity',verification:'Educational email'},
 {...base,id:2,brand:'Figma',title:'Diseño colaborativo',category:'Design',requirements:['Correo institucional'],verification:'Student ID'},
 {...base,id:3,brand:'Adobe',title:'Creative Cloud para estudiantes',category:'Design',verification:'SheerID'},
 {...base,id:4,brand:'GitHub Copilot',title:'Inteligencia artificial para código',category:'AI',verification:'GitHub Education'},
 {...base,id:5,brand:'AWS',title:'Créditos de cloud y almacenamiento',category:'Cloud',verification:'Educational email',countries:['CO']},
 {...base,id:6,brand:'JetBrains',title:'Herramientas de programación',category:'Development',verification:'Student ID'},
 {...base,id:7,brand:'Canva',title:'Diseño educativo',category:'Design',verification:'School verification'},
 {...base,id:8,brand:'Coursera',title:'Cursos para aprender',category:'Education',verification:'Any email'},
 {...base,id:9,brand:'Proton',title:'VPN y privacidad',category:'Security',verification:'No email required'},
 {...base,id:10,brand:'Notion alternative',title:'Integración de Notion',category:'Productivity'},
 {...base,id:11,brand:'Unreviewed',official:false,reviewed:false,title:'Figma ilimitado',category:'Design'},
];
const index=createSearchIndex(offers);
const expected=[['notion',1],['notoin',1],['notio',1],['NOTIÓN',1],['organizacion',1],['notas',1],['productividad',1],['figma',2],['figam',2],['fig',2],['diseno',2],['diseño',2],['design',2],['adobe',3],['adob',3],['creative',3],['copilot',4],['copliot',4],['IA',4],['AI',4],['inteligencia artificial',4],['artificial intelligence',4],['aws',5],['nube',5],['hosting',5],['almacenamiento',5],['jetbrains',6],['jetbranis',6],['programacion',6],['coding',6],['canva',7],['canav',7],['coursera',8],['cursos',8],['learning',8],['proton',9],['vpn',9],['privacidad',9]];
for(const [q,id] of expected)test('relevance: '+q,()=>{assert.equal(index.search({q})[0]?.id,id);});
test('combined filters, temporal decay, publication and email uncertainty',()=>{
 assert.equal(COUNTRY_CODES.length,249);assert.equal(new Set(COUNTRY_CODES).size,249);assert.ok(COUNTRY_CODES.includes('CO'));assert.ok(!COUNTRY_CODES.includes('XK'));
 assert.equal(index.search({q:'nube',country:'MX'}).some(o=>o.id===5),false);
 assert.deepEqual(index.search({q:'aws',country:'CO',category:'Cloud',verification:'Educational email',email:'educational',week:true}).map(o=>o.id),[5]);
 assert.equal(index.search({email:'none'}).some(o=>o.id===9),true);assert.equal(emailRequirement(offers[3]),'unknown');
 assert.equal(index.search({email:'educational'}).some(o=>o.id===3),false);
 assert.equal(index.search({q:'figma'}).some(o=>o.id===11),false);
 const expired=createSearchIndex([{...base,id:99,title:'Old',verified_at:'2000-01-01'}]);assert.equal(expired.search().length,0);
 assert.equal(index.search({q:'notion',week:true,now:Date.now()+8*86400000}).length,0);
 assert.ok(index.suggestions('notino').includes('notion'));assert.ok(!index.suggestions('unreviewed').includes('unreviewed'));
 assert.doesNotThrow(()=>createSearchIndex([{...base,id:55,brand:'Safe',tags:'malformed',requirements:'malformed'}]));
 assert.deepEqual(gapTopics('correo nombre@privado.com teléfono 3001234567'),['email']);
 assert.deepEqual(gapTopics('nombre personal desconocido 123456789'),[]);
});
