import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {archiveRpc,auditSource,sourceFields,type EvidenceBundle} from '../src/source-audit.ts';
import {digest,type Observation} from '../src/model.ts';import {evaluate} from '../src/engine.ts';
const fixture=JSON.parse(readFileSync('evidence/integration-2026-10-21.json','utf8')) as EvidenceBundle;
const copy=<T>(x:T):T=>JSON.parse(JSON.stringify(x));
function expanded(){const b=copy(fixture),first=b.observations[0]!;b.observations=Array.from({length:25},(_,i)=>({...copy(first),block:first.block+i,timestamp:first.timestamp+i,collectedAt:first.collectedAt+i}));b.report=evaluate(b.experiment,b.observations);b.bundleHash=digest({experiment:b.experiment,observations:b.observations,report:b.report});return b;}
test('archive config uses explicit URL, then environment, then verified public default',()=>{
 assert.equal(archiveRpc(undefined,{}),'https://rpc-robinhood.blockmachine.io');assert.equal(archiveRpc(undefined,{MEVY_ARCHIVE_RPC_URL:'https://archive.example'}),'https://archive.example');assert.equal(archiveRpc('https://override.example',{MEVY_ARCHIVE_RPC_URL:'https://archive.example'}),'https://override.example');assert.throws(()=>archiveRpc('http://insecure.example'),/HTTPS/);
});
test('full actual integration comparison binds all source fields and preserves original bundle',async()=>{
 const before=JSON.stringify(fixture),calls:unknown[]=[];
 const receipt=await auditSource(fixture,{rpc:'https://archive.example',read:async(sizes,costs,rpc,block)=>{calls.push({sizes,costs,rpc,block});return copy(fixture.observations[0]!);}});
 assert.equal(receipt.auditComplete,true);assert.equal(receipt.sourceRequoted,true);assert.equal(receipt.researchGate,'HOLD');assert.equal(receipt.checks[0]!.observationHash,digest(fixture.observations[0]!));assert.equal(receipt.bundleHash,fixture.bundleHash);assert.equal(calls.length,1);assert.equal(JSON.stringify(fixture),before);
});
test('every economic and identity field mismatch fails; no success callback on a mismatch',async()=>{
 for(const field of sourceFields){let accepted=0;const bad=copy(fixture.observations[0]!) as any;bad[field]=null;
  await assert.rejects(auditSource(fixture,{rpc:'https://archive.example',read:async()=>bad,onVerified:()=>accepted++}),new RegExp(field));assert.equal(accepted,0);
 }
});
test('whole-bundle tampering fails before any RPC call',async()=>{
 const b=copy(fixture);b.observations[0]!.quotes[0]!.amountOutWei='1';let calls=0;
 await assert.rejects(auditSource(b,{read:async()=>{calls++;return b.observations[0]!;}}),/mismatch/);assert.equal(calls,0);
});
test('long histories are bounded ranges; a partial receipt never claims full source verification',async()=>{
 const b=expanded();const read=async(_sizes:string[],_costs:unknown,_rpc:unknown,block?:number)=>copy(b.observations.find(o=>o.block===block)!);
 const first=await auditSource(b,{read});assert.equal(first.auditedObservations,20);assert.equal(first.nextOffset,20);assert.equal(first.sourceRequoted,false);assert.equal(first.auditComplete,false);
 const last=await auditSource(b,{read,offset:20});assert.equal(last.auditedObservations,5);assert.equal(last.nextOffset,null);assert.equal(last.auditComplete,false);assert.equal(last.sourceRequoted,false);assert.equal(first.bundleHash,last.bundleHash);
 await assert.rejects(auditSource(b,{read,limit:21}),/limit/);await assert.rejects(auditSource(b,{read,offset:25}),/offset/);
});
test('archive failure is explicit and credentials are removed from its surfaced URL',async()=>{
 const rpc='https://archive.example/private-secret';await assert.rejects(auditSource(fixture,{rpc,read:async()=>{throw Error('Request failed: '+rpc);}}),error=>error instanceof Error&&!error.message.includes('private-secret'));
});
