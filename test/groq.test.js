import test from 'node:test';
import assert from 'node:assert/strict';

process.env.GROQ_API_KEY='test-key';
process.env.GROQ_MIN_DELAY_MS='0';
process.env.GROQ_MODEL='unavailable-model';
process.env.GROQ_FALLBACK_MODELS='openai/gpt-oss-20b';
const {chatWithNova,aiStatus}=await import('../src/services/groq.js');

test('Groq switches when a model is blocked and reports the model actually used',async()=>{
  const calls=[];
  const original=globalThis.fetch;
  globalThis.fetch=async (_url,options)=>{
    const body=JSON.parse(options.body); calls.push(body);
    if(body.model==='unavailable-model')return new Response(JSON.stringify({error:{message:'The model is blocked at the project level'}}),{status:403});
    return Response.json({choices:[{message:{content:'Prueba correcta'}}]});
  };
  try {
    const response=await chatWithNova('Ofertas de diseño',[]);
    assert.equal(response,'Prueba correcta');
    assert.deepEqual(calls.map(x=>x.model),['unavailable-model','openai/gpt-oss-20b']);
    assert.equal(calls[1].reasoning_effort,'low');
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
