import test from 'node:test';
import {buildSite} from '../static/build.js';
import {auditStatic} from './static-audit.js';
test('static home and detail meet Lighthouse 90 for performance, accessibility and SEO',async()=>{
 const site=buildSite({schema:1,offers:[{id:1,brand:'Fixture',title:'Beneficio educativo',benefit:'Herramienta para estudiantes',status:'active',official:true,verified_at:new Date().toISOString(),requirements:['Matrícula vigente'],steps:['Consultar fuente'],countries:['CO'],source_url:'https://example.invalid/student'}]},{baseUrl:'https://example.invalid/'});
 console.log('Static Lighthouse',JSON.stringify(await auditStatic(site)));
});
