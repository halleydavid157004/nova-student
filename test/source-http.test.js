import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceUrl,publicAddress,robotsPolicy,createSourceClient} from '../src/services/source-http.js';
test('unsafe addresses, credentials and ports are rejected, including mapped IPv6',()=>{
  for(const url of ['http://127.0.0.1/a','http://10.0.0.1','http://169.254.169.254','http://[::1]/','http://[::ffff:127.0.0.1]/','https://user:pass@vendor.example','file:///etc/passwd','https://vendor.example:9999'])assert.throws(()=>sourceUrl(url));
  assert.equal(publicAddress('8.8.8.8'),true);assert.equal(publicAddress('2001:4860:4860::8888'),true);assert.equal(publicAddress('192.168.1.1'),false);
});
test('robots agent groups, longest rule, allow ties, wildcards and encoded paths',()=>{
  const robots='User-agent: *\nDisallow: /\nUser-agent: NovaStudentRadar\nDisallow: /students\nAllow: /students/open\nDisallow: /*private$\nCrawl-delay: 3';
  assert.equal(robotsPolicy(robots,'https://vendor.example/students/open').allowed,true);
  assert.equal(robotsPolicy(robots,'https://vendor.example/%73tudents/closed').allowed,false);
  assert.equal(robotsPolicy(robots,'https://vendor.example/a-private').allowed,false);
  assert.equal(robotsPolicy(robots,'https://vendor.example/a').delay,3000);
  assert.equal(robotsPolicy('User-agent: *\nDisallow: /same\nAllow: /same','https://vendor.example/same').allowed,true);
});
test('redirect destinations honor robots and private targets never connect',async()=>{
  const visited=[];const client=createSourceClient({wait:async()=>{},request:async url=>{
    visited.push(url);if(url==='https://vendor.example/robots.txt')return {status:200,body:'User-agent: *\nAllow: /'};
    if(url==='https://other.example/robots.txt')return {status:200,body:'User-agent: *\nDisallow: /'};
    return {status:302,headers:{location:'https://other.example/students'}};
  }});
  assert.equal((await client.fetch('https://vendor.example/students')).blocked,'robots');
  assert.ok(!visited.includes('https://other.example/students'));
  const unsafe=createSourceClient({wait:async()=>{},request:async url=>url.endsWith('/robots.txt')?{status:404,body:''}:{status:302,headers:{location:'http://127.0.0.1/'}}});
  await assert.rejects(unsafe.fetch('https://vendor.example/student'),/unsafe_url/);
});
test('robots network errors fail closed; retry backoff honors long Retry-After',async()=>{
  let calls=0;const closed=createSourceClient({wait:async()=>{},request:async()=>{calls++;throw new Error('network')}});
  assert.equal((await closed.fetch('https://vendor.example/students')).blocked,'robots_unreachable');assert.equal(calls,1);
  const waits=[];let attempts=0;const retry=createSourceClient({wait:async n=>waits.push(n),request:async url=>{
    if(url.endsWith('/robots.txt'))return {status:404,body:''};attempts++;return {status:503,body:'',headers:{'retry-after':'120'}};
  }});
  assert.equal((await retry.fetch('https://vendor.example/students')).status,503);assert.equal(attempts,1);assert.ok(waits.every(n=>n<=30000));
});
