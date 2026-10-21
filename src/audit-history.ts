import { readFileSync,writeFileSync,mkdirSync,existsSync } from 'node:fs';
import { resolve,join } from 'node:path';
import { parseArgs } from 'node:util';
import { archiveRpc,auditSource,verifyBundle,type EvidenceBundle,sourceFields } from './source-audit.ts';
import { digest } from './model.ts';
import { installRpcPacing } from './rpc-pacing.ts';

const {values:v}=parseArgs({options:{file:{type:'string'},output:{type:'string'},rpc:{type:'string'},'max-seconds':{type:'string',default:'3600'}}});
async function main(){
 if(!v.file||!v.output)throw Error('--file BUNDLE --output RECEIPT_DIRECTORY required');
 const seconds=Number(v['max-seconds']);if(!Number.isSafeInteger(seconds)||seconds<60||seconds>86400)throw Error('--max-seconds must be60..86400');
 const bundle=JSON.parse(readFileSync(v.file,'utf8')) as EvidenceBundle;verifyBundle(bundle);
 if(bundle.observations.length===0)throw Error('No observations to source-audit');
 const rpc=archiveRpc(v.rpc),dir=resolve(v.output),until=Date.now()+seconds*1000,restore=installRpcPacing(rpc);
 mkdirSync(dir,{recursive:true});const receipts=[];
 try{
  for(let offset=0;offset<bundle.observations.length;offset++){
   const path=join(dir,`block-${bundle.observations[offset]!.block}.json`),saved=bundle.observations[offset]!;
   let receipt:Awaited<ReturnType<typeof auditSource>>;
   if(existsSync(path)){
    receipt=JSON.parse(readFileSync(path,'utf8'));const {receiptHash,...body}=receipt;
    const expected=digest(Object.fromEntries(sourceFields.map(field=>[field,saved[field]])));
    if(digest(body)!==receiptHash||receipt.bundleHash!==bundle.bundleHash||receipt.sourceId!==digest(rpc)||receipt.offset!==offset||receipt.auditedObservations!==1||receipt.checks.length!==1||receipt.sourceAudit!=='PASS'||receipt.checks[0]?.observationHash!==digest(saved)||receipt.checks[0]?.sourceDigest!==expected)throw Error('Saved audit receipt mismatch; refusing to resume');
   }else{
    // Reserve a whole snapshot slot. A provider failure exits and preserves earlier receipts.
    if(until-Date.now()<60000)break;
    receipt=await auditSource(bundle,{rpc,offset,limit:1});
    writeFileSync(path,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
   }
   receipts.push(receipt);
   console.log(JSON.stringify({audited:receipts.length,total:bundle.observations.length,block:saved.block,quotes:saved.quotes.length}));
  }
  const complete=receipts.length===bundle.observations.length;
  const body={format:'mevy-history-audit/v1',bundleHash:bundle.bundleHash,source:new URL(rpc).origin,sourceId:digest(rpc),auditComplete:complete,sourceRequoted:complete,auditedObservations:receipts.length,totalObservations:bundle.observations.length,auditedQuotes:receipts.reduce((n,r)=>n+r.checks[0]!.quotes,0),nextOffset:complete?null:receipts.length,checkedAt:new Date().toISOString(),receiptHashes:receipts.map(r=>r.receiptHash),researchGate:bundle.report.researchGate};
  writeFileSync(join(dir,`summary-${receipts.length}-${Date.now()}.json`),JSON.stringify({...body,receiptHash:digest(body)},null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify(body));
 }finally{restore();}
}
main().catch(error=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1;});
