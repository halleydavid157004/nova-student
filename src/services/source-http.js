import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import {isIP} from 'node:net';
import {gunzipSync,inflateSync,brotliDecompressSync} from 'node:zlib';

export const SOURCE_UA = 'NovaStudentRadar/2.3 (+https://github.com/halleydavid157004/nova-student)';
export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export function publicAddress(address) {
  const ip = address.toLowerCase().replace(/^::ffff:/, '');
  if (isIP(ip) === 4) {
    const [a,b,c] = ip.split('.').map(Number);
    return !(a===0 || a===10 || a===127 || a>=224 || (a===169&&b===254) || (a===172&&b>=16&&b<=31) ||
      (a===192&&(b===168||b===0)) || (a===100&&b>=64&&b<=127) || (a===198&&(b===18||b===19||(b===51&&c===100))) || (a===203&&b===0&&c===113));
  }
  // IPv6 globally routable unicast only; exclude documentation and mapped ranges.
  return isIP(ip)===6 && /^[23]/.test(ip) && !ip.startsWith('2001:db8:') && !ip.startsWith('2001:0:') && !ip.startsWith('2002:');
}
export function sourceUrl(value) {
  const u = new URL(value);
  const host = u.hostname.replace(/^\[|\]$/g,'');
  if (!['http:','https:'].includes(u.protocol) || u.username || u.password ||
      (u.port && !['80','443'].includes(u.port)) || host==='localhost' || host.endsWith('.localhost') ||
      host.endsWith('.local') || (isIP(host) && !publicAddress(host))) throw new Error('unsafe_url');
  u.hash=''; return u;
}

// DNS resolution is checked INSIDE the socket lookup, avoiding a second,
// unchecked resolution between validation and connection.
export function publicRequest(value) {
  const u = sourceUrl(value);
  return new Promise((resolve,reject) => {
    const request = (u.protocol==='https:'?https:http).request(u, {
      method:'GET', headers:{'user-agent':SOURCE_UA,'accept-language':'es,en;q=0.8','accept-encoding':'identity'},
      lookup(host,options,callback) {
        dns.lookup(host,{all:true},(error,addresses)=>{
          if(error)return callback(error);
          if(!addresses.length || addresses.some(row=>!publicAddress(row.address)))return callback(new Error('unsafe_address'));
          return options?.all ? callback(null,addresses) : callback(null,addresses[0].address,addresses[0].family);
        });
      },
    }, response => {
      const chunks=[];let bytes=0;
      response.on('data',chunk=>{
        bytes+=chunk.length;
        if(bytes>2*1024*1024)response.destroy(new Error('body_limit'));else chunks.push(chunk);
      });
      response.on('error',reject);
      response.on('end',()=>{
        try{let body=Buffer.concat(chunks);const encoding=response.headers['content-encoding'];
          const decode={gzip:gunzipSync,deflate:inflateSync,br:brotliDecompressSync}[encoding];
          if(decode)body=decode(body,{maxOutputLength:2*1024*1024});
          else if(encoding&&encoding!=='identity')throw new Error('unsupported_encoding');
          resolve({status:response.statusCode,headers:response.headers,body:body.toString('utf8'),url:u.href});
        }catch(error){reject(error)}
      });
    });
    const timer=setTimeout(()=>request.destroy(new Error('source_timeout')),20000);
    request.on('close',()=>clearTimeout(timer));request.on('error',reject);request.end();
  });
}

