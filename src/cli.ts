import { readFileSync,writeFileSync,mkdirSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { canonical,digest,engineHash,policySchema,acceptanceSchema,verifyExperiment,type Experiment } from './model.ts';
import { evaluate } from './engine.ts';
import { Store } from './store.ts';
import { head,snapshot } from './robinhood.ts';
import { prepareNext,freezeNext } from './evolution.ts';
import { deploymentPlan,verifyDeployment,registryState,registryTransaction } from './registry.ts';
import type { Hex } from 'viem';
import { archiveRpc,auditSource } from './source-audit.ts';
import { installRpcPacing } from './rpc-pacing.ts';

const {positionals:[command,id],values:v}=parseArgs({allowPositionals:true,options:{db:{type:'string',default:process.env.MEVY_DB??'data/mevy.sqlite'},file:{type:'string'},output:{type:'string'},'llm-cost-wei':{type:'string'},'llm-cost-note':{type:'string'},'extra-gas-wei':{type:'string'},'infra-wei':{type:'string'},'training-through':{type:'string',default:'0'},rpc:{type:'string'},offset:{type:'string',default:'0'},limit:{type:'string',default:'20'},'proposal-hash':{type:'string'},'approve-draft':{type:'string'},owner:{type:'string'},'profit-floor-wei':{type:'string'},'max-amount-wei':{type:'string'},tx:{type:'string'},registry:{type:'string'},recorder:{type:'string'},'code-hash':{type:'string'}}});
const json=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
const print=(o:unknown)=>process.stdout.write(JSON.stringify(o,null,2)+'\n');
async function main(){
  if(command==='deploy-plan'){
    if((id!=='registry'&&id!=='executor')||!v.owner||!v.output)throw Error('deploy-plan registry|executor --owner PUBLIC_ADDRESS --output PATH [--profit-floor-wei N --max-amount-wei N]');
    const plan=deploymentPlan(id,v.owner,id==='executor'?{floorWei:v['profit-floor-wei']??'',maxAmountWei:v['max-amount-wei']??''}:undefined);
    writeFileSync(v.output,JSON.stringify(plan,null,2)+'\n',{flag:'wx'});print({output:v.output,creationCodeHash:plan.creationCodeHash,state:plan.state});return;
  }
  if(command==='check-deployment'){
    if(!v.file||!v.tx)throw Error('check-deployment --file APPROVED_PLAN --tx CREATION_HASH required');
    print(await verifyDeployment(json(v.file),v.tx as Hex,v.rpc));return;
  }
  if(command==='import'){
    if(!v.file)throw Error('import --file verified evidence bundle required');const bundle=json(v.file);verifyExperiment(bundle.experiment);
    const report=evaluate(bundle.experiment,bundle.observations);
    if(canonical(report)!==canonical(bundle.report)||digest({experiment:bundle.experiment,observations:bundle.observations,report:bundle.report})!==bundle.bundleHash)throw Error('Evidence bundle mismatch');
    const s=new Store(v.db!);try{s.verifyJournal();const row=s.db.prepare('SELECT body FROM experiments WHERE id=?').get(bundle.experiment.id) as {body:string}|undefined;
      if(row&&canonical(JSON.parse(row.body))!==canonical(bundle.experiment))throw Error('Existing experiment conflicts with imported commitment');
      if(!row)s.freeze(bundle.experiment);for(const o of bundle.observations)s.add(bundle.experiment.id,o);s.verifyJournal();
      print({imported:true,id:bundle.experiment.id,observations:s.observations(bundle.experiment.id).length,sourceRequoted:false,researchGate:report.researchGate});
    }finally{s.close();}return;
  }
  if(command==='verify'||command==='audit-source'){
    if(!v.file)throw Error('--file evidence bundle required');const bundle=json(v.file);verifyExperiment(bundle.experiment);
    const report=evaluate(bundle.experiment,bundle.observations);if(canonical(report)!==canonical(bundle.report))throw Error('Report mismatch');
    if(digest({experiment:bundle.experiment,observations:bundle.observations,report:bundle.report})!==bundle.bundleHash)throw Error('Bundle digest mismatch');
    if(command==='audit-source'){
      const rpc=archiveRpc(v.rpc),restore=installRpcPacing(rpc);
      try{const receipt=await auditSource(bundle,{rpc,offset:Number(v.offset),limit:Number(v.limit)});
        if(v.output)writeFileSync(v.output,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});print(receipt);return;
      }finally{restore();}
    }
    print({verified:true,sourceRequoted:false,bundleHash:bundle.bundleHash,kind:report.kind,researchGate:report.researchGate,issues:report.issues});return;
  }
  if(!id||!/^[a-zA-Z0-9-]{1,64}$/.test(id))throw Error('Usage: npm run mevy -- freeze|observe|report|export EXPERIMENT [options], or verify --file PATH');
  const store=new Store(v.db!);try{
    store.verifyJournal();
    if(command==='freeze'){
      const b=await head(v.rpc);const body={version:1 as const,id,createdAt:Math.ceil(Date.now()/1000),freezeBlock:b.number,freezeBlockHash:b.hash,trainingThroughBlock:Number(v['training-through']),
        baseline:policySchema.parse(json('policies/baseline.json')),candidate:policySchema.parse(json('policies/candidate.json')),acceptance:acceptanceSchema.parse(json('policies/acceptance.json')),
        engineHash:engineHash(),llmCostWei:v['llm-cost-wei']??null,llmCostNote:v['llm-cost-note']??'Unknown; blocks gate'};
      const e={...body,commitment:digest(body)};store.freeze(e);print(e);
    }else if(command==='prepare-next'){
      if(!v['proposal-hash']||!v.output)throw Error('prepare-next PARENT --proposal-hash HASH --output PATH');
      const draft=prepareNext(store,id,v['proposal-hash']);writeFileSync(v.output,JSON.stringify(draft,null,2)+'\n',{flag:'wx'});print({output:v.output,draftHash:draft.draftHash,state:draft.state});
    }else if(command==='freeze-next'){
      if(!v.file||!v['approve-draft'])throw Error('freeze-next NEW_ID --file DRAFT --approve-draft EXACT_HASH');
      const b=await head(v.rpc);print(freezeNext(store,json(v.file),{id,approveDraft:v['approve-draft'],head:b,createdAt:Math.ceil(Date.now()/1000),llmCostWei:v['llm-cost-wei']??null,llmCostNote:v['llm-cost-note']??'Unknown; requires independent reconciliation and blocks the gate'}));
    }else if(command==='registry-freeze'||command==='registry-report'){
      if(!v.registry||!v.recorder||!v['code-hash']||!v.output)throw Error('registry-freeze|registry-report EXP --registry ADDRESS --recorder PUBLIC_ADDRESS --code-hash VERIFIED_RUNTIME_HASH --output PATH');
      const state=await registryState(v.registry,v.recorder,v['code-hash'],id,v.rpc);
      const plan=registryTransaction(command==='registry-freeze'?'freeze':'report',store.experiment(id),store.observations(id),state);
      writeFileSync(v.output,JSON.stringify(plan,null,2)+'\n',{flag:'wx'});print({output:v.output,state:plan.state,source:plan.source});
    }else if(command==='observe'){
      const e=store.experiment(id);if(e.engineHash!==engineHash())throw Error('Engine changed after freeze');
      const o=await snapshot([e.baseline.sizeWei,e.candidate.sizeWei],{extraGasWei:v['extra-gas-wei']??null,infrastructureWei:v['infra-wei']??null},v.rpc);
      if(o.block<=e.freezeBlock||o.timestamp<e.createdAt){print({inserted:false,state:'WAITING_FOR_POST_COMMIT_BLOCK',block:o.block});return;}
      print({inserted:store.add(id,o),block:o.block,quotes:o.quotes.length,errors:o.errors});
    }else if(command==='report'||command==='export'){
      const experiment=store.experiment(id),observations=store.observations(id),report=evaluate(experiment,observations);
      if(command==='report'){print(report);return;}
      const body={experiment,observations,report},bundle={...body,bundleHash:digest(body)};
      if(!v.output)throw Error('--output PATH required');writeFileSync(v.output,JSON.stringify(bundle,null,2)+'\n',{flag:'wx'});print({output:v.output,bundleHash:bundle.bundleHash});
    }else throw Error('Unknown command');
  }finally{store.close();}
}
main().catch(error=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1;});
