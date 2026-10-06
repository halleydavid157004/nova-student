import test from 'node:test';
import assert from 'node:assert/strict';

process.env.GROQ_API_KEY='test-key';
process.env.GROQ_MIN_DELAY_MS='0';
process.env.GROQ_MODEL='unavailable-model';
process.env.GROQ_FALLBACK_MODELS='openai/gpt-oss-20b';
const {chatWithNova,aiStatus,groqChat}=await import('../src/services/groq.js');

test('Groq refuses excess simultaneous work instead of growing an unlimited queue',async()=>{
  const original=globalThis.fetch;
  let release;
  const gate=new Promise(resolve=>{release=resolve});
  globalThis.fetch=async()=>{await gate;return Response.json({choices:[{message:{content:'OK'}}]})};
  const pending=Array.from({length:3},()=>groqChat([{role:'user',content:'fixture'}]));
  try {
    await assert.rejects(groqChat([{role:'user',content:'fixture'}]),{code:'AI_BUSY'});
  } finally {
    release();await Promise.all(pending);globalThis.fetch=original;
  }
  assert.equal(aiStatus().error,null,'overload does not falsely report a provider outage');
});

test('Groq model fallback and structured selection never expose fabricated prose or IDs',async()=>{
 const calls=[],original=globalThis.fetch;
 globalThis.fetch=async(_url,options)=>{const body=JSON.parse(options.body);calls.push(body);if(body.model==='unavailable-model')return new Response('model blocked',{status:403});return Response.json({choices:[{message:{content:'{"offer_ids":[1,999]}'}}]});};
 try{
  const stamp=new Date().toISOString();const response=await chatWithNova('Ofertas de diseño en Colombia',[{id:1,status:'active',official:true,liveness_status:'active',liveness_verified_at:stamp,source_excerpt:'A free plan for enrolled students.',verified_at:stamp,title:'Plan de diseño',benefit:'Licencia gratuita',brand:'Fixture',category:'Design',countries:['CO'],requirements:['Matrícula vigente'],steps:['Consultar fuente'],source_url:'https://example.invalid/student'}]);
  assert.match(response,/Licencia gratuita/);assert.match(response,/\?offer=1/);assert.ok(!response.includes('offer=999'));
  assert.deepEqual(calls.map(c=>c.model),['unavailable-model','openai/gpt-oss-20b']);assert.equal(calls[1].temperature,0);assert.equal(calls[1].response_format.type,'json_object');assert.equal(aiStatus().model,'openai/gpt-oss-20b');
 }finally{globalThis.fetch=original;}
});

test('Groq reports authentication failure without cycling through models',async()=>{
  const original=globalThis.fetch;
  let calls=0;
  globalThis.fetch=async()=>{calls++;return new Response('Invalid API key',{status:401});};
  try {
    await assert.rejects(groqChat([{role:'user',content:'fixture'}]),/authentication/);
    assert.equal(calls,1);
    assert.equal(aiStatus().error,'authentication');
  } finally {globalThis.fetch=original;}
});

test('Groq switches models promptly on a per-model daily token limit',async()=>{
  const original=globalThis.fetch;
  const calls=[];
  globalThis.fetch=async (_url,options)=>{
    const {model}=JSON.parse(options.body); calls.push(model);
    if(model==='openai/gpt-oss-20b')return new Response(JSON.stringify({error:{message:'Rate limit reached for model on tokens per day. Please try again in 60s.'}}),{status:429});
    return Response.json({choices:[{message:{content:'Alternativa disponible'}}]});
  };
  try {
    const reply=await groqChat([{role:'user',content:'fixture'}]);
    assert.equal(reply,'Alternativa disponible');
    assert.deepEqual(calls,['openai/gpt-oss-20b','unavailable-model']);
    assert.equal(aiStatus().model,'unavailable-model');
    assert.equal(aiStatus().error,null);
  } finally {globalThis.fetch=original;}
});
