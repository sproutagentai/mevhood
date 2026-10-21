import { z } from 'zod';
import { canonical,digest,engineHash,hash,uint,verifyExperiment,type Experiment } from './model.ts';
import { proposalSchema,policyEconomics,researchReport } from './research.ts';
import { Store } from './store.ts';

const header=z.object({format:z.literal('mevy-next-experiment/v1'),parentExperimentId:z.string(),proposalHash:hash,draftHash:hash}).passthrough();
export function prepareNext(store:Store,parentId:string,proposalHash:string){
  hash.parse(proposalHash);const {experiment,report}=researchReport(store,parentId);
  const row=store.db.prepare('SELECT body FROM proposals WHERE hash=? AND experiment=?').get(proposalHash,parentId) as {body:string}|undefined;
  if(!row)throw Error('Unknown proposal for parent experiment');const p=JSON.parse(row.body);
  if(digest(p)!==proposalHash||p.state!=='PROPOSED_NOT_DEPLOYED')throw Error('Invalid proposal receipt');
  proposalSchema.parse({experimentId:p.experimentId,candidate:p.candidate,rationale:p.rationale,failureHypothesis:p.failureHypothesis,evidenceBlocks:p.evidenceBlocks});
  if(p.experimentId!==parentId||!report.observations||p.evidenceBlocks.some((b:number)=>!report.ledger.some(r=>r.block===b)))throw Error('Proposal evidence mismatch');
  if([experiment.baseline,experiment.candidate].some(old=>canonical(policyEconomics(old))===canonical(policyEconomics(p.candidate))))throw Error('Candidate economics are unchanged');
  if(experiment.engineHash!==engineHash())throw Error('Use the matching evaluator before preparing lineage');
  const observations=store.observations(parentId);
  const body={format:'mevy-next-experiment/v1' as const,state:'AWAITING_EXPLICIT_APPROVAL' as const,parentExperimentId:parentId,parentCommitment:experiment.commitment,
    parentBundleHash:digest({experiment,observations,report}),proposalHash,proposal:p,
    baseline:experiment.baseline,candidate:proposalSchema.shape.candidate.parse(p.candidate),acceptance:experiment.acceptance,
    engineHash:experiment.engineHash,trainingThroughBlock:Math.max(experiment.trainingThroughBlock,...observations.map(o=>o.block)),
    boundary:'Research only. This draft does not promote, sign, deploy or trade.'};
  return {...body,draftHash:digest(body)};
}

export function freezeNext(store:Store,input:unknown,options:{id:string;approveDraft:string;head:{number:number;hash:string;timestamp:number};createdAt:number;llmCostWei:string|null;llmCostNote:string}){
  const h=header.parse(input);
  if(!/^[a-zA-Z0-9-]{1,64}$/.test(options.id)||options.id===h.parentExperimentId)throw Error('New unique experiment ID required');
  return store.transaction(()=>{
    // Hold the writer lock across the fresh parent-data check and the freeze.
    const expected=prepareNext(store,h.parentExperimentId,h.proposalHash);
    if(canonical(input)!==canonical(expected))throw Error('Draft changed or parent evidence advanced; prepare and review again');
    if(options.approveDraft!==expected.draftHash)throw Error('Explicit approval of the exact draft hash required');
    if(options.head.number<=expected.trainingThroughBlock||options.createdAt<options.head.timestamp)throw Error('New freeze overlaps training data or has invalid time');
    if(options.llmCostWei!==null)uint.parse(options.llmCostWei);
    if(options.llmCostNote.trim().length<10)throw Error('Explicit cost basis or unknown-cost note required');
    const body={version:1 as const,id:options.id,createdAt:options.createdAt,freezeBlock:options.head.number,freezeBlockHash:options.head.hash,
      trainingThroughBlock:expected.trainingThroughBlock,baseline:expected.baseline,candidate:expected.candidate,acceptance:expected.acceptance,
      engineHash:expected.engineHash,llmCostWei:options.llmCostWei,llmCostNote:options.llmCostNote,
      lineage:{parentExperimentId:h.parentExperimentId,parentCommitment:expected.parentCommitment,parentBundleHash:expected.parentBundleHash,proposalHash:expected.proposalHash,approvedDraftHash:expected.draftHash}};
    const e={...body,commitment:digest(body)};verifyExperiment(e);
    // Store.freeze opens a transaction itself; use its exact version-1 record/event shape here.
    store.db.prepare('INSERT INTO experiments VALUES(?,?)').run(e.id,canonical(e));
    store.event({type:'freeze',id:e.id,commitment:e.commitment});return e;
  });
}
