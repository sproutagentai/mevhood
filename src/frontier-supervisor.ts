import {existsSync,mkdirSync,readFileSync,writeFileSync,renameSync} from 'node:fs';
import {join} from 'node:path';
import {LabRuntime} from './frontier-runtime.ts';
import {discoverCompanionPools} from './adaptive-pool-discovery.ts';
import {discoverGraph,verifyGraph,type LabGraph} from './frontier-source.ts';
import {evaluateTrial,type LabHypothesis} from './frontier-strategy.ts';
import type {Campaign,AutoStore} from './auto-research.ts';
import type {Experiment,Observation} from './model.ts';
// One serial collector and one slow discovery task share the paced RPC transport.
// Epochs preserve every graph/database; no old trial is reinterpreted against a new graph.
export class FrontierSupervisor{
 history:LabHypothesis[]=[];active:LabRuntime;pending:LabGraph|null=null;discovery:Promise<void>|null=null;lastScan:number;closed=false;
 constructor(readonly root:string,readonly spool:string,readonly campaign:Campaign,readonly control:Experiment,readonly budget:AutoStore,readonly rpc:string){
  mkdirSync(join(root,'frontier-epochs'),{recursive:true,mode:0o700});
  const saved=join(root,'frontier-current.json'),graph=existsSync(saved)?verifyGraph(JSON.parse(readFileSync(saved,'utf8'))):verifyGraph(JSON.parse(readFileSync(new URL('../evidence/frontier-universe-2026-10-23.json',import.meta.url),'utf8')));
  if(!existsSync(saved))writeFileSync(saved,JSON.stringify(graph)+'\n',{mode:0o600,flag:'wx'});
  const memory=join(root,'frontier-history.json');this.history=existsSync(memory)?JSON.parse(readFileSync(memory,'utf8')):[];this.active=this.open(graph);this.lastScan=graph.timestamp;
 }
 open(g:LabGraph){return new LabRuntime(join(this.root,'frontier-epochs',String(g.block)),this.spool,this.campaign,this.control,this.budget,this.rpc,g,this.history);}
 async collect(o:Observation){
  if(this.pending){const live=this.active.store.trials().some(t=>!evaluateTrial(t,this.active.store.frames(),this.active.graph,this.control).status.startsWith('REJECTED'));const guide=this.active.latestGuide(),waiting=guide?.kind==='EXPAND_POOLS'&&!this.active.store.get('action-result',guide.id)&&!this.active.store.get('scan-failure',guide.id);if(!live&&!waiting&&this.active.store.list('run').length){const old=this.active;this.history=[...this.history,...old.store.trials().map(t=>t.hypothesis)];const memory=join(this.root,'frontier-history.json');writeFileSync(memory+'.tmp',JSON.stringify(this.history)+'\n',{mode:0o600});renameSync(memory+'.tmp',memory);this.active=this.open(this.pending);const p=join(this.root,'frontier-current.json');writeFileSync(p+'.tmp',JSON.stringify(this.pending)+'\n',{mode:0o600});renameSync(p+'.tmp',p);old.close();this.pending=null;}}
  await this.active.collect(o);
  const now=Math.floor(Date.now()/1000);if(!this.discovery&&now-this.lastScan>=86400&&this.campaign.endsAt-now>900){
   this.lastScan=now;this.discovery=discoverGraph(this.rpc).then(g=>{if(!this.closed){this.pending=g;this.budget.event({state:'FRONTIER_POOL_SCAN_COMPLETE',block:g.block,pools:g.pools.length,events:g.scan.events.length});}}).catch(()=>{if(!this.closed)this.budget.event({state:'FRONTIER_POOL_SCAN_FAILED',unknownPools:'not-zero'});}).finally(()=>{this.discovery=null;});
  }
 }
 async cycle(slot:number){
  await this.active.cycle(slot);const guide=this.active.latestGuide();if(process.env.MEVY_FAILURE_LEARNING!=='1'||!guide||guide.kind!=='EXPAND_POOLS'||this.discovery||this.active.store.get('scan-started',guide.id)||this.campaign.endsAt-Math.floor(Date.now()/1000)<900)return;
  const origin=this.active;origin.store.put('scan-started',guide.id,{at:new Date().toISOString(),guideId:guide.id});const p=join(this.root,'frontier-probed-tokens.json'),probed=existsSync(p)?JSON.parse(readFileSync(p,'utf8')):[];
  this.discovery=discoverCompanionPools(origin.graph,this.rpc,probed).then(result=>{if(this.closed)return;const merged=[...new Set([...probed,...result.probedTokens])];writeFileSync(p+'.tmp',JSON.stringify(merged)+'\n',{mode:0o600});renameSync(p+'.tmp',p);const receipt={kind:'POOL_EXPANSION',guideId:guide.id,analysisHash:guide.analysisHash,directionId:guide.directionId,completedAt:new Date().toISOString(),previousGraphHash:origin.graph.graphHash,graphHash:result.graph.graphHash,targetTokens:result.probedTokens,probes:result.probes,addedPools:result.addedPools,graph:result.graph};origin.store.put('action-result',guide.id,receipt);origin.spoolReport('search-shift-'+result.graph.block);this.pending=result.graph;this.budget.event({state:'FAILURE_DRIVEN_POOL_EXPANSION_COMPLETE',block:result.graph.block,probedTokens:result.probedTokens.length,addedPools:result.addedPools});}).catch(()=>{if(!this.closed){origin.store.put('scan-failure',guide.id,{kind:'POOL_EXPANSION_FAILED',state:'SOURCE_DISCOVERY_FAILED',guideId:guide.id,analysisHash:guide.analysisHash,directionId:guide.directionId,at:new Date().toISOString()});origin.spoolReport('search-scan-failed-'+origin.store.frames().at(-1)!.control.block);this.budget.event({state:'FAILURE_DRIVEN_POOL_EXPANSION_FAILED',unknownNotZero:true});}}).finally(()=>{this.discovery=null;});
 }

 close(){this.closed=true;this.active.close();}
}
