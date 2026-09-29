import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';

test('a new data volume is seeded once and later data survives restarts',()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'nova-volume-'));
  const seed=path.join(dir,'seed.json'),target=path.join(dir,'volume','db.json');
  writeFileSync(seed,JSON.stringify({offers:[{id:1,title:'Seed'}],sources:[],alerts:[],favorites:[],events:[]}));
  const env={...process.env,DATABASE_PATH:target,SEED_DATABASE_PATH:seed};
  const run=code=>spawnSync(process.execPath,['--input-type=module','-e',code],{env,encoding:'utf8'});
  try{
    const first=run("import {db,save} from './src/db.js';db.alerts.push({id:1,email:'saved@example.invalid'});save()");
    assert.equal(first.status,0,first.stderr);
    assert.equal(JSON.parse(readFileSync(target)).offers[0].title,'Seed');
    const second=run("import {db} from './src/db.js';if(db.alerts[0]?.email!=='saved@example.invalid')process.exit(1)");
    assert.equal(second.status,0,second.stderr);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
