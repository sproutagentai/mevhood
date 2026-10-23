import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync,mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { digest,type Observation } from '../src/model.ts';
import { evidenceBundle,AutoStore,type Campaign } from '../src/auto-research.ts';
import { auditSource } from '../src/source-audit.ts';
import { verifyGraph,verifyFrame,searchCells,type LabFrame,makeRoutes } from '../src/frontier-source.ts';
import { freezeTrial,evaluateTrial,validateHypotheses,LabStore,type LabHypothesis } from '../src/frontier-strategy.ts';
import { planDiscovery,runDiscovery } from '../src/frontier-research.ts';
import { labRecord,validateLabRecord,appendLabPublication } from '../src/frontier-publication.ts';
import { LabRuntime } from '../src/frontier-runtime.ts';
const original=JSON.parse(readFileSync('evidence/preliminary-vps-2026-10-21.json','utf8')),graph=(()=>{const old=JSON.parse(readFileSync('evidence/lab-universe-2026-10-22.json','utf8'));delete old.graphHash;const body={...old,format:'mevy-frontier-universe/v1',routes:makeRoutes(old.pools,old.tokens),scan:{fromBlock:old.block-999999,toBlock:old.block,eventSource:'https://rpc.mainnet.chain.robinhood.com',events:[],checkedPools:old.pools.map((p:any)=>p.address),excludedPools:[],policy:'Offline graph fixture; no live discovery claim.'}};return verifyGraph({...body,graphHash:digest(body)});})(),experiment=original.experiment,base=graph.block+1000,start=graph.timestamp+1000;
const route=graph.routes.find(r=>r.family==='triangle')!;
const hypothesis:LabHypothesis={name:'Synthetic test hypothesis',strategy:{routeId:route.id,sizeWei:'100000000000000',minEdgeBps:5,gasSafetyBps:15000,persistence:2,maxGasPriceWei:null,family:'QUOTE_IMPROVEMENT',minImprovementBps:1},rationale:'Offline fixture for a novel three-pool cycle; no real opportunity is asserted.',failureCondition:'Reject the hypothesis if the first ten paired forward observations have no eligible known-gas signal.',evidenceBlocks:[base]};
async function frame(i:number,positive=false):Promise<LabFrame>{
 const control:Observation={...structuredClone(original.observations[0]),block:base+i*100,timestamp:start+i*120,collectedAt:start+i*120+1};
 const controlSource=await auditSource(evidenceBundle(experiment,[control]),{read:async()=>control}),quotes=[{routeId:route.id,sizeWei:hypothesis.strategy.sizeWei,amountOutWei:positive?String(1000000000000000n+BigInt(i)*100000000000n):'99900000000000',gasUnits:'150000',error:null}];
 const body={format:'mevy-frontier-frame/v1' as const,graphHash:graph.graphHash,control,controlSource,quotes,sourceCheck:{status:'MATCH' as const,source:'https://rpc-robinhood.blockmachine.io',checkedAt:new Date((start+i*120+2)*1000).toISOString(),quoteHash:digest(quotes)}};return verifyFrame({...body,frameHash:digest(body)},graph);
}
const campaign:Campaign={id:experiment.id,startsAt:start-100,endsAt:start-100+604800,intervalSeconds:21600,collectionSeconds:120,dailyBudgetUsd:'1.000000000',totalBudgetUsd:'7.000000000',model:'gpt-6-luna',repository:'sproutagentai/mevhood',bootstrap:true};
test('actual discovered route graph has verified alternatives; search rotates unseen exact cells and keeps mandatory trials',async()=>{
 assert.equal(graph.pools.length,14);assert.equal(graph.routes.length,228);assert.ok(graph.routes.some(r=>r.family==='four-hop'));
 const first=searchCells(graph,[],[]),f=await frame(0);assert.equal(first.length,6);const mandatory={routeId:route.id,sizeWei:hypothesis.strategy.sizeWei};assert.deepEqual(searchCells(graph,[f],[mandatory])[0],mandatory);assert.throws(()=>searchCells({...graph,graphHash:'0x'+'0'.repeat(64)},[],[]));
});
test('training cannot leak into forward evidence; pending publication counts zero and persistence uses only subsequent paired blocks',async()=>{
 const training=[await frame(0,true)],trial=freezeTrial(hypothesis,graph,training,experiment,'0x'+'1'.repeat(64),{number:base+50,timestamp:start+60},(start+60)*1000);
 assert.equal(evaluateTrial(trial,training,graph,experiment).observations,0);assert.equal(evaluateTrial(trial,training,graph,experiment).status,'AWAITING_PUBLIC_FREEZE');
 trial.publicAnchor={commit:'a'.repeat(40),seenAt:new Date((start+60)*1000).toISOString(),startBlock:base+50,startTimestamp:start+60};
 const frames=[...training,await frame(1,true),await frame(2,true)],r=evaluateTrial(trial,frames,graph,experiment);assert.equal(r.observations,2);assert.equal(r.candidateSignals,0);assert.equal(r.controlSignals,0);assert.equal(r.completePaperNetWei,null);assert.equal(r.researchGate,'HOLD');assert.equal(r.firstBlock,base+100);
});
test('a precommitted failed ten-row screen is rejected and a promising screen continues beyond ten rows without accepting alpha',async()=>{
 const training=[await frame(0)],trial=freezeTrial(hypothesis,graph,training,experiment,'0x'+'1'.repeat(64),{number:base+50,timestamp:start+60},(start+60)*1000);trial.publicAnchor={commit:'a'.repeat(40),seenAt:new Date((start+60)*1000).toISOString(),startBlock:base+50,startTimestamp:start+60};
 const negative=await Promise.all(Array.from({length:12},(_,i)=>frame(i+1))),positive=await Promise.all(Array.from({length:12},(_,i)=>frame(i+1,true)));
 const failed=evaluateTrial(trial,negative,graph,experiment),good=evaluateTrial(trial,positive,graph,experiment);assert.equal(failed.status,'REJECTED_NO_SIGNAL');assert.equal(failed.observations,10);assert.equal(good.status,'FORWARD_TESTING_LONG');assert.equal(good.observations,12);assert.equal(good.longAcceptance.minSeconds,604800);assert.equal(good.completePaperNetWei,null);
 assert.throws(()=>evaluateTrial(trial,[positive[0]!,positive[0]!],graph,experiment),/Duplicate/);
});
test('novelty, actual block evidence and immutable restart state reject invented or renamed hypotheses',async()=>{
 const training=[await frame(0)],trial=freezeTrial(hypothesis,graph,training,experiment,'0x'+'1'.repeat(64),{number:base+50,timestamp:start+60},(start+60)*1000),output={summary:'A bounded prospective experiment tests a newly observed pool cycle.',hypotheses:[hypothesis],limitations:['Quotes are not executed fills.','This synthetic fixture is not a real model response.']};
 assert.equal(validateHypotheses(output,graph,training,[]).hypotheses.length,1);assert.throws(()=>validateHypotheses(output,graph,training,[trial]),/recycled/);assert.throws(()=>validateHypotheses({...output,hypotheses:[{...hypothesis,evidenceBlocks:[1]}]},graph,training,[]),/unavailable/);
 const dir=mkdtempSync(join(tmpdir(),'mevy-lab-test-'));let s=new LabStore(join(dir,'lab.sqlite'));s.put('trial',trial.id,trial);s.close();s=new LabStore(join(dir,'lab.sqlite'));assert.equal(s.trials().length,1);assert.throws(()=>s.put('trial',trial.id,{...trial,name:'changed'}),/immutable/);s.close();rmSync(dir,{recursive:true,force:true});
});
test('upgrade calls and scheduled calls share the same atomic rolling and campaign budget',()=>{
 const dir=mkdtempSync(join(tmpdir(),'mevy-lab-budget-')),a=new AutoStore(join(dir,'jobs.sqlite'),campaign),b=new AutoStore(join(dir,'jobs.sqlite'),campaign);try{
  a.reserve(0,campaign.startsAt,'a',1,'0.800000000');assert.throws(()=>b.reserveUpgrade(campaign.startsAt+1,'b',2,'0.250000000'),/budget/);b.reserveUpgrade(campaign.startsAt+1,'b',2,'0.100000000');assert.throws(()=>a.reserveUpgrade(campaign.startsAt+2,'c',3,'0.010000000'),/claimed/);assert.throws(()=>a.reserve(1,campaign.startsAt+21600,'d',4,'0.200000000'),/budget/);assert.equal(b.reservations().length,2);
 }finally{a.close();b.close();rmSync(dir,{recursive:true,force:true});}
});
test('saved model output recovers without another inference and public sources reproduce exact plan/trial/results',async t=>{
 t.mock.timers.enable({apis:['Date'],now:(start+60)*1000});const training=[await frame(0)],prepared=planDiscovery(graph,training,[],experiment,training,'v2'),output={summary:'Test an actual discovered triangular pool route with fresh paired observations.',hypotheses:[hypothesis],limitations:['Quotes are not executed trades.','Complete costs remain unknown.']},dir=mkdtempSync(join(tmpdir(),'mevy-lab-call-'));let calls=0;
 try{const call=async()=>{calls++;return {output,responseId:'offline-fixture-only',modelId:'gpt-6-luna',inputTokens:10,outputTokens:10,finishReason:'stop',serviceTier:'default'};};
  const receipt=await runDiscovery(prepared,join(dir,'run'),graph,training,[],call);await runDiscovery(prepared,join(dir,'run'),graph,training,[],call);assert.equal(calls,1);
  const trial=freezeTrial(hypothesis,graph,training,experiment,receipt.analysisHash,{number:base+50,timestamp:start+60}),run={id:'fixture',analysis:receipt,plan:prepared.plan,context:prepared.context,trainingBlocks:[base],priorTrials:[]},record=labRecord(campaign,'fixture',graph,training,[trial],[run],experiment);assert.equal(validateLabRecord(record).report.trials.length,1);
  const manifest={algorithm:'sha256',files:{}},files=appendLabPublication(record,null,manifest,()=>{throw Error('not present');})!;assert.ok(files['evidence/frontier-index.json']);const changed=structuredClone(record),path=Object.keys(changed.files).find(p=>p.includes('-frame-'))!;changed.files[path]=changed.files[path]!.replace('99900000000000','99900000000001');assert.throws(()=>validateLabRecord(changed));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('a crash after envelope rename or public push adopts the exact original publication without rewriting evidence',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'mevy-lab-envelope-')),budget=new AutoStore(join(dir,'budget.sqlite'),campaign),lab=new LabRuntime(dir,join(dir,'spool'),campaign,experiment,budget,'https://rpc-robinhood.blockmachine.io',graph);
 try{const f=await frame(0);lab.store.put('frame',String(f.control.block),f);lab.spoolReport('crash-fixture');const path=join(dir,'spool',`lab-frontier-${graph.block}-crash-fixture.json`),bytes=readFileSync(path,'utf8'),record=JSON.parse(bytes);lab.store.db.prepare("DELETE FROM lab_items WHERE kind='spooled'").run();lab.spoolReport('crash-fixture');assert.equal(readFileSync(path,'utf8'),bytes);
  lab.store.db.prepare("DELETE FROM lab_items WHERE kind='spooled'").run();const report=JSON.parse(record.files[record.reportPath]);lab.adoptPublications({format:'mevy-frontier-strategy-index/v1',campaign,reports:[{path:record.reportPath,reportHash:record.reportHash,createdAt:report.createdAt}]});lab.spoolReport('crash-fixture');assert.equal(lab.store.get('spooled','crash-fixture').reportHash,record.reportHash);assert.throws(()=>readFileSync(path));
 }finally{lab.close();budget.close();rmSync(dir,{recursive:true,force:true});}
});
test('exact size curves select measured best net and fail closed if any required size is missing',async()=>{
 const training=[await frame(0)],h:LabHypothesis={...hypothesis,strategy:{...hypothesis.strategy,family:'SIZE_CURVE',sizeWei:'5000000000000000',persistence:1}},t=freezeTrial(h,graph,training,experiment,'0x'+'1'.repeat(64),{number:base+50,timestamp:start+60},(start+60)*1000);t.publicAnchor={commit:'a'.repeat(40),seenAt:new Date((start+60)*1000).toISOString(),startBlock:base+50,startTimestamp:start+60};
 const f=await frame(1);f.quotes=['100000000000000','1000000000000000','5000000000000000'].map((sizeWei,i)=>({routeId:route.id,sizeWei:sizeWei as any,amountOutWei:String(BigInt(sizeWei)+BigInt(i===1?100000000000000:10000000000000)),gasUnits:'150000',error:null}));f.sourceCheck.quoteHash=digest(f.quotes);const {frameHash,...body}=f;f.frameHash=digest(body);
 const result=evaluateTrial(t,[f],graph,experiment);assert.equal(result.ledger[0].selectedSizeWei,'1000000000000000');assert.equal(result.candidateSignals,1);
 f.quotes.pop();f.sourceCheck.quoteHash=digest(f.quotes);const {frameHash:_,...partial}=f;f.frameHash=digest(partial);assert.equal(evaluateTrial(t,[f],graph,experiment).candidateSignals,0);assert.equal(evaluateTrial(t,[f],graph,experiment).pairedObservations,0);
});
test('frontier verification request shares cap and cannot be repeated',()=>{
 const dir=mkdtempSync(join(tmpdir(),'mevy-frontier-budget-')),s=new AutoStore(join(dir,'jobs.sqlite'),campaign);try{s.reserve(0,campaign.startsAt,'old',1,'0.950000000');assert.throws(()=>s.reserveFrontier(campaign.startsAt+1,'frontier',2,'0.060000000'),/budget/);s.reserveFrontier(campaign.startsAt+1,'frontier',2,'0.040000000');assert.throws(()=>s.reserveFrontier(campaign.startsAt+2,'retry',3,'0.001000000'),/claimed/);assert.equal(s.reservations().length,2);}finally{s.close();rmSync(dir,{recursive:true,force:true});}
});
