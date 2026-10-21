import {readFileSync} from 'node:fs';
import {encodeDeployData,encodeFunctionData,keccak256,parseAbi,zeroAddress,type Address,type Hex,type Abi} from 'viem';
import {canonical,digest,hash,uint,verifyExperiment,type Experiment,type Observation} from './model.ts';
import {evaluate} from './engine.ts';
import {client,network} from './robinhood.ts';

export const registryAbi=parseAbi(['function recorder() view returns(address)','function MIN_DURATION() view returns(uint64)','function MIN_OBSERVATIONS() view returns(uint32)',
 'function records(bytes32) view returns(bytes32 commitment,bytes32 result,uint64 blockNumber,uint64 timestamp)',
 'function freeze(bytes32 id,bytes32 commitment)','function report(bytes32 id,bytes32 result,uint64 lastBlock,uint32 observations)']);
const authorityAbi=parseAbi(['function controller() view returns(address)']);
const zeroHash=('0x'+'0'.repeat(64)) as Hex;
function authority(value:string):Address{if(!/^0x[0-9a-fA-F]{40}$/.test(value)||value.toLowerCase()===zeroAddress)throw Error('Nonzero public authority address required');return value.toLowerCase() as Address;}
export const registryId=(id:string)=>digest({namespace:'mevhood.experiment/v1',id}) as Hex;
export type RegistryState={chainId:number;address:Address;recorder:Address;codeHash:Hex;commitment:Hex;result:Hex;anchorBlock:number;anchorTimestamp:number;headBlock:number;headTimestamp:number;headHash:Hex};

export function deploymentPlan(kind:'registry'|'executor',owner:string,limits?:{floorWei:string;maxAmountWei:string}){
 const name=kind==='registry'?'ExperimentRegistry':'AtomicRoundTrip',recorder=authority(owner);
 if(kind!=='registry'&&kind!=='executor')throw Error('Unknown contract kind');
 if(kind==='executor'&&(!limits||uint.parse(limits.floorWei)==='0'||BigInt(uint.parse(limits.maxAmountWei))<=0n||BigInt(limits.maxAmountWei)>20_000_000_000_000_000n))throw Error('Explicit positive floor and bounded inventory required');
 const artifact=JSON.parse(readFileSync(new URL(`../contracts/artifacts/${name}.json`,import.meta.url),'utf8'));
 if(artifact.sourceDigest!==digest(readFileSync(new URL(`../contracts/${name}.sol`,import.meta.url),'utf8')))throw Error('Compiled deployment artifact is stale');
 const bytecode=artifact.bytecode as Hex;if(!/^0x[0-9a-fA-F]+$/.test(bytecode))throw Error('Invalid compiled deployment artifact');
 const args=kind==='registry'?[recorder]:[recorder,network.weth,network.usdg,network.factory,network.router,BigInt(limits!.floorWei),BigInt(limits!.maxAmountWei)];
 const data=encodeDeployData({abi:artifact.abi as Abi,bytecode,args});
 return {format:'mevy-unsigned-deployment/v1' as const,chainId:4663 as const,kind,contract:name,authority:recorder,limits:kind==='executor'?limits!:null,
  transaction:{data,valueWei:'0'},creationCodeHash:keccak256(data),state:'UNSIGNED_NOT_BROADCAST' as const,
  feeStatus:'Not estimated: use the selected signer and current chain simulation before any approval.'};
}

export async function verifyDeployment(input:ReturnType<typeof deploymentPlan>,transactionHash:Hex,rpc?:string){
 hash.parse(transactionHash);const expected=deploymentPlan(input.kind,input.authority,input.limits??undefined);
 if(canonical(expected)!==canonical(input))throw Error('Deployment plan differs from current compiled artifacts');
 const c=client(rpc);if(await c.getChainId()!==4663)throw Error('Wrong chain');
 const receipt=await c.getTransactionReceipt({hash:transactionHash}),tx=await c.getTransaction({hash:transactionHash});
 if(receipt.status!=='success'||!receipt.contractAddress||tx.to!==null||tx.input.toLowerCase()!==expected.transaction.data.toLowerCase())throw Error('Creation receipt/input mismatch');
 const block=await c.getBlock({blockNumber:receipt.blockNumber});if(block.hash!==receipt.blockHash)throw Error('Deployment block reorganized');
 const address=receipt.contractAddress,code=await c.getCode({address,blockNumber:receipt.blockNumber});if(!code||code==='0x')throw Error('No runtime code');
 const owner=await c.readContract({address,abi:input.kind==='registry'?registryAbi:authorityAbi,functionName:input.kind==='registry'?'recorder':'controller',blockNumber:receipt.blockNumber});
 if(String(owner).toLowerCase()!==input.authority)throw Error('Deployed authority mismatch');
 return {format:'mevy-deployment-receipt/v1',chainId:4663,kind:input.kind,address,authority:input.authority,transactionHash,block:Number(receipt.blockNumber),blockHash:receipt.blockHash,codeHash:keccak256(code),creationCodeHash:expected.creationCodeHash,
  boundary:'Creation input and runtime authority verified. Not an independent audit, L1-finality proof or funded canary.'};
}

