import { readFileSync,writeFileSync,mkdirSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { canonical,digest,engineHash,policySchema,acceptanceSchema,verifyExperiment,type Experiment } from './model.ts';
import { evaluate } from './engine.ts';
import { Store } from './store.ts';
import { head,snapshot } from './robinhood.ts';

const {positionals:[command,id],values:v}=parseArgs({allowPositionals:true,options:{db:{type:'string',default:'data/mevy.sqlite'},file:{type:'string'},output:{type:'string'},'llm-cost-wei':{type:'string'},'llm-cost-note':{type:'string'},'extra-gas-wei':{type:'string'},'infra-wei':{type:'string'},'training-through':{type:'string',default:'0'},rpc:{type:'string'}}});
const json=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
const print=(o:unknown)=>process.stdout.write(JSON.stringify(o,null,2)+'\n');
async function main(){
  if(command==='verify'||command==='audit-source'){
    if(!v.file)throw Error('--file evidence bundle required');const bundle=json(v.file);verifyExperiment(bundle.experiment);
    const report=evaluate(bundle.experiment,bundle.observations);if(canonical(report)!==canonical(bundle.report))throw Error('Report mismatch');
    if(digest({experiment:bundle.experiment,observations:bundle.observations,report:bundle.report})!==bundle.bundleHash)throw Error('Bundle digest mismatch');
    if(command==='audit-source'){
      if(bundle.observations.length>20)throw Error('Source audit bounded to 20 observations per bundle');
      for(const saved of bundle.observations){
        const fresh=await snapshot([...new Set<string>(saved.quotes.map((q:{sizeWei:string})=>q.sizeWei))],{extraGasWei:saved.extraGasWei,infrastructureWei:saved.infrastructureWei},v.rpc,saved.block);
        const fields=['chainId','block','blockHash','timestamp','factory','quoter','codeHashes','gasPriceWei','gasModel','quotes','errors'] as const;
        for(const field of fields)if(canonical(fresh[field])!==canonical(saved[field]))throw Error(`Independent source mismatch: block ${saved.block}, ${field}`);
      }
    }
    print({verified:true,sourceRequoted:command==='audit-source',bundleHash:bundle.bundleHash,kind:report.kind,researchGate:report.researchGate,issues:report.issues});return;
  }
  if(!id||!/^[a-zA-Z0-9-]{1,64}$/.test(id))throw Error('Usage: npm run mevy -- freeze|observe|report|export EXPERIMENT [options], or verify --file PATH');
  const store=new Store(v.db!);try{
    store.verifyJournal();
    if(command==='freeze'){
      const b=await head(v.rpc);const body={version:1 as const,id,createdAt:Math.ceil(Date.now()/1000),freezeBlock:b.number,freezeBlockHash:b.hash,trainingThroughBlock:Number(v['training-through']),
        baseline:policySchema.parse(json('policies/baseline.json')),candidate:policySchema.parse(json('policies/candidate.json')),acceptance:acceptanceSchema.parse(json('policies/acceptance.json')),
        engineHash:engineHash(),llmCostWei:v['llm-cost-wei']??null,llmCostNote:v['llm-cost-note']??'Unknown; blocks gate'};
      const e={...body,commitment:digest(body)};store.freeze(e);print(e);
    }else if(command==='observe'){
      const e=store.experiment(id);if(e.engineHash!==engineHash())throw Error('Engine changed after freeze');
      const o=await snapshot([e.baseline.sizeWei,e.candidate.sizeWei],{extraGasWei:v['extra-gas-wei']??null,infrastructureWei:v['infra-wei']??null},v.rpc);
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
