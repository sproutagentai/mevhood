import { z } from 'zod';
import { policySchema, digest, type Experiment } from './model.ts';
import { evaluate } from './engine.ts';
import { Store } from './store.ts';

export const proposalSchema=z.object({experimentId:z.string().regex(/^[a-zA-Z0-9-]{1,64}$/),
  candidate:policySchema, rationale:z.string().min(30).max(2000), failureHypothesis:z.string().min(20).max(1000),
  evidenceBlocks:z.array(z.number().int().positive()).min(1).max(20)}).strict();
export function researchReport(store:Store,id:string){store.verifyJournal();const e=store.experiment(id),o=store.observations(id);const r=evaluate(e,o);return {experiment:e,report:r};}
export const policyEconomics=(p:Experiment['baseline'])=>({sizeWei:p.sizeWei,minEdgeBps:p.minEdgeBps,gasSafetyBps:p.gasSafetyBps});
export function submitProposal(store:Store,input:unknown,provenance:{sessionId:string;model:string}){
  const p=proposalSchema.parse(input);const {experiment,report}=researchReport(store,p.experimentId);
  if(report.observations===0)throw Error('No evidence to analyse');
  if(p.evidenceBlocks.some(b=>!report.ledger.some(r=>r.block===b)))throw Error('Invented evidence block');
  if([experiment.baseline,experiment.candidate].some(old=>digest(policyEconomics(p.candidate))===digest(policyEconomics(old))))throw Error('Candidate economics are unchanged');
  const proposal={...p,provenance,createdAt:Math.floor(Date.now()/1000),trainingThroughBlock:Math.max(...report.ledger.map(r=>r.block)),
    state:'PROPOSED_NOT_DEPLOYED',llmCostWei:null,requires:'New frozen experiment after the full training dataset; independent cost reconciliation'};
  return {proposalHash:store.proposal(p.experimentId,proposal),proposal};
}