export async function registryState(address:string,recorder:string,expectedCodeHash:string,id:string,rpc?:string):Promise<RegistryState>{
 const target=authority(address),owner=authority(recorder);hash.parse(expectedCodeHash);
 const c=client(rpc);if(await c.getChainId()!==4663)throw Error('Wrong chain');const b=await c.getBlock();if(!b.hash)throw Error('Unmined head');
 const code=await c.getCode({address:target,blockNumber:b.number});if(!code||keccak256(code)!==expectedCodeHash)throw Error('Reviewed registry runtime hash mismatch');
 const actual=await c.readContract({address:target,abi:registryAbi,functionName:'recorder',blockNumber:b.number});if(actual.toLowerCase()!==owner)throw Error('Registry recorder mismatch');
 const duration=await c.readContract({address:target,abi:registryAbi,functionName:'MIN_DURATION',blockNumber:b.number});
 const count=await c.readContract({address:target,abi:registryAbi,functionName:'MIN_OBSERVATIONS',blockNumber:b.number});
 if(duration!==604800n||count!==1000)throw Error('Registry gate constants mismatch');
 const r=await c.readContract({address:target,abi:registryAbi,functionName:'records',args:[registryId(id)],blockNumber:b.number});
 if((await c.getBlock({blockNumber:b.number})).hash!==b.hash)throw Error('Registry read reorganized');
 return {chainId:4663,address:target,recorder:owner,codeHash:expectedCodeHash as Hex,commitment:r[0],result:r[1],anchorBlock:Number(r[2]),anchorTimestamp:Number(r[3]),headBlock:Number(b.number),headTimestamp:Number(b.timestamp),headHash:b.hash};
}

export function registryTransaction(action:'freeze'|'report',experiment:Experiment,observations:Observation[],state:RegistryState){
 verifyExperiment(experiment);if(state.chainId!==4663)throw Error('Wrong chain');authority(state.address);authority(state.recorder);hash.parse(state.codeHash);hash.parse(state.headHash);
 const id=registryId(experiment.id);let data:Hex;
 if(action==='freeze'){
  if(state.commitment!==zeroHash||state.anchorBlock!==0)throw Error('Experiment already anchored');
  if(state.headBlock<experiment.freezeBlock||state.headTimestamp<experiment.createdAt)throw Error('Local freeze is ahead of the pinned registry state');
  // Do not anchor a data-selected result retrospectively as a forward trial.
  if(observations.length)throw Error('Freeze publicly before collecting forward observations');
  data=encodeFunctionData({abi:registryAbi,functionName:'freeze',args:[id,experiment.commitment as Hex]});
 }else if(action==='report'){
  if(state.commitment!==experiment.commitment||state.anchorBlock<experiment.freezeBlock||state.anchorTimestamp<experiment.createdAt||state.result!==zeroHash)throw Error('Registry commitment/order mismatch');
  if(observations.some(o=>o.block<=state.anchorBlock||o.timestamp<state.anchorTimestamp))throw Error('Data predates actual public anchor');
  const report=evaluate(experiment,observations);
  if(report.researchGate!=='ELIGIBLE_FOR_REVIEW'||state.headTimestamp-state.anchorTimestamp<604800)throw Error('Research or public-anchor duration gate is HOLD');
  if(Math.max(...observations.map(o=>o.timestamp))-state.anchorTimestamp<experiment.acceptance.minSeconds)throw Error('Insufficient forward evidence after public anchor');
  const lastBlock=Math.max(...observations.map(o=>o.block));if(lastBlock>=state.headBlock)throw Error('Report block must precede current chain head');
  const bundleHash=digest({experiment,observations,report});
  data=encodeFunctionData({abi:registryAbi,functionName:'report',args:[id,bundleHash as Hex,BigInt(lastBlock),observations.length]});
 }else throw Error('Unknown registry action');
 return {format:'mevy-unsigned-registry/v1',action,experimentId:experiment.id,experimentCommitment:experiment.commitment,registryId:id,
  transaction:{chainId:4663,from:state.recorder,to:state.address,valueWei:'0',data},source:{block:state.headBlock,blockHash:state.headHash,codeHash:state.codeHash},state:'UNSIGNED_NOT_BROADCAST',
  boundary:'Digest/order receipt only. This does not prove P&L, approve live promotion or submit a transaction.'};
}
