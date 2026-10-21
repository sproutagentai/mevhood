import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {decodeFunctionData,encodeAbiParameters,parseAbiParameters,zeroAddress,type Hex} from 'viem';
import {registryAbi,registryId,registryTransaction,deploymentPlan,type RegistryState} from '../src/registry.ts';
import {digest,engineHash,type Experiment,type Observation} from '../src/model.ts';
const h=('0x'+'a'.repeat(64)) as Hex,z=('0x'+'0'.repeat(64)) as Hex,a='0x1111111111111111111111111111111111111111' as const,b='0x2222222222222222222222222222222222222222' as const;
const sample=JSON.parse(readFileSync('evidence/integration-2026-10-21.json','utf8'));
const e=sample.experiment as Experiment,obs=sample.observations as Observation[];
const state:RegistryState={chainId:4663,address:a,recorder:b,codeHash:h,commitment:z,result:z,anchorBlock:0,anchorTimestamp:0,headBlock:obs[0]!.block+100,headTimestamp:obs[0]!.timestamp+200,headHash:h};
test('unsigned registry freeze binds exact domain/id and commitment; historical data cannot be retro-anchored',()=>{
 const tx=registryTransaction('freeze',e,[],state),decoded=decodeFunctionData({abi:registryAbi,data:tx.transaction.data});
 assert.equal(tx.state,'UNSIGNED_NOT_BROADCAST');assert.equal(tx.transaction.chainId,4663);assert.equal(tx.transaction.valueWei,'0');assert.equal(decoded.functionName,'freeze');assert.deepEqual(decoded.args,[registryId(e.id),e.commitment]);
 assert.throws(()=>registryTransaction('freeze',e,obs,state),/before collecting/);assert.throws(()=>registryTransaction('freeze',e,[],{...state,chainId:1}),/Wrong chain/);
 assert.throws(()=>registryTransaction('freeze',e,[],{...state,commitment:h,anchorBlock:1}),/already anchored/);
});
test('actual public anchor is a stricter boundary than the local experiment freeze',()=>{
 const anchored={...state,commitment:e.commitment as Hex,anchorBlock:obs[0]!.block,anchorTimestamp:obs[0]!.timestamp};
 assert.throws(()=>registryTransaction('report',e,obs,anchored),/predates actual public anchor/);
 assert.throws(()=>registryTransaction('report',e,obs,{...anchored,commitment:h}),/commitment\/order/);
 assert.throws(()=>registryTransaction('report',e,obs,{...anchored,anchorBlock:e.freezeBlock,anchorTimestamp:e.createdAt}),/HOLD/);
});
test('sufficient synthetic forward evidence produces exact result calldata, never a broadcast',()=>{
 const body={version:1 as const,id:'synthetic-anchor',createdAt:1000,freezeBlock:100,freezeBlockHash:h,trainingThroughBlock:0,baseline:{...e.baseline,minEdgeBps:500},candidate:e.candidate,acceptance:e.acceptance,engineHash:engineHash(),llmCostWei:'0',llmCostNote:'Unit fixture only, no model calls'};
 const experiment={...body,commitment:digest(body)},observations=Array.from({length:2100},(_,i)=>({...obs[0]!,block:102+i,timestamp:1000+(i+1)*300,collectedAt:1001+(i+1)*300,gasPriceWei:'1',extraGasWei:'0',infrastructureWei:'0',errors:[],quotes:[{...obs[0]!.quotes[0]!,poolOut:a,poolBack:b,sizeWei:e.candidate.sizeWei,amountOutWei:(BigInt(e.candidate.sizeWei)+20_000_000_000_000n).toString(),gasUnits:'200000',error:null}]}));
 const anchored={...state,commitment:experiment.commitment as Hex,anchorBlock:101,anchorTimestamp:1001,headBlock:5000,headTimestamp:632000};
 const tx=registryTransaction('report',experiment,observations,anchored),decoded=decodeFunctionData({abi:registryAbi,data:tx.transaction.data});assert.equal(decoded.functionName,'report');assert.equal(decoded.args[0],registryId(experiment.id));assert.equal(decoded.args[2],2201n);assert.equal(decoded.args[3],2100);
 assert.throws(()=>registryTransaction('report',experiment,observations,{...anchored,headBlock:2201}),/precede/);
 assert.throws(()=>registryTransaction('report',experiment,observations.slice(0,2016),anchored),/Insufficient forward evidence after public anchor/);
});
test('unsigned creation calldata uses compiled constructor and refuses unknown authority or unbounded executor size',()=>{
 assert.throws(()=>deploymentPlan('registry',zeroAddress),/Nonzero/);assert.throws(()=>deploymentPlan('executor',a,{floorWei:'1',maxAmountWei:'21000000000000000'}),/bounded/);
 const tx=deploymentPlan('registry',a),artifact=JSON.parse(readFileSync('contracts/artifacts/ExperimentRegistry.json','utf8'));
 assert.equal(tx.transaction.data,artifact.bytecode+encodeAbiParameters(parseAbiParameters('address'),[a]).slice(2));assert.equal(tx.authority,a);assert.equal(tx.state,'UNSIGNED_NOT_BROADCAST');
});
