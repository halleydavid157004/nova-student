import test from 'node:test';
import assert from 'node:assert/strict';
import {createWebCatalog} from '../src/services/web-catalog.js';
import {publicCatalog} from '../src/services/catalog-export.js';
import {verificationInfo} from '../public/search/quality.js';

test('web catalog cache rebuilds on withdrawals, expiry and public changes',()=>{
 const render=createWebCatalog(),now=new Date().toISOString();
 const offer={id:1,brand:'Test',title:'Beneficio',benefit:'Plan gratis',status:'active',official:true,verified_at:now,source_url:'https://example.org/student',email:'private@example.invalid'};
 const first=render([offer]);assert.equal(first.offers,1);
 assert.equal(render([{...offer,email:'another@example.invalid'}]),first);
 assert.notEqual(render([{...offer,benefit:'Plan con descuento'}]),first);
 assert.equal(render([{...offer,status:'expired'}]).offers,0);
 assert.equal(render([{...offer,expires_at:'2000-01-01'}]).offers,0);
 assert.equal(render([{...offer,verified_at:'2999-01-01'}]).offers,0);
 assert.match(first.files.get('sitemap.xml'),/onrender.com\/catalogo\/ofertas/);
 assert.ok(![...first.files.values()].join('').includes('private@example.invalid'));
});

test('public projection preserves a pending trust review through static generation',()=>{
 const now=new Date().toISOString();
 const offer={id:1,brand:'Test',status:'active',official:true,source_trust:'unconfirmed',verified_at:now,liveness_verified_at:now,liveness_status:'active',source_excerpt:'Evidence from the current source page'};
 const projected=publicCatalog([offer]).offers[0];
 assert.equal(verificationInfo(projected).state,'needs_review');
 const site=createWebCatalog()([offer]);
 assert.match(site.files.get('index.html'),/Comprobación en revisión/);
 assert.ok(!site.files.get('index.html').includes('Comprobada con evidencia'));
});
