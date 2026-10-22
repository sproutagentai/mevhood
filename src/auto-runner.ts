import { existsSync,readFileSync,mkdirSync,openSync,closeSync,writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { Store } from './store.ts';
import { AutoStore,checkCampaign,evidenceBundle,analyseSlot,type Campaign } from './auto-research.ts';
import { head,snapshot } from './robinhood.ts';
import { engineHash,digest,type Experiment } from './model.ts';
import { auditSource,defaultArchiveRpc } from './source-audit.ts';
import { installRpcPacing } from './rpc-pacing.ts';
import { generateResearch } from './openai-research.ts';
import { LabRuntime } from './lab-runtime.ts';
const configPath=process.env.MEVY_CAMPAIGN_CONFIG,stateRoot=process.env.MEVY_AUTO_STATE,spool=process.env.MEVY_PUBLIC_SPOOL;
if(!configPath||!stateRoot||!spool)throw Error('Explicit campaign, private state and public spool paths required');
const config=JSON.parse(readFileSync(configPath,'utf8')) as Campaign,configHash=digest(config);
if(!checkCampaign(config,Math.floor(Date.now()/1000))){console.log(JSON.stringify({state:'OUTSIDE_AUTHORIZED_CAMPAIGN'}));process.exit(0);}
if(!process.env.OPENAI_API_KEY?.trim())throw Error('OpenAI credential is missing');
mkdirSync(stateRoot,{recursive:true,mode:0o700});
// systemd supplies a singleton flock, while SQLite protects request reservations.
const store=new Store(join(stateRoot,'quotes.sqlite')),state=new AutoStore(join(stateRoot,'jobs.sqlite'),config),rpc=defaultArchiveRpc;
const log=(data:unknown)=>console.log(JSON.stringify({at:new Date().toISOString(),...data as object}));
let stopping=false;process.on('SIGTERM',()=>{stopping=true;});process.on('SIGINT',()=>{stopping=true;});
let experiment:Experiment;
let lab:LabRuntime|undefined;
async function freeze(){
 if(store.db.prepare('SELECT id FROM experiments WHERE id=?').get(config.id))return store.experiment(config.id);
 const h=await head(rpc),baseline=JSON.parse(readFileSync(new URL('../policies/baseline.json',import.meta.url),'utf8')),candidate=JSON.parse(readFileSync(new URL('../policies/candidate.json',import.meta.url),'utf8')),acceptance=JSON.parse(readFileSync(new URL('../policies/acceptance.json',import.meta.url),'utf8'));
 const body={version:1 as const,id:config.id,createdAt:Math.floor(Date.now()/1000),freezeBlock:h.number,freezeBlockHash:h.hash,trainingThroughBlock:h.number-1,baseline,candidate,acceptance,engineHash:engineHash(),llmCostWei:null,llmCostNote:'Unattended preliminary research. Model USD reservations and response usage are retained separately; WETH invoice conversion and infrastructure costs unknown. No public anchor or live promotion.'};
 const e={...body,commitment:digest(body)};store.freeze(e);return e;
}
const restore=installRpcPacing(rpc,1100);
try{
 experiment=await freeze();if(process.env.MEVY_STRATEGY_LAB==='1')lab=new LabRuntime(stateRoot!,spool!,config,experiment,state,rpc);log({state:'COLLECTING',experiment:experiment.id,endsAt:config.endsAt,intervalSeconds:config.intervalSeconds,strategyLab:!!lab});
 let next=Date.now();
 while(!stopping&&Math.floor(Date.now()/1000)<config.endsAt){
  if(digest(JSON.parse(readFileSync(configPath!,'utf8')))!==configHash)throw Error('Campaign authorization changed during runtime');
  const now=Math.floor(Date.now()/1000),slot=Math.floor((now-config.startsAt)/21600);
  try{
   // At least 120 seconds remain for a complete pair; never begin work at expiry.
   if(config.endsAt-now<120)break;
   const pending=store.observations(experiment.id).find(o=>!state.captures()[String(o.block)]);
   const h=pending?null:await head(rpc);
   if(pending){const receipt=await auditSource(evidenceBundle(experiment,[pending]),{rpc});state.capture(pending,receipt);log({state:'SOURCE_PAIR_RECOVERED',block:pending.block});}
   else if(h&&h.number-64>experiment.freezeBlock&&h.timestamp>=experiment.createdAt+10){
    const o=await snapshot([...new Set([experiment.baseline.sizeWei,experiment.candidate.sizeWei])],{extraGasWei:null,infrastructureWei:null},rpc);
    // Preserve a real source row even when its re-quote fails; its gap/error stays visible.
    store.add(experiment.id,o);
    const single=evidenceBundle(experiment,[o]);
    const receipt=await auditSource(single,{rpc});state.capture(o,receipt);
    log({state:'SOURCE_PAIR_SAVED',block:o.block,quotes:o.quotes.length,quoteErrors:o.quotes.filter(q=>q.error!==null).length});
   }
   const rows=store.observations(experiment.id),captures=state.captures();
   // Never silently discard a saved observation whose source check failed.
   if(rows.some(o=>!captures[String(o.block)]))throw Error('A saved observation lacks a successful source pair; analysis is blocked');
   if(lab&&rows.length){await lab.collect(rows.at(-1)!);await lab.cycle(slot);log({state:'STRATEGY_LAB_COLLECTED',frames:lab.store.frames().length,trials:lab.store.trials().length});}
   if(!lab&&rows.length&&slot<28&&Math.floor(Date.now()/1000)+190<config.endsAt){
    const result=await analyseSlot({state,experiment,observations:rows,slot,now:Math.floor(Date.now()/1000),root:join(stateRoot!,'runs'),spool:spool!,generate:prompt=>generateResearch(config.model,prompt)});log(result);
   }
  }catch(error){const event={state:'CYCLE_FAILED',errorType:error instanceof Error?error.name:'UnknownError',reason:error instanceof Error&&/^(Campaign|A saved observation|New quote|Authorized|History exceeds|Conservative|Missing physical|Capture source|Slot |Private slot|Recovery|Recovered|Conflicting)/.test(error.message)?error.message:'Source or model cycle failed; private receipts retain the boundary.'};state.event(event);log(event);}
  next+=120000;if(next<Date.now())next=Date.now()+1000;
  const until=Math.min(next,config.endsAt*1000);while(!stopping&&Date.now()<until)await sleep(Math.min(1000,until-Date.now()));
 }
 log({state:stopping?'STOPPED':'CAMPAIGN_COMPLETE',endsAt:config.endsAt});
}finally{restore();lab?.close();store.close();state.close();}
