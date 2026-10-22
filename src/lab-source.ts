import { parseAbi,encodePacked,encodeFunctionData,decodeFunctionResult,keccak256,type Address,type Hex } from 'viem';
import { z } from 'zod';
import { client,network } from './robinhood.ts';
import { digest,address,hash,uint,observationSchema,type Observation } from './model.ts';
import { sourceFields } from './source-audit.ts';
export const labTokens=[{symbol:'WETH',address:network.weth},{symbol:'USDG',address:network.usdg},{symbol:'PONS',address:'0x39dBED3a2bd333467115dE45665cC57F813C4571'},{symbol:'CASHCAT',address:'0x020bfC650A365f8BB26819deAAbF3E21291018b4'}] as const;
export const labSizes=['100000000000000','1000000000000000','5000000000000000','20000000000000000'] as const;
const poolSchema=z.object({address,token0:address,token1:address,fee:z.number().int().positive(),liquidity:uint,codeHash:hash}).strict();
export const routeSchema=z.object({id:hash,label:z.string().max(160),family:z.enum(['cross-pool','triangle']),tokens:z.array(address).min(3).max(4),fees:z.array(z.number().int().positive()).min(2).max(3),pools:z.array(address).min(2).max(3),path:z.string().regex(/^0x[0-9a-f]+$/)}).strict();
export type LabRoute=z.infer<typeof routeSchema>;
export const graphSchema=z.object({format:z.literal('mevy-route-universe/v1'),block:z.number().int().positive(),blockHash:hash,timestamp:z.number().int().positive(),source:z.literal('https://rpc-robinhood.blockmachine.io'),tokens:z.array(z.object({symbol:z.string(),address}).strict()),pools:z.array(poolSchema),routes:z.array(routeSchema).max(256),missingPools:z.array(z.object({a:address,b:address,fee:z.number().int()}).strict()),codeHashes:z.record(z.string(),hash),graphHash:hash}).strict();
export type LabGraph=z.infer<typeof graphSchema>;
export const cellSchema=z.object({routeId:hash,sizeWei:z.enum(labSizes)}).strict();
export type LabCell=z.infer<typeof cellSchema>;
export const labQuoteSchema=cellSchema.extend({amountOutWei:uint,gasUnits:uint,error:z.string().nullable()}).strict();
export const frameSchema=z.object({format:z.literal('mevy-lab-frame/v1'),graphHash:hash,control:observationSchema,controlSource:z.record(z.string(),z.any()),quotes:z.array(labQuoteSchema).max(12),sourceCheck:z.object({status:z.literal('MATCH'),source:z.string(),checkedAt:z.string(),quoteHash:hash}).strict(),frameHash:hash}).strict();
export type LabFrame=z.infer<typeof frameSchema>;
const factoryAbi=parseAbi(['function getPool(address,address,uint24) view returns(address)']);
const poolAbi=parseAbi(['function factory() view returns(address)','function token0() view returns(address)','function token1() view returns(address)','function fee() view returns(uint24)','function liquidity() view returns(uint128)']);
const quoterAbi=parseAbi(['function quoteExactInput(bytes path,uint256 amountIn) returns(uint256 amountOut,uint160[] sqrtPriceX96AfterList,uint32[] initializedTicksCrossedList,uint256 gasEstimate)']);
const same=(a:string,b:string)=>a.toLowerCase()===b.toLowerCase(),zero='0x0000000000000000000000000000000000000000';
export function makeRoutes(pools:z.infer<typeof poolSchema>[]):LabRoute[]{
 const edge=(a:string,b:string)=>pools.filter(p=>[p.token0,p.token1].map(x=>x.toLowerCase()).sort().join() ===[a,b].map(x=>x.toLowerCase()).sort().join());
 const routes:LabRoute[]=[],w=network.weth;
 const add=(tokens:string[],legs:typeof pools)=>{
  if(new Set(legs.map(p=>p.address.toLowerCase())).size!==legs.length)return;
  const fees=legs.map(p=>p.fee),addresses=legs.map(p=>p.address),symbols=tokens.map(t=>labTokens.find(x=>same(x.address,t))!.symbol);
  const types:any[]=['address'],values:any[]=[tokens[0]];legs.forEach((p,i)=>{types.push('uint24','address');values.push(p.fee,tokens[i+1]);});
  const body={label:symbols.join(' → ')+' / '+fees.join(' · '),family:legs.length===2?'cross-pool' as const:'triangle' as const,tokens,fees,pools:addresses,path:encodePacked(types,values)};
  routes.push(routeSchema.parse({...body,id:digest(body)}));
 };
 for(const a of labTokens.slice(1)){
  for(const out of edge(w,a.address))for(const back of edge(a.address,w))add([w,a.address,w],[out,back]);
  for(const b of labTokens.slice(1)){if(a.address===b.address)continue;for(const p of edge(w,a.address))for(const q of edge(a.address,b.address))for(const r of edge(b.address,w))add([w,a.address,b.address,w],[p,q,r]);}
 }
 return routes.sort((a,b)=>a.id.localeCompare(b.id));
}
export function verifyGraph(input:unknown){const g=graphSchema.parse(input),{graphHash,...body}=g;if(digest(body)!==graphHash||JSON.stringify(makeRoutes(g.pools))!==JSON.stringify(g.routes))throw Error('Route universe integrity mismatch');return g;}
export async function discoverGraph(rpc:string):Promise<LabGraph>{
 const c=client(rpc);if(await c.getChainId()!==4663)throw Error('Wrong discovery chain');const n=await c.getBlockNumber(),blockNumber=n-64n,b=await c.getBlock({blockNumber});if(!b.hash)throw Error('Missing discovery block');
 const pools:z.infer<typeof poolSchema>[]=[],missingPools:{a:string;b:string;fee:number}[]=[],codeHashes:Record<string,string>={};
 for(const a of [network.factory,network.quoter,...labTokens.map(x=>x.address)]){const code=await c.getCode({address:a as Address,blockNumber});if(!code||code==='0x')throw Error('Missing discovery deployment');codeHashes[a.toLowerCase()]=keccak256(code);}
 for(let i=0;i<labTokens.length;i++)for(let j=i+1;j<labTokens.length;j++)for(const fee of [100,500,3000,10000]){
  const a=labTokens[i]!.address,b=labTokens[j]!.address,p=await c.readContract({address:network.factory,abi:factoryAbi,functionName:'getPool',args:[a as Address,b as Address,fee],blockNumber});
  if(same(p,zero)){missingPools.push({a,b,fee});continue;}
  const owner=await c.readContract({address:p,abi:poolAbi,functionName:'factory',blockNumber}),token0=await c.readContract({address:p,abi:poolAbi,functionName:'token0',blockNumber}),token1=await c.readContract({address:p,abi:poolAbi,functionName:'token1',blockNumber}),actualFee=await c.readContract({address:p,abi:poolAbi,functionName:'fee',blockNumber}),liquidity=await c.readContract({address:p,abi:poolAbi,functionName:'liquidity',blockNumber}),code=await c.getCode({address:p,blockNumber});
  if(!same(owner,network.factory)||actualFee!==fee||[token0.toLowerCase(),token1.toLowerCase()].sort().join()!==[a.toLowerCase(),b.toLowerCase()].sort().join()||!code||code==='0x')throw Error('Invalid discovered pool identity');
  if(liquidity>0n)pools.push({address:p,token0,token1,fee,liquidity:liquidity.toString(),codeHash:keccak256(code)});else missingPools.push({a,b,fee});
 }
 if((await c.getBlock({blockNumber})).hash!==b.hash)throw Error('Discovery reorg');
 const body={format:'mevy-route-universe/v1' as const,block:Number(blockNumber),blockHash:b.hash,timestamp:Number(b.timestamp),source:'https://rpc-robinhood.blockmachine.io' as const,tokens:labTokens,pools,routes:makeRoutes(pools),missingPools,codeHashes};return verifyGraph({...body,graphHash:digest(body)});
}
export function searchCells(g:LabGraph,prior:LabFrame[],mandatory:LabCell[],limit=6){
 verifyGraph(g);const routeIds=new Set(g.routes.map(r=>r.id));mandatory.forEach(x=>{cellSchema.parse(x);if(!routeIds.has(x.routeId))throw Error('Trial route missing from discovery graph');});
 const counts=new Map<string,number>();for(const f of prior)for(const q of f.quotes)counts.set(digest({routeId:q.routeId,sizeWei:q.sizeWei}),(counts.get(digest({routeId:q.routeId,sizeWei:q.sizeWei}))??0)+1);
 const all=g.routes.flatMap(r=>labSizes.map(sizeWei=>({routeId:r.id,sizeWei}))).sort((a,b)=>(counts.get(digest(a))??0)-(counts.get(digest(b))??0)||digest(a).localeCompare(digest(b)));
 const map=new Map(mandatory.map(x=>[digest(x),x]));for(const x of all){if(map.size>=limit)break;map.set(digest(x),x);}if(map.size>12)throw Error('Too many mandatory trial cells');return [...map.values()];
}
export async function quoteLabFrame(g:LabGraph,control:Observation,cells:LabCell[],rpc:string,controlSource:Record<string,any>):Promise<LabFrame>{
 verifyGraph(g);observationSchema.parse(control);const c=client(rpc),blockNumber=BigInt(control.block);
 const block=await c.getBlock({blockNumber});if(block.hash!==control.blockHash)throw Error('Control/discovery block differs');
 const read=async()=>{
  const quotes:z.infer<typeof labQuoteSchema>[]=[];
  for(const cell of cells){cellSchema.parse(cell);const route=g.routes.find(r=>r.id===cell.routeId);if(!route)throw Error('Unknown discovery route');
   try{const result=await c.call({to:network.quoter,data:encodeFunctionData({abi:quoterAbi,functionName:'quoteExactInput',args:[route.path as Hex,BigInt(cell.sizeWei)]}),blockNumber});if(!result.data)throw Error('Empty quote');const [out,,,gas]=decodeFunctionResult({abi:quoterAbi,functionName:'quoteExactInput',data:result.data});quotes.push({...cell,amountOutWei:out.toString(),gasUnits:(gas+150000n).toString(),error:null});}
   catch{quotes.push({...cell,amountOutWei:'0',gasUnits:'0',error:'Pinned discovery quote failed'});}
  }return quotes;
 };
 const quotes=await read(),paired=await read();if(digest(quotes)!==digest(paired)||(await c.getBlock({blockNumber})).hash!==control.blockHash)throw Error('Discovery quote re-check mismatch');
 const body={format:'mevy-lab-frame/v1' as const,graphHash:g.graphHash,control,controlSource,quotes,sourceCheck:{status:'MATCH' as const,source:new URL(rpc).origin,checkedAt:new Date().toISOString(),quoteHash:digest(quotes)}};
 return verifyFrame(frameSchema.parse({...body,frameHash:digest(body)}),g);
}
export function verifyFrame(f:LabFrame,g:LabGraph){frameSchema.parse(f);const {frameHash,...body}=f,{receiptHash,...capture}=f.controlSource,check=capture.checks?.[0];if(digest(body)!==frameHash||f.graphHash!==g.graphHash||f.sourceCheck.quoteHash!==digest(f.quotes)||new Set(f.quotes.map(q=>digest({routeId:q.routeId,sizeWei:q.sizeWei}))).size!==f.quotes.length||f.quotes.some(q=>!g.routes.some(r=>r.id===q.routeId))||digest(capture)!==receiptHash||capture.sourceAudit!=='PASS'||capture.checks?.length!==1||check?.observationHash!==digest(f.control)||check.sourceDigest!==digest(Object.fromEntries(sourceFields.map(k=>[k,f.control[k]]))))throw Error('Discovery frame mismatch');return f;}
