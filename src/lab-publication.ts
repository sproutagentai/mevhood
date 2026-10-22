import { createHash } from 'node:crypto';
import { canonical,digest,verifyExperiment,engineHash,type Experiment } from './model.ts';
import { checkCampaign,type Campaign } from './auto-research.ts';
import { verifyGraph,verifyFrame,type LabGraph,type LabFrame } from './lab-source.ts';
import { verifyTrial,evaluateTrial,validateHypotheses,type LabTrial } from './strategy-lab.ts';
import { planDiscovery } from './lab-research.ts';
import { attemptsSchema,type ResearchAttempt } from './lab-attempts.ts';
export type LabRun={id:string;analysis:any;plan:any;context:any;trainingBlocks:number[];priorTrials:LabTrial[]};
const text=(v:unknown)=>JSON.stringify(v,null,2)+'\n',sha=(s:string)=>createHash('sha256').update(s).digest('hex');
export function labStem(c:Campaign){checkCampaign(c,c.startsAt);return `evidence/lab-${c.id}`;}
export function labRecord(campaign:Campaign,id:string,graph:LabGraph,frames:LabFrame[],trials:LabTrial[],runs:LabRun[],control:Experiment,attempts:ResearchAttempt[]=[]){
 if(!/^[a-z0-9-]{1,70}$/.test(id)||!frames.length||frames.length>6000)throw Error('Invalid lab publication range');
 const stem=labStem(campaign),files:Record<string,string>={},graphPath=stem+'-graph.json';files[graphPath]=text(graph);
 const sources=frames.map(f=>{const path=stem+`-frame-${f.control.block}.json`;files[path]=text(f);return {path,block:f.control.block,frameHash:f.frameHash};});
 const modelRuns=runs.map(({analysis,plan,context,...r})=>{const paths={analysis:stem+`-${r.id}-analysis.json`,plan:stem+`-${r.id}-plan.json`,context:stem+`-${r.id}-context.json`};files[paths.analysis]=text(analysis);files[paths.plan]=text(plan);files[paths.context]=text(context);return {...r,analysisHash:analysis.analysisHash,createdAt:analysis.createdAt,paths};});
 const results=trials.map(t=>({trial:t,result:evaluateTrial(t,frames,graph,control)})),cells=new Set(frames.flatMap(f=>f.quotes.map(q=>digest({routeId:q.routeId,sizeWei:q.sizeWei}))));
 const attemptsPath=attempts.length?stem+`-${id}-attempts.json`:null;if(attemptsPath)files[attemptsPath]=text(attemptsSchema.parse(attempts));
 const body={format:'mevy-strategy-lab-report/v1',createdAt:new Date().toISOString(),campaign,graphPath,graphHash:graph.graphHash,control,sources,modelRuns,trials:results,search:{pools:graph.pools.length,routes:graph.routes.length,triangularRoutes:graph.routes.filter(r=>r.family==='triangle').length,sizes:4,totalCells:graph.routes.length*4,quotedCells:cells.size,observations:frames.length,quotes:frames.reduce((n,f)=>n+f.quotes.length,0),quoteErrors:frames.reduce((n,f)=>n+f.quotes.filter(q=>q.error!==null).length,0)},livePromotion:'DISABLED',boundary:'Versioned bounded strategy search. Training and publicly activated forward rows are distinct. Unknown costs and the unchanged seven-day gate prevent a profit or live-promotion claim.'};
 const extended=attemptsPath?{...body,attemptsPath}:body,report={...extended,reportHash:digest(extended)},reportPath=stem+`-${id}-report.json`;files[reportPath]=text(report);return {format:'mevy-lab-publication/v1',campaign,id,reportPath,reportHash:report.reportHash,files};
}
export function validateLabRecord(record:any){
 const campaign=record.campaign as Campaign;checkCampaign(campaign,campaign.startsAt);if(record.format!=='mevy-lab-publication/v1'||!record.files||!record.files[record.reportPath])throw Error('Invalid lab publication');
 const stem=labStem(campaign);for(const [p,t] of Object.entries(record.files))if(typeof t!=='string'||t.length>8_000_000||!p.startsWith(stem+'-')||!/^evidence\/lab-[a-z0-9-]+\.json$/.test(p)||/sk-(?:proj|svcacct)-|github_pat_|ghp_|-----BEGIN [A-Z ]*PRIVATE KEY-----|\/Users\//.test(t))throw Error('Invalid private/path lab artifact');
 const read=(p:string)=>{if(!record.files[p])throw Error('Missing complete lab source');return JSON.parse(record.files[p]);},report=read(record.reportPath),{reportHash,...body}=report;
 if(report.format!=='mevy-strategy-lab-report/v1'||digest(body)!==reportHash||reportHash!==record.reportHash||canonical(report.campaign)!==canonical(campaign)||report.livePromotion!=='DISABLED')throw Error('Lab report integrity mismatch');
 verifyExperiment(report.control);if(report.control.id!==campaign.id||report.control.engineHash!==engineHash())throw Error('Lab control/evaluator mismatch');
 const graph=verifyGraph(read(report.graphPath)),frames=report.sources.map((s:any)=>{const f=verifyFrame(read(s.path),graph);if(f.frameHash!==s.frameHash||f.control.block!==s.block)throw Error('Lab source reference mismatch');return f;}) as LabFrame[];
 if(graph.graphHash!==report.graphHash||new Set(frames.map(f=>f.control.block)).size!==frames.length)throw Error('Invalid lab source range');
 const allowed=new Set([record.reportPath,report.graphPath,...report.sources.map((s:any)=>s.path)]);
 const attempts=report.attemptsPath?attemptsSchema.parse(read(report.attemptsPath)):[];if(report.attemptsPath)allowed.add(report.attemptsPath);
 for(const run of report.modelRuns){Object.values(run.paths).forEach(p=>allowed.add(p));const analysis=read(run.paths.analysis),plan=read(run.paths.plan),context=read(run.paths.context),training=run.trainingBlocks.map((b:number)=>frames.find(f=>f.control.block===b));if(training.some((f:any)=>!f))throw Error('Missing model training frames');
  const through=Math.max(...run.trainingBlocks),prepared=planDiscovery(graph,training,run.priorTrials,report.control,frames.filter(f=>f.control.block<=through),plan.format==='mevy-discovery-plan/v2'?'v2':'v1'),{analysisHash,...a}=analysis;
  if(canonical(plan)!==canonical(prepared.plan)||canonical(context)!==canonical(prepared.context)||analysis.planHash!==plan.planHash||analysis.contextHash!==plan.contextHash||digest(a)!==analysisHash||analysis.trainingFramesHash!==plan.trainingFramesHash||!analysis.responseId||!analysis.model.startsWith('gpt-6-luna'))throw Error('Lab model evidence mismatch');validateHypotheses(analysis.analysis,graph,training,run.priorTrials);
 }
 for(const row of report.trials){verifyTrial(row.trial);if(canonical(evaluateTrial(row.trial,frames,graph,report.control))!==canonical(row.result))throw Error('Forward trial replay mismatch');const run=report.modelRuns.find((r:any)=>read(r.paths.analysis).analysisHash===row.trial.modelAnalysisHash);if(!run||!read(run.paths.analysis).analysis.hypotheses.some((h:any)=>canonical(h)===canonical(row.trial.hypothesis))||row.trial.trainingFramesHash!==read(run.paths.plan).trainingFramesHash)throw Error('Trial lacks its actual model hypothesis');}
 if(canonical([...allowed].sort())!==canonical(Object.keys(record.files).sort()))throw Error('Unexpected lab publication file');
 for(const attempt of attempts)if(attempt.outcome==='SUCCEEDED'&&!report.modelRuns.some((r:any)=>r.analysisHash===attempt.analysisHash))throw Error('Successful attempt lacks original model evidence');
 const rebuilt=labRecord(campaign,record.id,graph,frames,report.trials.map((r:any)=>r.trial),report.modelRuns.map((r:any)=>({...r,analysis:read(r.paths.analysis),plan:read(r.paths.plan),context:read(r.paths.context)})),report.control,attempts);if(canonical(JSON.parse(rebuilt.files[rebuilt.reportPath]!).search)!==canonical(report.search))throw Error('Lab search totals mismatch');
 return {report,graph,frames};
}
export function appendLabPublication(record:any,index:any,manifest:any,read:(p:string)=>string){
 const {report}=validateLabRecord(record);if(index&&index.format!=='mevy-strategy-lab-index/v1')throw Error('Invalid lab index');
 if(index?.reports.some((r:any)=>r.reportHash===record.reportHash)){for(const [p,t] of Object.entries(record.files))if(read(p)!==t)throw Error('Published lab bytes conflict');return null;}
 for(const [p,t] of Object.entries(record.files))if(manifest.files[p]&&read(p)!==t)throw Error('Cannot rewrite lab evidence');
 const entry={path:record.reportPath,reportHash:record.reportHash,createdAt:report.createdAt,trials:report.trials.length,observations:report.search.observations};
 const next={format:'mevy-strategy-lab-index/v1',campaign:record.campaign,latest:entry,reports:[entry,...(index?.reports??[])]},files={...record.files,'evidence/discovery-index.json':text(next)} as Record<string,string>,hashes={...manifest.files};for(const [p,t] of Object.entries(files))hashes[p]=sha(t);
 files['PUBLIC_FILES.json']=text({algorithm:'sha256',files:Object.fromEntries(Object.entries(hashes).sort(([a],[b])=>a.localeCompare(b,'en')))});return files;
}
