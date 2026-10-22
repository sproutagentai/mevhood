import { readFileSync,writeFileSync,renameSync,existsSync,mkdirSync,readdirSync,unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { digest,type Experiment } from './model.ts';
import { head } from './robinhood.ts';
import { AutoStore,type Campaign } from './auto-research.ts';
import { LabStore,freezeTrial,evaluateTrial,type LabTrial } from './strategy-lab.ts';
import { verifyGraph,quoteLabFrame,searchCells,type LabGraph,type LabFrame } from './lab-source.ts';
import { planDiscovery,runDiscovery } from './lab-research.ts';
import { labRecord,validateLabRecord,labStem,type LabRun } from './lab-publication.ts';
import { readResearchAttempts } from './lab-attempts.ts';
export class LabRuntime{
 store:LabStore;graph:LabGraph;
 lastPublicCheck=0;
 constructor(readonly root:string,readonly spool:string,readonly campaign:Campaign,readonly control:Experiment,readonly budget:AutoStore,readonly rpc:string){
  this.store=new LabStore(join(root,'lab.sqlite'));this.graph=verifyGraph(JSON.parse(readFileSync(new URL('../evidence/lab-universe-2026-10-22.json',import.meta.url),'utf8')));this.store.put('graph',this.graph.graphHash,this.graph);
 }
 async collect(control:LabFrame['control']){
  if(control.block<=this.graph.block||this.store.get('frame',String(control.block)))return;
  const cells=searchCells(this.graph,this.store.frames(),this.store.mandatory(this.graph,this.control));
  const frame=await quoteLabFrame(this.graph,control,cells,this.rpc,this.budget.captures()[String(control.block)]!);this.store.put('frame',String(control.block),frame);
 }
 async activate(){
  const waiting=this.store.trials().filter(t=>!t.publicAnchor);if(!waiting.length&&Date.now()-this.lastPublicCheck<600000)return;this.lastPublicCheck=Date.now();
  const read=async(url:string)=>{const r=await fetch(url,{signal:AbortSignal.timeout(18000),headers:{'User-Agent':'Mevy-research-source-check'}});if(!r.ok)throw Error('Public freeze check unavailable');const t=await r.text();if(t.length>8_000_000)throw Error('Public freeze response too large');return t;};
  const meta=JSON.parse(await read('https://api.github.com/repos/sproutagentai/mevhood/commits/main'));if(!/^[a-f0-9]{40}$/.test(meta.sha))throw Error('Invalid public freeze revision');
  const base=`https://raw.githubusercontent.com/sproutagentai/mevhood/${meta.sha}/`,manifest=JSON.parse(await read(base+'PUBLIC_FILES.json'));
  const verified=async(p:string)=>{if(!/^evidence\/[a-z0-9-]+\.json$/.test(p))throw Error('Invalid public freeze path');const t=await read(base+p);if(createHash('sha256').update(t).digest('hex')!==manifest.files[p])throw Error('Public freeze hash mismatch');return JSON.parse(t);};
  if(!manifest.files['evidence/discovery-index.json'])return;const index=await verified('evidence/discovery-index.json'),report=await verified(index.latest.path);
  const {reportHash,...body}=report;if(reportHash!==index.latest.reportHash||digest(body)!==reportHash)throw Error('Public trial report mismatch');
  // The publisher has read-only spool access. Only the producer removes a
  // delivered envelope, after its hash appears in the verified public index.
  this.adoptPublications(index);
  if(!waiting.length)return;
  const h=await head(this.rpc),now=new Date().toISOString();
  for(const t of waiting)if(report.trials.some((r:any)=>r.trial.trialHash===t.trialHash))this.store.put('anchor',t.id,{commit:meta.sha,seenAt:now,startBlock:h.number,startTimestamp:Math.max(h.timestamp,Math.floor(Date.now()/1000))});
 }
 adoptPublications(index:any){
  if(index.format!=='mevy-strategy-lab-index/v1'||digest(index.campaign)!==digest(this.campaign)||!Array.isArray(index.reports))throw Error('Published lab campaign differs');
  const prefix=labStem(this.campaign)+'-',published=new Set<string>();
  for(const r of index.reports){if(typeof r.path!=='string'||!r.path.startsWith(prefix)||!r.path.endsWith('-report.json')||!/^0x[a-f0-9]{64}$/.test(r.reportHash)||!Number.isFinite(Date.parse(r.createdAt)))throw Error('Invalid public lab envelope identity');const id=r.path.slice(prefix.length,-'-report.json'.length);if(!/^[a-z0-9-]{1,70}$/.test(id))throw Error('Invalid public lab run identity');const old=this.store.get('spooled',id);if(old&&old.reportHash!==r.reportHash)throw Error('Public and private envelope hashes conflict');if(!old)this.store.put('spooled',id,{id,at:Date.parse(r.createdAt),reportHash:r.reportHash});published.add(r.reportHash);}
  for(const name of readdirSync(this.spool).filter(n=>/^lab-[a-z0-9-]+\.json$/.test(n))){const p=join(this.spool,name),r=JSON.parse(readFileSync(p,'utf8'));if(digest(r.campaign)===digest(this.campaign)&&published.has(r.reportHash))unlinkSync(p);}
 }
 spoolReport(id:string){
  if(this.store.get('spooled',id))return;
  const path=join(this.spool,`lab-${id}.json`);
  if(existsSync(path)){const original=JSON.parse(readFileSync(path,'utf8'));if(original.id!==id||digest(original.campaign)!==digest(this.campaign))throw Error('Conflicting lab spool identity');const {report}=validateLabRecord(original);this.store.put('spooled',id,{id,at:Date.parse(report.createdAt),reportHash:original.reportHash});return;}
  const frames=this.store.frames(),record=labRecord(this.campaign,id,this.graph,frames,this.store.trials(),this.store.list<LabRun>('run'),this.control,readResearchAttempts(join(this.root,'runs')));
  mkdirSync(this.spool,{recursive:true,mode:0o750});const tmp=path+'.tmp';writeFileSync(tmp,JSON.stringify(record)+'\n',{mode:0o640});renameSync(tmp,path);this.store.put('spooled',id,{id,at:Date.now(),reportHash:record.reportHash});
 }
 async analyse(id:string,slot:number|null){
  if(this.campaign.endsAt-Math.floor(Date.now()/1000)<240)return;
  if(this.store.get('run',id)){this.spoolReport('research-'+id);return;}
  const repair=id==='repair-20261023',priorRuns=this.store.list<LabRun>('run'),through=Math.max(this.graph.block,...priorRuns.flatMap(r=>r.trainingBlocks)),frames=this.store.frames(),run=join(this.root,'runs',`lab-${id}`),claimed=slot===null?this.budget.extra(repair?'structured-output-repair-20261023':'strategy-lab-upgrade-20261022'):this.budget.job(slot);
  let training=frames.filter(f=>f.control.block>through),prior=this.store.trials();
  if(claimed){if(!existsSync(join(run,'analysis.json')))return;const saved=JSON.parse(readFileSync(join(run,'context.json'),'utf8')),blocks=new Set(saved.observations.map((o:any)=>o.block));training=frames.filter(f=>blocks.has(f.control.block));prior=JSON.parse(readFileSync(join(run,'prior-trials.json'),'utf8'));}
  if(training.length<6)return;
  const active=prior.filter(t=>{const s=evaluateTrial(t,frames,this.graph,this.control).status;return s==='AWAITING_PUBLIC_FREEZE'||s.startsWith('FORWARD_TESTING');});if(active.length>1)return;
  const generationProfile=claimed?JSON.parse(readFileSync(join(run,'plan.json'),'utf8')).format==='mevy-discovery-plan/v2'?'v2':'v1':'v2';
  const prepared=planDiscovery(this.graph,training,prior,this.control,frames.filter(f=>f.control.block<=training.at(-1)!.control.block),generationProfile);
  if(!claimed){if(slot===null){const reserve=repair?this.budget.reserveRepair.bind(this.budget):this.budget.reserveUpgrade.bind(this.budget);reserve(Math.floor(Date.now()/1000),prepared.plan.contextHash,training.at(-1)!.control.block,prepared.plan.reservedUsd);}else this.budget.reserve(slot,Math.floor(Date.now()/1000),prepared.plan.contextHash,training.at(-1)!.control.block,prepared.plan.reservedUsd);}
  const analysis=await runDiscovery(prepared,run,this.graph,training,prior),h=await head(this.rpc);if(analysis.planHash!==prepared.plan.planHash||analysis.contextHash!==prepared.plan.contextHash)throw Error('Recovery discovery context changed');
  const entry={id,analysis,plan:prepared.plan,context:prepared.context,trainingBlocks:training.map(f=>f.control.block),priorTrials:prior};
  this.store.db.exec('BEGIN IMMEDIATE');try{this.store.put('run',id,entry);for(const hypothesis of analysis.analysis.hypotheses){const t=freezeTrial(hypothesis,this.graph,training,this.control,analysis.analysisHash,h);this.store.put('trial',t.id,t);}this.store.db.exec('COMMIT');}catch(e){this.store.db.exec('ROLLBACK');throw e;}
  if(slot!==null)this.budget.complete(slot,'ANALYSED',{kind:'STRATEGY_DISCOVERY',analysisHash:analysis.analysisHash});this.spoolReport('research-'+id);
 }
 async cycle(slot:number){
  await this.activate();
  await this.analyse('launch-20261022',null);
  if(process.env.MEVY_RESEARCH_REPAIR==='20261023')await this.analyse('repair-20261023',null);
  if(this.store.get('run','launch-20261022')&&!this.budget.job(slot))await this.analyse(`slot-${slot}`,slot);
  const frames=this.store.frames();if(!frames.length||!this.store.trials().length)return;
  const last=this.store.list<{at:number}>('spooled').sort((a,b)=>b.at-a.at)[0],results=this.store.trials().map(t=>evaluateTrial(t,frames,this.graph,this.control)),n=results.reduce((a,r)=>a+r.observations,0),now=Date.now();
  const firstForward=n>=3&&!this.store.get('milestone','first-forward'),screened=results.filter(r=>r.observations>=10).length,reportedScreens=Math.max(0,...this.store.list<number>('screen-count'));
  if(firstForward||screened>reportedScreens||!last||now-last.at>=1800000){this.spoolReport('progress-'+frames.at(-1)!.control.block);if(firstForward)this.store.put('milestone','first-forward',true);if(screened>reportedScreens)this.store.put('screen-count',String(screened),screened);}
 }
 close(){this.store.close();}
}
