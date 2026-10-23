import { DatabaseSync } from 'node:sqlite';
import { mkdirSync,readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';
import { digest,canonical,hash,uint,type Experiment } from './model.ts';
import { decision } from './engine.ts';
import { cellSchema,verifyFrame,verifyGraph,type LabFrame,type LabGraph,type LabCell,labSizes,labTokens } from './frontier-source.ts';

export const strategySchema=cellSchema.extend({minEdgeBps:z.number().int().min(1).max(500),gasSafetyBps:z.number().int().min(12000).max(30000),persistence:z.number().int().min(1).max(3),maxGasPriceWei:uint.nullable(),family:z.enum(['EXACT_EDGE','SIZE_CURVE','QUOTE_IMPROVEMENT']),minImprovementBps:z.number().int().min(1).max(500)}).strict();
export type LabStrategy=z.infer<typeof strategySchema>;
export const hypothesisSchema=z.object({name:z.string().min(4).max(80),strategy:strategySchema,rationale:z.string().min(30).max(1200),failureCondition:z.string().min(30).max(1200),evidenceBlocks:z.array(z.number().int().positive()).min(1).max(8)}).strict();
export const discoverySchema=z.object({summary:z.string().min(30).max(1600),hypotheses:z.array(hypothesisSchema).min(1).max(2),limitations:z.array(z.string().min(10).max(400)).min(2).max(6)}).strict();
export type LabHypothesis=z.infer<typeof hypothesisSchema>;
export type LabTrial={id:string;hypothesis:LabHypothesis;trainingThroughBlock:number;trainingFramesHash:string;graphHash:string;controlCommitment:string;evaluatorHash:string;proposedAt:string;proposalHead:number;modelAnalysisHash:string;screenObservations:10;publicAnchor:null|{commit:string;seenAt:string;startBlock:number;startTimestamp:number};trialHash:string};
export const labEvaluatorHash=()=>digest(Object.fromEntries(['src/frontier-strategy.ts','src/frontier-source.ts'].map(p=>[p,readFileSync(new URL('../'+p,import.meta.url),'utf8')])));
export const strategyId=(s:LabStrategy)=>digest(strategySchema.parse(s));
export function validateHypotheses(input:unknown,graph:LabGraph,training:LabFrame[],prior:LabTrial[],archived:LabHypothesis[]=[]){
 const a=discoverySchema.parse(input),blocks=new Set(training.map(f=>f.control.block)),seen=new Set(prior.map(t=>strategyId(t.hypothesis.strategy)));
 const usedCells=new Set(prior.map(t=>digest({routeId:t.hypothesis.strategy.routeId,sizeWei:t.hypothesis.strategy.sizeWei,family:t.hypothesis.strategy.family})));
 for(const h of archived){const s=h.strategy;usedCells.add(digest({routeId:s.routeId,sizeWei:s.sizeWei,family:s.family}));}
 for(const h of a.hypotheses){
  const s=h.strategy;if(!graph.routes.some(r=>r.id===s.routeId)||h.evidenceBlocks.some(b=>!blocks.has(b)))throw Error('Hypothesis cites unavailable route or block');
  // A new threshold on an already rejected quote cell is not a new search direction.
  const cell=digest({routeId:s.routeId,sizeWei:s.sizeWei,family:s.family});if(seen.has(strategyId(s))||usedCells.has(cell))throw Error('Duplicate or recycled strategy cell');
  if(s.family==='SIZE_CURVE'&&BigInt(s.sizeWei)<5000000000000000n)throw Error('Size curve needs at least three exact sizes');
  if(s.family==='EXACT_EDGE'&&graph.routes.find(r=>r.id===s.routeId)!.tokens.length===3&&s.sizeWei==='1000000000000000'&&s.minEdgeBps===20&&s.gasSafetyBps===15000&&s.persistence===1&&s.maxGasPriceWei===null)throw Error('Unchanged control route restriction is not a new experiment');
  seen.add(strategyId(s));usedCells.add(cell);
 }const isNew=(id:string)=>graph.routes.find(r=>r.id===id)!.tokens.some(t=>!labTokens.some(old=>old.address.toLowerCase()===t.toLowerCase()));if(graph.routes.some(r=>isNew(r.id))&&!a.hypotheses.some(h=>isNew(h.strategy.routeId)))throw Error('Expansion must test a route outside the four-token universe');if(!a.hypotheses.some(h=>h.strategy.family!=='EXACT_EDGE'))throw Error('Expansion must test a causal or size-curve family');return a;
}
export function freezeTrial(h:LabHypothesis,graph:LabGraph,training:LabFrame[],control:Experiment,modelAnalysisHash:string,head:{number:number;timestamp:number},now=Date.now()):LabTrial{
 const through=Math.max(...training.map(f=>f.control.block));if(head.number<=through||!training.length)throw Error('Trial freeze overlaps training');
 const body={id:strategyId(h.strategy),hypothesis:h,trainingThroughBlock:through,trainingFramesHash:digest(training.map(f=>f.frameHash)),graphHash:graph.graphHash,controlCommitment:control.commitment,evaluatorHash:labEvaluatorHash(),proposedAt:new Date(now).toISOString(),proposalHead:head.number,modelAnalysisHash,screenObservations:10 as const};
 return {...body,trialHash:digest(body),publicAnchor:null};
}
export function verifyTrial(t:LabTrial){const {trialHash,publicAnchor,...body}=t;hypothesisSchema.parse(t.hypothesis);hash.parse(trialHash);if(digest(body)!==trialHash||t.id!==strategyId(t.hypothesis.strategy)||t.screenObservations!==10||t.proposalHead<=t.trainingThroughBlock||t.evaluatorHash!==labEvaluatorHash())throw Error('Frozen trial integrity mismatch');if(publicAnchor&&(!/^[a-f0-9]{40}$/.test(publicAnchor.commit)||publicAnchor.startBlock<t.proposalHead||publicAnchor.startTimestamp<Math.floor(Date.parse(t.proposedAt)/1000)))throw Error('Invalid public trial activation');return t;}
function opportunity(size:string,edge:number,safety:number,out:string,gasUnits:string,price:string){const gross=BigInt(out)-BigInt(size),gas=BigInt(gasUnits)*BigInt(price),budget=(gas*BigInt(safety)+9999n)/10000n;return {eligible:gross-budget>=(BigInt(size)*BigInt(edge)+9999n)/10000n,net:gross-gas};}
export function evaluateTrial(trial:LabTrial,frames:LabFrame[],graph:LabGraph,control:Experiment){
 verifyTrial(trial);verifyGraph(graph);if(trial.graphHash!==graph.graphHash||trial.controlCommitment!==control.commitment)throw Error('Trial control/graph mismatch');
 const anchor=trial.publicAnchor,rows=anchor?frames.filter(f=>f.control.block>anchor.startBlock&&f.control.block>trial.trainingThroughBlock&&f.control.timestamp>=anchor.startTimestamp&&f.control.collectedAt>=Math.floor(Date.parse(anchor.seenAt)/1000)).sort((a,b)=>a.control.block-b.control.block):[];
 let previousQuote:LabFrame['quotes'][number]|null=null;let candidateSignals=0,controlSignals=0,actualControlSelections=0,covered=0,streak=0,priorTime=anchor?.startTimestamp??0,priorBlock=anchor?.startBlock??0,candidateNet=0n,controlNet=0n,maxGap=0;const issues=new Set<string>(),ledger:any[]=[];
 for(const frame of rows){verifyFrame(frame,graph);const o=frame.control,s=trial.hypothesis.strategy;if(o.block<=priorBlock)throw Error('Duplicate or overlapping forward frame');maxGap=Math.max(maxGap,o.timestamp-priorTime);if(o.timestamp-priorTime>control.acceptance.maxGapSeconds)issues.add('SOURCE_GAP');priorTime=o.timestamp;priorBlock=o.block;
  const cells=s.family==='SIZE_CURVE'?labSizes.filter(n=>BigInt(n)<=BigInt(s.sizeWei)):[s.sizeWei],curve=cells.map(size=>frame.quotes.find(q=>q.routeId===s.routeId&&q.sizeWei===size));
  const q=s.family==='SIZE_CURVE'?curve.filter((q):q is LabFrame['quotes'][number]=>!!q).sort((a,b)=>{const na=BigInt(a.amountOutWei)-BigInt(a.sizeWei)-BigInt(a.gasUnits)*BigInt(o.gasPriceWei),nb=BigInt(b.amountOutWei)-BigInt(b.sizeWei)-BigInt(b.gasUnits)*BigInt(o.gasPriceWei);return na>nb?-1:na<nb?1:BigInt(a.sizeWei)<BigInt(b.sizeWei)?-1:1;})[0]:curve[0],sourceOK=curve.every(x=>!!x&&x.error===null)&&!!q&&q.error===null&&o.errors.length===0&&o.quotes.every(x=>x.error===null);if(!sourceOK){issues.add('MISSING_PAIRED_QUOTES');streak=0;}else covered++;
  const candidate=q&&sourceOK?opportunity(q.sizeWei,s.minEdgeBps,s.gasSafetyBps,q.amountOutWei,q.gasUnits,o.gasPriceWei):null;
  const improving=s.family!=='QUOTE_IMPROVEMENT'||!!previousQuote&&!!q&&(BigInt(q.amountOutWei)-BigInt(previousQuote.amountOutWei))*10000n>=BigInt(q.sizeWei)*BigInt(s.minImprovementBps);previousQuote=sourceOK&&q?q:null;
  if(improving&&candidate?.eligible&&(s.maxGasPriceWei===null||BigInt(o.gasPriceWei)<=BigInt(s.maxGasPriceWei)))streak++;else streak=0;
  const choose=sourceOK&&streak>=s.persistence;if(choose&&sourceOK){candidateSignals++;candidateNet+=candidate!.net;}
  const eligible=o.quotes.filter(q=>q.error===null&&q.sizeWei===control.baseline.sizeWei).map(q=>opportunity(q.sizeWei,control.baseline.minEdgeBps,control.baseline.gasSafetyBps,q.amountOutWei,q.gasUnits,o.gasPriceWei)).filter(x=>x.eligible).sort((a,b)=>a.net>b.net?-1:1);
  if(sourceOK&&eligible[0]){controlSignals++;controlNet+=eligible[0].net;}const exact=decision(control.baseline,o);if(exact.trade)actualControlSelections++;
  if(o.extraGasWei===null)issues.add('EXTRA_GAS_UNKNOWN');if(o.infrastructureWei===null)issues.add('INFRA_COST_UNKNOWN');
  ledger.push({block:o.block,frameHash:frame.frameHash,sourceOK,selectedSizeWei:q?.sizeWei??null,quoteImproving:improving,candidateSignal:choose,controlSignal:sourceOK&&eligible.length>0,actualControlSelection:exact.trade});
  // A predeclared ten-row futility screen stops a failed idea; promising ideas
  // continue prospectively toward the unchanged long-horizon acceptance gate.
  if(ledger.length===10&&(covered<10||candidateSignals===0||candidateNet<=controlNet))break;
 }
 issues.add('LLM_COST_UNRECONCILED');issues.add('PRELIMINARY_SCREEN_NOT_SEVEN_DAY_TRIAL');
 const status=!anchor?'AWAITING_PUBLIC_FREEZE':ledger.length>=10?(covered<10?'REJECTED_SOURCE':candidateSignals===0?'REJECTED_NO_SIGNAL':candidateNet<=controlNet?'REJECTED_VS_CONTROL':'FORWARD_TESTING_LONG'):'FORWARD_TESTING';
 const body={trialId:trial.id,trialHash:trial.trialHash,status,observations:ledger.length,pairedObservations:covered,requiredScreenObservations:10,longAcceptance:control.acceptance,trainingThroughBlock:trial.trainingThroughBlock,forwardStartBlock:anchor?.startBlock??null,firstBlock:ledger[0]?.block??null,lastBlock:ledger.at(-1)?.block??null,maxGapSeconds:maxGap,candidateSignals,controlSignals,actualControlSelections,candidateKnownGasQuoteWei:candidateNet.toString(),controlKnownGasQuoteWei:controlNet.toString(),knownGasQuoteDeltaWei:(candidateNet-controlNet).toString(),completePaperNetWei:null,researchGate:'HOLD',livePromotion:'DISABLED',issues:[...issues].sort(),ledger,boundary:'Ten-observation prospective futility screen followed by longer forward collection for promising ideas. This is not seven-day acceptance. Signals assume known gas only, are not fills or complete profit, and do not authorize a policy change.'};return {...body,resultHash:digest(body)};
}
export class LabStore{
 db:DatabaseSync;
 constructor(path:string){mkdirSync(dirname(path),{recursive:true,mode:0o700});this.db=new DatabaseSync(path);this.db.exec('PRAGMA journal_mode=WAL;PRAGMA busy_timeout=5000;CREATE TABLE IF NOT EXISTS lab_items(kind TEXT,id TEXT,body TEXT NOT NULL,PRIMARY KEY(kind,id));');}
 close(){this.db.close();}
 put(kind:string,id:string,body:unknown){const text=canonical(body),old=this.db.prepare('SELECT body FROM lab_items WHERE kind=? AND id=?').get(kind,id) as any;if(old&&old.body!==text)throw Error('Conflicting immutable lab record');if(!old)this.db.prepare('INSERT INTO lab_items VALUES(?,?,?)').run(kind,id,text);}
 get<T=any>(kind:string,id:string):T|null{const r=this.db.prepare('SELECT body FROM lab_items WHERE kind=? AND id=?').get(kind,id) as any;return r?JSON.parse(r.body):null;}
 list<T=any>(kind:string):T[]{return (this.db.prepare('SELECT body FROM lab_items WHERE kind=? ORDER BY id').all(kind) as any[]).map(x=>JSON.parse(x.body));}
 trials():LabTrial[]{return this.list<LabTrial>('trial').map(t=>({...t,publicAnchor:this.get('anchor',t.id)}));}
 frames():LabFrame[]{return this.list<LabFrame>('frame').sort((a,b)=>a.control.block-b.control.block);}
 mandatory(g:LabGraph,e:Experiment):LabCell[]{const frames=this.frames();return this.trials().filter(t=>!evaluateTrial(t,frames,g,e).status.startsWith('REJECTED')&&evaluateTrial(t,frames,g,e).status!=='SHORT_SCREEN_POSITIVE').flatMap(t=>(t.hypothesis.strategy.family==='SIZE_CURVE'?labSizes.filter(n=>BigInt(n)<=BigInt(t.hypothesis.strategy.sizeWei)):[t.hypothesis.strategy.sizeWei]).map(sizeWei=>({routeId:t.hypothesis.strategy.routeId,sizeWei})));}
}
// Provider schema restricts references to the exact supplied menu and training block set.
export function outputSchema(context:{availableCells:{routeId:string}[];observations:{block:number}[]}){
 const ids=[...new Set(context.availableCells.map(c=>c.routeId))];if(!ids.length||!context.observations.length)throw Error('Empty frontier schema source');
 const blocks=context.observations.map(o=>z.literal(o.block));
 return discoverySchema.extend({hypotheses:z.array(hypothesisSchema.extend({strategy:strategySchema.extend({routeId:z.enum(ids as [string,...string[]])}),evidenceBlocks:z.array(z.union(blocks as [typeof blocks[number],typeof blocks[number],...typeof blocks[number][]])).min(1).max(8)})).min(1).max(2)});
}
