import { DatabaseSync } from 'node:sqlite';
import { mkdirSync,readFileSync,writeFileSync,existsSync,renameSync } from 'node:fs';
import { dirname,join } from 'node:path';
import { digest,verifyExperiment,canonical,type Experiment,type Observation } from './model.ts';
import { evaluate } from './engine.ts';
import { auditSource,sourceFields,verifyBundle,type EvidenceBundle } from './source-audit.ts';
import { verifyHistorySource } from './research-context.ts';
import { planResearch,runResearch,validateAnalysis,type Generation } from './llm-research.ts';
export type Campaign={id:string;startsAt:number;endsAt:number;intervalSeconds:21600;collectionSeconds:120;dailyBudgetUsd:'1.000000000';totalBudgetUsd:'7.000000000';model:'gpt-6-luna';repository:'sproutagentai/mevhood';bootstrap:true};
export function checkCampaign(c:Campaign,now:number){
 if(!/^[a-z0-9-]{1,50}$/.test(c.id)||!Number.isSafeInteger(c.startsAt)||c.endsAt-c.startsAt!==604800||c.intervalSeconds!==21600||c.collectionSeconds!==120||c.dailyBudgetUsd!=='1.000000000'||c.totalBudgetUsd!=='7.000000000'||c.model!=='gpt-6-luna'||c.repository!=='sproutagentai/mevhood'||c.bootstrap!==true)throw Error('Campaign authorization mismatch');
 return now>=c.startsAt&&now<c.endsAt;
}
export function evidenceBundle(experiment:Experiment,observations:Observation[]):EvidenceBundle{
 const report=evaluate(experiment,observations),body={experiment,observations,report};return {...body,bundleHash:digest(body)};
}
// Actual single-block re-quote receipts are captured at collection time. Window
// envelopes retain the original capture, its digest and exact checked source rows.
export function bindWindowAudit(bundle:EvidenceBundle,captures:Record<string,Awaited<ReturnType<typeof auditSource>>>){
 verifyBundle(bundle);if(!bundle.observations.length)throw Error('Empty automatic window');
 const receipts=bundle.observations.map((o,offset)=>{
  const capture=captures[String(o.block)];if(!capture)throw Error('Missing physical source re-quote');
  const {receiptHash,...captureBody}=capture;
  const original=evidenceBundle(bundle.experiment,[o]);
  if(digest(captureBody)!==receiptHash||capture.bundleHash!==original.bundleHash||capture.sourceAudit!=='PASS'||capture.checks.length!==1||capture.checks[0]?.observationHash!==digest(o)||capture.checks[0]?.sourceDigest!==digest(Object.fromEntries(sourceFields.map(f=>[f,o[f]]))))throw Error('Capture source proof mismatch');
  const body={...captureBody,bundleHash:bundle.bundleHash,offset,auditedObservations:1,totalObservations:bundle.observations.length,nextOffset:offset+1<bundle.observations.length?offset+1:null,auditComplete:bundle.observations.length===1,sourceRequoted:bundle.observations.length===1,captureReceipt:capture};
  return {...body,receiptHash:digest(body)};
 });
 const first=receipts[0]!;const body={format:'mevy-history-audit/v1',bundleHash:bundle.bundleHash,source:first.source,sourceId:first.sourceId,auditComplete:true,sourceRequoted:true,auditedObservations:receipts.length,totalObservations:receipts.length,auditedQuotes:bundle.observations.reduce((n,o)=>n+o.quotes.length,0),nextOffset:null,checkedAt:new Date(Math.max(...receipts.map(r=>Date.parse(r.checkedAt)))).toISOString(),receiptHashes:receipts.map(r=>r.receiptHash),researchGate:bundle.report.researchGate};
 const summary={...body,receiptHash:digest(body)},pack={format:'mevy-history-audit-package/v1',summary,receipts};
 const result={...pack,packageHash:digest(pack)};verifyHistorySource(bundle,result);return result;
}
const nano=(s:string)=>{if(!/^\d+\.\d{9}$/.test(s))throw Error('Invalid exact USD reservation');return BigInt(s.replace('.',''));};
export class AutoStore{
 db:DatabaseSync;
 constructor(path:string,readonly campaign:Campaign){
  checkCampaign(campaign,campaign.startsAt);mkdirSync(dirname(path),{recursive:true,mode:0o700});this.db=new DatabaseSync(path);
  this.db.exec(`PRAGMA journal_mode=WAL;PRAGMA busy_timeout=5000;CREATE TABLE IF NOT EXISTS config(id INTEGER PRIMARY KEY CHECK(id=1),hash TEXT NOT NULL);CREATE TABLE IF NOT EXISTS captures(block INTEGER PRIMARY KEY,body TEXT NOT NULL);CREATE TABLE IF NOT EXISTS jobs(slot INTEGER PRIMARY KEY,body TEXT NOT NULL);CREATE TABLE IF NOT EXISTS extra_requests(id TEXT PRIMARY KEY,body TEXT NOT NULL);CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY,body TEXT NOT NULL);`);
  const r=this.db.prepare('SELECT hash FROM config WHERE id=1').get() as any;if(r&&r.hash!==digest(campaign))throw Error('Campaign configuration changed');if(!r)this.db.prepare('INSERT INTO config VALUES(1,?)').run(digest(campaign));
 }
 close(){this.db.close();}
 event(body:unknown){this.db.prepare('INSERT INTO events(body) VALUES(?)').run(canonical(body));}
 capture(o:Observation,receipt:Awaited<ReturnType<typeof auditSource>>){const body=canonical({observationHash:digest(o),receipt});const old=this.db.prepare('SELECT body FROM captures WHERE block=?').get(o.block) as any;if(old&&old.body!==body)throw Error('Conflicting physical source capture');if(!old)this.db.prepare('INSERT INTO captures VALUES(?,?)').run(o.block,body);}
 captures(){return Object.fromEntries((this.db.prepare('SELECT block,body FROM captures ORDER BY block').all() as any[]).map(x=>[String(x.block),JSON.parse(x.body).receipt]));}
 jobs(){return(this.db.prepare('SELECT body FROM jobs ORDER BY slot').all() as any[]).map(x=>JSON.parse(x.body));}
 reservations(){return [...this.jobs(),...(this.db.prepare('SELECT body FROM extra_requests ORDER BY id').all() as any[]).map(x=>JSON.parse(x.body))];}
 extra(id:string){const r=this.db.prepare('SELECT body FROM extra_requests WHERE id=?').get(id) as any;return r?JSON.parse(r.body):null;}
 reserveUpgrade(now:number,bundleHash:string,throughBlock:number,reservedUsd:string){
  return this.reserveExtra('strategy-lab-upgrade-20261022',now,bundleHash,throughBlock,reservedUsd);
 }
 reserveRepair(now:number,bundleHash:string,throughBlock:number,reservedUsd:string){
  return this.reserveExtra('structured-output-repair-20261023',now,bundleHash,throughBlock,reservedUsd);
 }
 private reserveExtra(id:'strategy-lab-upgrade-20261022'|'structured-output-repair-20261023',now:number,bundleHash:string,throughBlock:number,reservedUsd:string){
  this.db.exec('BEGIN IMMEDIATE');try{
   if(!checkCampaign(this.campaign,now)||this.extra(id))throw Error('Upgrade request outside authorization or already claimed');
   const amount=nano(reservedUsd),jobs=this.reservations(),rolling=jobs.filter(j=>j.startedAt>now-86400).reduce((n,j)=>n+nano(j.reservedUsd),0n),total=jobs.reduce((n,j)=>n+nano(j.reservedUsd),0n);
   if(amount<=0n||amount>250_000_000n||rolling+amount>1_000_000_000n||total+amount>7_000_000_000n)throw Error('Authorized rolling or campaign budget exhausted');
   const body={id,startedAt:now,bundleHash,throughBlock,reservedUsd,state:'REQUEST_RESERVED_NO_RETRY'};this.db.prepare('INSERT INTO extra_requests VALUES(?,?)').run(id,canonical(body));this.db.exec('COMMIT');return body;
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 job(slot:number){const r=this.db.prepare('SELECT body FROM jobs WHERE slot=?').get(slot) as any;return r?JSON.parse(r.body):null;}
 reserve(slot:number,now:number,bundleHash:string,throughBlock:number,reservedUsd:string){
  this.db.exec('BEGIN IMMEDIATE');try{
   if(!checkCampaign(this.campaign,now)||!Number.isSafeInteger(slot)||slot<0||slot>27||slot>Math.floor((now-this.campaign.startsAt)/21600))throw Error('Slot outside authorization');
   if(this.job(slot))throw Error('Slot already claimed; no repeated paid attempt');
   const amount=nano(reservedUsd),jobs=this.reservations(),total=jobs.reduce((n,j)=>n+nano(j.reservedUsd),0n),rolling=jobs.filter(j=>j.startedAt>now-86400).reduce((n,j)=>n+nano(j.reservedUsd),0n);
   if(jobs.some(j=>j.bundleHash===bundleHash))throw Error('Bundle already reserved; no duplicate inference');
   if(amount<=0n||rolling+amount>1_000_000_000n||total+amount>7_000_000_000n)throw Error('Authorized rolling or campaign budget exhausted');
   const body={slot,startedAt:now,bundleHash,throughBlock,reservedUsd,state:'REQUEST_RESERVED_NO_RETRY'};this.db.prepare('INSERT INTO jobs VALUES(?,?)').run(slot,canonical(body));this.db.exec('COMMIT');return body;
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 complete(slot:number,state:'ANALYSED'|'FAILED_UNKNOWN_COST',extra:Record<string,unknown>={}){const old=this.job(slot);if(!old)throw Error('Unclaimed slot');this.db.prepare('UPDATE jobs SET body=? WHERE slot=?').run(canonical({...old,...extra,state}),slot);}
}
export function publicPaths(campaign:string,slot:number){if(!/^[a-z0-9-]{1,50}$/.test(campaign)||!Number.isSafeInteger(slot)||slot<0||slot>27)throw Error('Invalid public artifact identity');const stem=`evidence/auto-${campaign}-s${String(slot).padStart(2,'0')}`;return {analysis:stem+'-analysis.json',plan:stem+'-plan.json',bundle:stem+'-bundle.json',audit:stem+'-audit.json'};}
export async function analyseSlot(args:{state:AutoStore;experiment:Experiment;observations:Observation[];slot:number;now:number;root:string;spool:string;generate:(prompt:string)=>Promise<Generation>}){
 const {state,experiment,slot,now}=args;verifyExperiment(experiment);
 const existing=state.job(slot);
 if(existing&&existsSync(join(args.spool,`slot-${slot}.json`)))return {state:'ALREADY_CLAIMED'};
 if(existing&&!existsSync(join(args.root,`slot-${slot}`,'analysis.json')))return {state:'UNKNOWN_ATTEMPT_NO_RETRY'};
 const prior=state.jobs().filter(x=>x.slot<slot),after=Math.max(experiment.freezeBlock,...prior.map(x=>x.throughBlock));
 const observations=args.observations.filter(o=>o.block>after&&(!existing||o.block<=existing.throughBlock));if(!observations.length)return {state:'NO_NEW_VERIFIED_QUOTES'};
 if(!existing&&now-observations.at(-1)!.timestamp>600)throw Error('New quote history is stale');
 const bundle=evidenceBundle(experiment,observations),audit=bindWindowAudit(bundle,state.captures());
 const prepared=planResearch(bundle,audit,'0.250000000','gpt-6-luna');
 const run=join(args.root,`slot-${slot}`);if(!existing&&existsSync(run))throw Error('Private slot directory already exists; inspect before a new request');
 // Persist reservation before creating the request marker or contacting OpenAI.
 if(existing){if(existing.bundleHash!==bundle.bundleHash)throw Error('Recovery source window mismatch');}else state.reserve(slot,now,bundle.bundleHash,observations.at(-1)!.block,prepared.plan.reservedUsd);
 try{
  const analysis=existing?JSON.parse(readFileSync(join(run,'analysis.json'),'utf8')):await runResearch(prepared,run,args.generate);
  const {analysisHash,...analysisBody}=analysis;
  if(digest(analysisBody)!==analysisHash||analysis.planHash!==prepared.plan.planHash)throw Error('Recovered analysis integrity mismatch');validateAnalysis(analysis.analysis,prepared.context);
  const paths=publicPaths(state.campaign.id,slot),files=Object.fromEntries([[paths.bundle,bundle],[paths.audit,audit],[paths.plan,prepared.plan],[paths.analysis,analysis]].map(([path,value])=>[path,JSON.stringify(value,null,2)+'\n']));
  const record={format:'mevy-publication/v1',campaign:state.campaign,slot,paths,files,analysisHash:analysis.analysisHash,createdAt:analysis.createdAt,decision:analysis.analysis.decision,observations:observations.length,quotes:prepared.plan.quotes,bundleHash:bundle.bundleHash,bootstrap:slot===0};
  mkdirSync(args.spool,{recursive:true,mode:0o750});const tmp=join(args.spool,`.slot-${slot}.tmp`),dest=join(args.spool,`slot-${slot}.json`);if(existsSync(dest))throw Error('Publication already exists');const text=JSON.stringify(record,null,2)+'\n';if(existsSync(tmp)){if(readFileSync(tmp,'utf8')!==text)throw Error('Conflicting partial publication');}else writeFileSync(tmp,text,{flag:'wx',mode:0o640});renameSync(tmp,dest);
  state.complete(slot,'ANALYSED',{analysisHash:analysis.analysisHash});return {state:'ANALYSED',analysisHash:analysis.analysisHash,decision:analysis.analysis.decision};
 }catch(e){state.complete(slot,'FAILED_UNKNOWN_COST');throw e;}
}
