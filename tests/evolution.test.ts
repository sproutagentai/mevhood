import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {Store} from '../src/store.ts';
import {digest,engineHash,type Experiment,type Observation} from '../src/model.ts';
import {submitProposal} from '../src/research.ts';
import {prepareNext,freezeNext} from '../src/evolution.ts';
const bundle=JSON.parse(readFileSync('evidence/integration-2026-10-21.json','utf8'));
function setup(fn:(s:Store,path:string,e:Experiment,o:Observation)=>void){const dir=mkdtempSync(join(tmpdir(),'mevy-lineage-')),path=join(dir,'state.db'),s=new Store(path);try{const e=bundle.experiment as Experiment,o=bundle.observations[0] as Observation;s.freeze(e);s.add(e.id,o);fn(s,path,e,o);}finally{try{s.close();}catch{}rmSync(dir,{recursive:true,force:true});}}
const proposal=(e:Experiment,o:Observation)=>({experimentId:e.id,candidate:{...e.candidate,name:'next-test',minEdgeBps:83},rationale:'Test a stricter minimum edge using the next forward dataset.',failureHypothesis:'Small quoted improvements may disappear after all costs.',evidenceBlocks:[o.block]});
function options(draft:ReturnType<typeof prepareNext>,o:Observation){return {id:'next-trial',approveDraft:draft.draftHash,head:{number:o.block+100,hash:o.blockHash,timestamp:o.timestamp+120},createdAt:o.timestamp+121,llmCostWei:null,llmCostNote:'Unknown pending provider invoice reconciliation'};}
test('renaming an unchanged economic policy is not an improvement proposal',()=>setup((s,p,e,o)=>{for(const old of [e.baseline,e.candidate])assert.throws(()=>submitProposal(s,{...proposal(e,o),candidate:{...old,name:'different-name'}},{sessionId:'test',model:'fixture'}),/economics are unchanged/);}));
test('real source bundle → reviewed proposal → durable next experiment; frozen control and gate unchanged',()=>setup((s,path,e,o)=>{
 const p=submitProposal(s,proposal(e,o),{sessionId:'unit-fixture-not-provider',model:'fixture'}),draft=prepareNext(s,e.id,p.proposalHash);
 assert.equal(draft.trainingThroughBlock,o.block);assert.equal(draft.state,'AWAITING_EXPLICIT_APPROVAL');
 const next=freezeNext(s,draft,options(draft,o));assert.deepEqual(next.baseline,e.baseline);assert.deepEqual(next.acceptance,e.acceptance);assert.equal(next.engineHash,engineHash());assert.equal(next.llmCostWei,null);assert.equal(next.lineage.parentCommitment,e.commitment);assert.equal(next.lineage.approvedDraftHash,draft.draftHash);
 s.close();const reopened=new Store(path);try{assert.deepEqual(reopened.experiment('next-trial'),next);reopened.verifyJournal();assert.equal(reopened.observations('next-trial').length,0);}finally{reopened.close();}
}));
test('wrong approval, edited draft and training overlap produce no new state',()=>setup((s,path,e,o)=>{
 const p=submitProposal(s,proposal(e,o),{sessionId:'s',model:'fixture'}),draft=prepareNext(s,e.id,p.proposalHash),before=s.verifyJournal();
 assert.throws(()=>freezeNext(s,draft,{...options(draft,o),approveDraft:digest('wrong')}),/approval/);
 assert.throws(()=>freezeNext(s,{...draft,candidate:{...draft.candidate,minEdgeBps:1}},options(draft,o)),/Draft changed/);
 assert.throws(()=>freezeNext(s,draft,{...options(draft,o),head:{number:o.block,hash:o.blockHash,timestamp:o.timestamp}}),/overlaps training/);
 assert.equal(s.verifyJournal(),before);assert.throws(()=>s.experiment('next-trial'),/Unknown experiment/);
}));
test('new parent observations invalidate approval, including uncited observations',()=>setup((s,path,e,o)=>{
 const p=submitProposal(s,proposal(e,o),{sessionId:'s',model:'fixture'}),draft=prepareNext(s,e.id,p.proposalHash);
 s.add(e.id,{...o,block:o.block+1,timestamp:o.timestamp+2,collectedAt:o.collectedAt+2});
 assert.throws(()=>freezeNext(s,draft,options(draft,o)),/parent evidence advanced/);
 const fresh=prepareNext(s,e.id,p.proposalHash);assert.equal(fresh.trainingThroughBlock,o.block+1);assert.notEqual(fresh.draftHash,draft.draftHash);
}));
