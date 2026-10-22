import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync,mkdtempSync,mkdirSync,rmSync,writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AutoStore,checkCampaign,evidenceBundle,bindWindowAudit,analyseSlot,type Campaign } from '../src/auto-research.ts';
import { auditSource } from '../src/source-audit.ts';
import { digest } from '../src/model.ts';
import { planResearch } from '../src/llm-research.ts';
import { validatePublication,appendPublication,legacyIndex } from '../src/auto-publish.ts';
const original=JSON.parse(readFileSync('evidence/preliminary-vps-2026-10-21.json','utf8'));
const oldAudit=JSON.parse(readFileSync('evidence/history-source-audit-2026-10-21.json','utf8'));
const c:Campaign={id:'auto-test',startsAt:original.observations[0].timestamp-60,endsAt:original.observations[0].timestamp-60+604800,intervalSeconds:21600,collectionSeconds:120,dailyBudgetUsd:'1.000000000',totalBudgetUsd:'7.000000000',model:'gpt-6-luna',repository:'sproutagentai/mevhood',bootstrap:true};
const {commitment,...eb}=original.experiment,experiment={...eb,id:c.id,commitment:digest({...eb,id:c.id})};
const output={decision:'NO_CHANGE',summary:'The supplied quote history does not establish a useful change to the frozen policy.',findings:[{observation:'The inspected source packet contains quotes, not executed fills or realized trading profit.',evidenceBlocks:[original.observations[0].block]}],proposal:null,nextTest:'Collect a fresh, source-checked cohort while preserving the frozen control and the original acceptance gate.',limitations:['Extra gas and infrastructure costs remain unknown.','This is an offline test fixture, not a genuine provider response.']};
async function setup(){const dir=mkdtempSync(join(tmpdir(),'mevy-auto-test-')),state=new AutoStore(join(dir,'jobs.sqlite'),c);for(const o of original.observations){const capture=await auditSource(evidenceBundle(experiment,[o]),{read:async()=>o});state.capture(o,capture);}return {dir,state,close(){state.close();rmSync(dir,{recursive:true,force:true});}};}
const generation=async()=>({output,responseId:'test-only-response',modelId:'gpt-6-luna',inputTokens:100,outputTokens:100,finishReason:'stop',serviceTier:'default'});
test('full Luna context fits a quarter-dollar reserve and original Sol plan is byte-reproducible',()=>{
 const luna=planResearch(original,oldAudit,'0.250000000','gpt-6-luna');assert.equal(luna.plan.quotes,480);assert.equal(luna.context.coverage.truncated,false);assert.ok(Number(luna.plan.reservedUsd)<.25);
 assert.deepEqual(planResearch(original,oldAudit,'1').plan,JSON.parse(readFileSync('evidence/llm-plan-2026-10-21.json','utf8')));
});
test('rolling24h and7day reservations, duplicate slots/bundles and expiry fail closed across two connections',()=>{
 const dir=mkdtempSync(join(tmpdir(),'mevy-budget-')),a=new AutoStore(join(dir,'jobs.sqlite'),c),b=new AutoStore(join(dir,'jobs.sqlite'),c);
 try{
  a.reserve(0,c.startsAt,'b0',1,'0.300000000');assert.throws(()=>b.reserve(0,c.startsAt,'b1',2,'0.010000000'),/already claimed/);
  for(let i=1;i<3;i++)a.reserve(i,c.startsAt+i*21600,'b'+i,i+1,'0.300000000');
  assert.throws(()=>a.reserve(3,c.startsAt+64800,'b3',4,'0.300000000'),/budget exhausted/);
  assert.throws(()=>a.reserve(3,c.startsAt+64800,'b0',4,'0.010000000'),/Bundle already reserved/);
  a.reserve(4,c.startsAt+86400,'b4',5,'0.300000000');assert.equal(b.jobs().length,4);
  assert.throws(()=>a.reserve(28,c.endsAt,'expired',9,'0.010000000'),/outside authorization/);
  assert.throws(()=>checkCampaign({...c,endsAt:c.endsAt+1},c.startsAt),/authorization mismatch/);
 }finally{a.close();b.close();rmSync(dir,{recursive:true,force:true});}
});
test('window receipts preserve actual single-block source checks and reject a missing or altered capture',async()=>{
 const s=await setup();try{const bundle=evidenceBundle(experiment,original.observations),captures=s.state.captures(),pack=bindWindowAudit(bundle,captures);assert.equal(pack.summary.auditedQuotes,480);assert.equal(pack.receipts[0]!.captureReceipt.checks[0]!.observationHash,digest(original.observations[0]));
  const bad=structuredClone(captures);delete bad[String(original.observations[0].block)];assert.throws(()=>bindWindowAudit(bundle,bad),/Missing physical/);
  captures[String(original.observations[0].block)]!.checks[0]!.sourceDigest='changed';assert.throws(()=>bindWindowAudit(bundle,captures),/proof mismatch/);
 }finally{s.close();}
});
test('one reserved inference survives publication retry/restart; recovered output is published without calling the model again',async t=>{
 t.mock.timers.enable({apis:['Date'],now:(c.startsAt+86400)*1000});
 const s=await setup();let calls=0;const args={state:s.state,experiment,observations:original.observations,slot:0,now:original.observations.at(-1).timestamp+10,root:join(s.dir,'runs'),spool:join(s.dir,'spool'),generate:async()=>{calls++;return generation();}};
 try{
  const first=await analyseSlot(args);assert.equal(first.state,'ANALYSED');assert.equal(calls,1);
  const record=JSON.parse(readFileSync(join(args.spool,'slot-0.json'),'utf8'));validatePublication(record);
  rmSync(join(args.spool,'slot-0.json'));await analyseSlot(args);assert.equal(calls,1);assert.equal(s.state.jobs().length,1);
  await analyseSlot(args);assert.equal(calls,1);
  const legacy=legacyIndex(p=>readFileSync(p,'utf8')),manifest=JSON.parse(readFileSync('PUBLIC_FILES.json','utf8')),files=appendPublication(record,legacy,manifest,p=>readFileSync(p,'utf8'))!;
  const index=JSON.parse(files['evidence/research-index.json']!);assert.equal(index.reports.length,2);assert.equal(index.reports[0].model,'gpt-6-luna');assert.equal(index.reports[0].bootstrap,true);
  assert.equal(appendPublication(record,index,JSON.parse(files['PUBLIC_FILES.json']!),p=>files[p]!),null);
  const bad=structuredClone(record);bad.files['.env']='secret';assert.throws(()=>validatePublication(bad),/paths/);
 }finally{s.close();}
});
test('unknown-cost provider failure consumes its reservation and is never retried in the same slot',async()=>{
 const s=await setup();let calls=0;const args={state:s.state,experiment,observations:original.observations,slot:0,now:original.observations.at(-1).timestamp+10,root:join(s.dir,'runs'),spool:join(s.dir,'spool'),generate:async()=>{calls++;throw Error('not a real provider');}};
 try{await assert.rejects(()=>analyseSlot(args));assert.equal(s.state.job(0).state,'FAILED_UNKNOWN_COST');const again=await analyseSlot(args);assert.equal(again.state,'UNKNOWN_ATTEMPT_NO_RETRY');assert.equal(calls,1);assert.ok(Number(s.state.job(0).reservedUsd)>0);}finally{s.close();}
});
