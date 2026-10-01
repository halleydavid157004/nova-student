import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {createHeadlessRenderer} from './headless.js';
import {validateOffer} from '../../src/services/liveness.js';

test('real Chromium renders a JS benefit and blocks cross-origin resources',async()=>{
  const browser=await chromium.launch();const requested=[];
  const client={fetch:async url=>{requested.push(url);return {status:200,headers:{'content-type':'text/html'},url,redirects:[],body:readFileSync(new URL('../../test/fixtures/dynamic.html',import.meta.url),'utf8')+'<img src="https://blocked.example/tracker">'};}};
  try{
    const headless=await createHeadlessRenderer(browser,{client});
    const url='https://fixture.example/students', offer={status:'active',reviewed:true,source_url:url,verified_at:new Date().toISOString()};
    const result=await validateOffer(offer,{status:200,url,body:'<main>Loading</main>'},{headless,extract:async()=>({benefit:'Free cloud',value:'100 USD',requirements:[],verification:null,countries:['CO'],expires_at:null,evidence:'students receive a free cloud plan with 100 USD in credits',available:true})});
    assert.equal(result.success,true);assert.equal(result.signals.rendered,true);
    assert.deepEqual(requested,[url]);
  }finally{await browser.close()}
});
