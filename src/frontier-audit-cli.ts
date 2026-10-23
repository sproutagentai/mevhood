import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { canonical,digest } from './model.ts';
import { verifyGraph,verifyFrame,quoteLabFrame } from './frontier-source.ts';
import { archiveRpc,auditSource } from './source-audit.ts';
import { evidenceBundle } from './auto-research.ts';
import { installRpcPacing } from './rpc-pacing.ts';
const arg=(key:string)=>{const i=process.argv.indexOf(key);return i<0?undefined:process.argv[i+1];};
const path=arg('--report');if(!path||!/^evidence\/lab-[a-z0-9-]+-report\.json$/.test(path))throw Error('Use --report with a published lab evidence report');
const manifest=JSON.parse(readFileSync('PUBLIC_FILES.json','utf8')),read=(p:string)=>{if(!/^evidence\/lab-[a-z0-9-]+\.json$/.test(p))throw Error('Invalid archive source path');const t=readFileSync(p,'utf8');if(createHash('sha256').update(t).digest('hex')!==manifest.files[p])throw Error('Archive input does not match published file hash');return JSON.parse(t);};
const report=read(path),{reportHash,...body}=report;if(digest(body)!==reportHash)throw Error('Invalid source report digest');
const block=arg('--block')===undefined?report.sources[0]?.block:Number(arg('--block')),source=report.sources.find((s:any)=>s.block===block);if(!source)throw Error('Block not present in the report');
const graph=verifyGraph(read(report.graphPath)),saved=verifyFrame(read(source.path),graph),rpc=archiveRpc(arg('--rpc')),restore=installRpcPacing(rpc);
try{const control=await auditSource(evidenceBundle(report.control,[saved.control]),{rpc}),fresh=await quoteLabFrame(graph,saved.control,saved.quotes.map(({routeId,sizeWei})=>({routeId,sizeWei})),rpc,control);if(canonical(fresh.quotes)!==canonical(saved.quotes))throw Error('Archived discovery quotes differ');
 const body={format:'mevy-frontier-source-check/v1',checkedAt:new Date().toISOString(),reportHash,graphHash:graph.graphHash,frameHash:saved.frameHash,block,controlQuotes:saved.control.quotes.length,discoveryQuotes:saved.quotes.length,source:new URL(rpc).origin,sourceAudit:'PASS',boundary:'Actual same-block archive re-quote, provider consistency rather than consensus or execution proof.'};console.log(JSON.stringify({...body,receiptHash:digest(body)},null,2));
}catch(error){const message=error instanceof Error?error.message:'Unknown source failure',field=/Independent source mismatch: block [0-9]+, ([A-Za-z]+)/.exec(message)?.[1]??null;const body={format:'mevy-frontier-source-check/v1',checkedAt:new Date().toISOString(),reportHash,graphHash:graph.graphHash,frameHash:saved.frameHash,block,source:new URL(rpc).origin,sourceAudit:'FAIL',mismatchField:field,failure:field?'SOURCE_MISMATCH':'SOURCE_UNAVAILABLE',boundary:'Failed archive check retained. A later match does not erase this failure.'};console.log(JSON.stringify({...body,receiptHash:digest(body)},null,2));process.exitCode=1;}finally{restore();}
