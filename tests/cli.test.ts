import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {execFileSync,spawnSync} from 'node:child_process';
import {Store} from '../src/store.ts';
test('actual CLI imports the real bundle idempotently; tampering is rejected before database creation',()=>{
 const dir=mkdtempSync(join(tmpdir(),'mevy-cli-'));try{
  const path=join(dir,'state.db'),call=(args:string[])=>JSON.parse(execFileSync(process.execPath,['--import','tsx','src/cli.ts',...args],{encoding:'utf8'}));
  const sample=JSON.parse(readFileSync('evidence/integration-2026-10-21.json','utf8'));
  const first=call(['import','--file','evidence/integration-2026-10-21.json','--db',path]);assert.equal(first.sourceRequoted,false);assert.equal(first.researchGate,'HOLD');
  const s=new Store(path),before=s.verifyJournal();s.close();call(['import','--file','evidence/integration-2026-10-21.json','--db',path]);const next=new Store(path);try{assert.equal(next.verifyJournal(),before);}finally{next.close();}
  assert.equal(call(['report',sample.experiment.id,'--db',path]).observations,1);
  const fromEnv=JSON.parse(execFileSync(process.execPath,['--import','tsx','src/cli.ts','report',sample.experiment.id],{encoding:'utf8',env:{...process.env,MEVY_DB:path}}));assert.equal(fromEnv.observations,1);
  const tampered=join(dir,'tampered.json');sample.report.researchGate='ELIGIBLE_FOR_REVIEW';writeFileSync(tampered,JSON.stringify(sample));
  const bad=spawnSync(process.execPath,['--import','tsx','src/cli.ts','import','--file',tampered,'--db',join(dir,'bad.db')],{encoding:'utf8'});assert.notEqual(bad.status,0);assert.match(bad.stderr,/Evidence bundle mismatch/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
