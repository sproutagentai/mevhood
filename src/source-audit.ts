import { canonical,digest,verifyExperiment,type Experiment,type Observation } from './model.ts';
import { evaluate } from './engine.ts';
import { snapshot } from './robinhood.ts';

export const defaultArchiveRpc='https://rpc-robinhood.blockmachine.io';
export const sourceFields=['chainId','block','blockHash','timestamp','factory','quoter','codeHashes','gasPriceWei','gasModel','quotes','errors'] as const;
export type EvidenceBundle={experiment:Experiment;observations:Observation[];report:ReturnType<typeof evaluate>;bundleHash:string};
export function verifyBundle(bundle:EvidenceBundle){
 verifyExperiment(bundle.experiment);const report=evaluate(bundle.experiment,bundle.observations);
 if(canonical(report)!==canonical(bundle.report)||digest({experiment:bundle.experiment,observations:bundle.observations,report:bundle.report})!==bundle.bundleHash)throw Error('Evidence bundle mismatch');
 return report;
}
export function archiveRpc(explicit?:string,env:NodeJS.ProcessEnv=process.env){
 const value=explicit??env.MEVY_ARCHIVE_RPC_URL??defaultArchiveRpc,u=new URL(value);
 if(u.protocol!=='https:')throw Error('HTTPS archive RPC required');return value;
}
export async function auditSource(bundle:EvidenceBundle,options:{rpc?:string;offset?:number;limit?:number;read?:typeof snapshot;onVerified?:(row:unknown)=>void}={}){
 const report=verifyBundle(bundle),offset=options.offset??0,limit=options.limit??20;
 if(!Number.isSafeInteger(offset)||offset<0||offset>=bundle.observations.length||!Number.isSafeInteger(limit)||limit<1||limit>20)throw Error('Audit offset must select observations; limit must be 1..20');
 const rpc=archiveRpc(options.rpc),source=new URL(rpc).origin,read=options.read??snapshot;
 const selected=bundle.observations.slice(offset,offset+limit),checks=[];
 for(const saved of selected){
  let fresh:Observation;
  try{fresh=await read([...new Set(saved.quotes.map(q=>q.sizeWei))],{extraGasWei:saved.extraGasWei,infrastructureWei:saved.infrastructureWei},rpc,saved.block);}
  catch(error){throw Error((error instanceof Error?error.message:String(error)).replaceAll(rpc,source));}
  for(const field of sourceFields)if(canonical(fresh[field])!==canonical(saved[field]))throw Error(`Independent source mismatch: block ${saved.block}, ${field}`);
  const row={block:saved.block,blockHash:saved.blockHash,observationHash:digest(saved),sourceDigest:digest(Object.fromEntries(sourceFields.map(field=>[field,fresh[field]]))),quotes:saved.quotes.length};
  checks.push(row);options.onVerified?.(row);
 }
 const nextOffset=offset+selected.length,complete=offset===0&&nextOffset===bundle.observations.length;
 const body={format:'mevy-source-audit/v1',verified:true,sourceRequoted:complete,sourceAudit:'PASS',auditComplete:complete,bundleHash:bundle.bundleHash,source,sourceId:digest(rpc),checkedAt:new Date().toISOString(),offset,auditedObservations:selected.length,totalObservations:bundle.observations.length,nextOffset:nextOffset<bundle.observations.length?nextOffset:null,checks,researchGate:report.researchGate};
 return {...body,receiptHash:digest(body)};
}
