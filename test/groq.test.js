import test from 'node:test';
import assert from 'node:assert/strict';

process.env.GROQ_API_KEY='test-key';
process.env.GROQ_MIN_DELAY_MS='0';
process.env.GROQ_MODEL='unavailable-model';
process.env.GROQ_FALLBACK_MODELS='openai/gpt-oss-20b';
const {chatWithNova,aiStatus}=await import('../src/services/groq.js');

test('Groq refuses excess simultaneous work instead of growing an unlimited queue',async()=>{
  const original=globalThis.fetch;
  let release;
  const gate=new Promise(resolve=>{release=resolve});
  globalThis.fetch=async()=>{await gate;return Response.json({choices:[{message:{content:'OK'}}]})};
  const pending=Array.from({length:3},()=>chatWithNova('Hola',[]));
  try {
    await assert.rejects(chatWithNova('Hola',[]),{code:'AI_BUSY'});
  } finally {
    release();await Promise.all(pending);globalThis.fetch=original;
  }
  assert.equal(aiStatus().error,null,'overload does not falsely report a provider outage');
});

test('Groq switches when a model is blocked and reports the model actually used',async()=>{
  const calls=[];
  const original=globalThis.fetch;
  globalThis.fetch=async (_url,options)=>{
    const body=JSON.parse(options.body); calls.push(body);
    if(body.model==='unavailable-model')return new Response(JSON.stringify({error:{message:'The model is blocked at the project level'}}),{status:403});
    return Response.json({choices:[{message:{content:'Prueba correcta'}}]});
  };
  try {
    const response=await chatWithNova('Ofertas de diseño',[{title:'Plan de diseño',brand:'Ejemplo',category:'Design',offer_type:'discount',countries:['CO'],requirements:['Matrícula vigente'],steps:['Consultar la fuente'],source_url:'https://example.invalid/student'}]);
    assert.equal(response,'Prueba correcta');
    assert.deepEqual(calls.map(x=>x.model),['unavailable-model','openai/gpt-oss-20b']);
    assert.equal(calls[1].reasoning_effort,'low');
    assert.match(calls[1].messages[0].content,/Matrícula vigente/);
    assert.match(calls[1].messages[0].content,/Consultar la fuente/);
    assert.match(calls[1].messages[0].content,/no recomiendes fichas limitadas a otros países/);
    assert.equal(aiStatus().model,'openai/gpt-oss-20b');
    assert.equal(aiStatus().error,null);
  } finally {globalThis.fetch=original;}
});

test('Groq reports authentication failure without cycling through models',async()=>{
  const original=globalThis.fetch;
  let calls=0;
  globalThis.fetch=async()=>{calls++;return new Response('Invalid API key',{status:401});};
  try {
    await assert.rejects(chatWithNova('Hola',[]),/authentication/);
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
    const reply=await chatWithNova('Opciones de estudio',[]);
    assert.equal(reply,'Alternativa disponible');
    assert.deepEqual(calls,['openai/gpt-oss-20b','unavailable-model']);
    assert.equal(aiStatus().model,'unavailable-model');
    assert.equal(aiStatus().error,null);
  } finally {globalThis.fetch=original;}
});