const canonicalPath = value => value.replace(/%[0-9a-f]{2}/gi, part => {
  const c=String.fromCharCode(parseInt(part.slice(1),16));return /[A-Za-z0-9._~-]/.test(c)?c:part.toUpperCase();
});
export function robotsPolicy(text, target) {
  const groups=[];let group={agents:[],rules:[],delay:0}, rulesStarted=false;
  const finish=()=>{if(group.agents.length)groups.push(group);group={agents:[],rules:[],delay:0};rulesStarted=false};
  for(const raw of String(text).split(/\r?\n/)) {
    const line=raw.split('#')[0].trim(), colon=line.indexOf(':');if(colon<0)continue;
    const key=line.slice(0,colon).toLowerCase(), value=line.slice(colon+1).trim();
    if(key==='user-agent'){if(rulesStarted)finish();group.agents.push(value.toLowerCase());}
    else if(group.agents.length){rulesStarted=true;if(['allow','disallow'].includes(key)&&value)group.rules.push({allow:key==='allow',path:canonicalPath(value)});
      if(key==='crawl-delay'&&Number(value)>0)group.delay=Number(value)*1000;}
  }
  finish();
  const specificity=g=>Math.max(0,...g.agents.filter(a=>a!=='*'&&'novastudentradar'.includes(a)).map(a=>a.length));
  const longest=Math.max(0,...groups.map(specificity));
  const selected=longest?groups.filter(g=>specificity(g)===longest):groups.filter(g=>g.agents.includes('*'));
  const path=canonicalPath(new URL(target).pathname+new URL(target).search);let winner;
  for(const rule of selected.flatMap(g=>g.rules)) {
    const pattern=rule.path.replace(/[.+?^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*').replace(/\\\$$/,'$');
    if(new RegExp('^'+pattern).test(path) && (!winner || rule.path.length>winner.path.length || (rule.path.length===winner.path.length&&rule.allow)))winner=rule;
  }
  return {allowed:!winner||winner.allow,delay:Math.max(1100,...selected.map(g=>g.delay))};
}

export function createSourceClient({request=publicRequest,wait=sleep}={}) {
  const robots=new Map(), queues=new Map(), last=new Map();
  async function paced(url,delay=1100) {
    const origin=sourceUrl(url).origin, previous=queues.get(origin)||Promise.resolve();
    const task=previous.catch(()=>{}).then(async()=>{
      await wait(Math.max(0,(last.get(origin)||0)+delay-Date.now()));
      for(let attempt=0;attempt<2;attempt++) {
        last.set(origin,Date.now());const result=await request(url);
        const raw=result.headers?.['retry-after'];const numeric=Number(raw);
        const retry=raw && (Number.isFinite(numeric)?numeric*1000:Date.parse(raw)-Date.now());
        if(![429,502,503,504].includes(result.status)||attempt===1||retry>30000)return {...result,...(retry>0?{retryAfterMs:retry}:{})};
        await wait(Math.max(delay,1000*2**attempt,retry||0));
      }
    });
    queues.set(origin,task);try{return await task}finally{if(queues.get(origin)===task)queues.delete(origin)}
  }
  async function policy(url) {
    const origin=sourceUrl(url).origin;
    let cached=robots.get(origin);
    if(!cached || cached.until<Date.now()) {
      const pending=(async()=>{
        let current=origin+'/robots.txt';
        for(let n=0;n<=5;n++) {
          const response=await paced(current);
          if([301,302,303,307,308].includes(response.status)&&response.headers?.location){current=sourceUrl(new URL(response.headers.location,current)).href;continue;}
          if(response.status>=500||response.status===429||[401,403].includes(response.status)||/captcha|verify you are human|just a moment/i.test(response.body||''))throw new Error('robots_unreachable');
          return response.status>=400?'':response.body;
        }
        throw new Error('robots_redirects');
      })().catch(()=>null);
      cached={until:Date.now()+3600000,pending};robots.set(origin,cached);
      if(robots.size>1000)robots.delete(robots.keys().next().value);
    }
    const text=await cached.pending;
    return text===null?{allowed:false,reason:'robots_unreachable'}:robotsPolicy(text,url);
  }
  return {
    policy,
    async fetch(value) {
      let url=sourceUrl(value).href;const redirects=[];
      for(let n=0;n<=5;n++) {
        const rules=await policy(url);
        if(!rules.allowed)return {status:0,body:'',url,redirects,blocked:rules.reason||'robots'};
        if(rules.delay>60000)return {status:0,body:'',url,redirects,blocked:'crawl_delay_long',retryAfterMs:rules.delay};
        const response=await paced(url,rules.delay);
        if([301,302,303,307,308].includes(response.status)&&response.headers?.location){const next=sourceUrl(new URL(response.headers.location,url)).href;redirects.push({from:url,to:next,status:response.status});url=next;continue;}
        return {...response,url,redirects};
      }
      throw new Error('redirect_limit');
    },
  };
}
export const sourceClient=createSourceClient();
