import { parseAbi,encodePacked,encodeFunctionData,decodeFunctionResult,keccak256,type Address,type Hex } from 'viem';
import { z } from 'zod';
import { client,network } from './robinhood.ts';
import { digest,address,hash,uint,observationSchema,type Observation } from './model.ts';
import { readFileSync } from 'node:fs';
import { parseAbiItem } from 'viem';
import { sourceFields } from './source-audit.ts';
export const labTokens=[{symbol:'WETH',address:network.weth},{symbol:'USDG',address:network.usdg},{symbol:'PONS',address:'0x39dBED3a2bd333467115dE45665cC57F813C4571'},{symbol:'CASHCAT',address:'0x020bfC650A365f8BB26819deAAbF3E21291018b4'}] as const;
export const labSizes=['100000000000000','1000000000000000','5000000000000000','20000000000000000'] as const;
export const poolSchema=z.object({address,token0:address,token1:address,fee:z.number().int().positive(),liquidity:uint,codeHash:hash}).strict();
export const routeSchema=z.object({id:hash,label:z.string().max(160),family:z.enum(['cross-pool','triangle','four-hop']),tokens:z.array(address).min(3).max(5),fees:z.array(z.number().int().positive()).min(2).max(4),pools:z.array(address).min(2).max(4),path:z.string().regex(/^0x[0-9a-f]+$/)}).strict();
export type LabRoute=z.infer<typeof routeSchema>;
export const graphSchema=z.object({format:z.literal('mevy-frontier-universe/v1'),block:z.number().int().positive(),blockHash:hash,timestamp:z.number().int().positive(),source:z.literal('https://rpc-robinhood.blockmachine.io'),tokens:z.array(z.object({symbol:z.string(),address}).strict()),pools:z.array(poolSchema),routes:z.array(routeSchema).max(320),scan:z.object({fromBlock:z.number().int(),toBlock:z.number().int(),eventSource:z.literal('https://rpc.mainnet.chain.robinhood.com'),events:z.array(z.object({pool:address,token0:address,token1:address,fee:z.number().int(),block:z.number().int(),blockHash:hash,transactionHash:hash,logIndex:z.number().int()}).strict()),checkedPools:z.array(address),excludedPools:z.array(z.object({address,reason:z.string()}).strict()),policy:z.string()}).strict(),missingPools:z.array(z.object({a:address,b:address,fee:z.number().int()}).strict()),codeHashes:z.record(z.string(),hash),graphHash:hash}).strict();
export type LabGraph=z.infer<typeof graphSchema>;
export const cellSchema=z.object({routeId:hash,sizeWei:z.enum(labSizes)}).strict();
export type LabCell=z.infer<typeof cellSchema>;
export const labQuoteSchema=cellSchema.extend({amountOutWei:uint,gasUnits:uint,error:z.string().nullable()}).strict();
export const frameSchema=z.object({format:z.literal('mevy-frontier-frame/v1'),graphHash:hash,control:observationSchema,controlSource:z.record(z.string(),z.any()),quotes:z.array(labQuoteSchema).max(12),sourceCheck:z.object({status:z.literal('MATCH'),source:z.string(),checkedAt:z.string(),quoteHash:hash}).strict(),frameHash:hash}).strict();
export type LabFrame=z.infer<typeof frameSchema>;
const factoryAbi=parseAbi(['function getPool(address,address,uint24) view returns(address)']);
const poolAbi=parseAbi(['function factory() view returns(address)','function token0() view returns(address)','function token1() view returns(address)','function fee() view returns(uint24)','function liquidity() view returns(uint128)']);
const quoterAbi=parseAbi(['function quoteExactInput(bytes path,uint256 amountIn) returns(uint256 amountOut,uint160[] sqrtPriceX96AfterList,uint32[] initializedTicksCrossedList,uint256 gasEstimate)']);
const same=(a:string,b:string)=>a.toLowerCase()===b.toLowerCase(),zero='0x0000000000000000000000000000000000000000';
export function makeRoutes(pools:z.infer<typeof poolSchema>[],tokens:{symbol:string;address:string}[]):LabRoute[]{
 const routes:LabRoute[]=[],w=network.weth.toLowerCase();
 function walk(at:string,ts:string[],legs:typeof pools){
  if(legs.length>=4)return;
  for(const p of pools){if(legs.some(l=>same(l.address,p.address)))continue;const next=same(p.token0,at)?p.token1:same(p.token1,at)?p.token0:null;if(!next)continue;
   const newLegs=[...legs,p],newTokens=[...ts,next];
   if(same(next,w)){if(newLegs.length<2)continue;const fees=newLegs.map(p=>p.fee),addresses=newLegs.map(p=>p.address),types:any[]=['address'],values:any[]=[ts[0]];newLegs.forEach((l,i)=>{types.push('uint24','address');values.push(l.fee,newTokens[i+1]);});
    const body={label:newTokens.map(t=>tokens.find(x=>same(x.address,t))?.symbol??t.slice(0,8)).join(' → ')+' / '+fees.join(' · '),family:newLegs.length===2?'cross-pool' as const:newLegs.length===3?'triangle' as const:'four-hop' as const,tokens:newTokens,fees,pools:addresses,path:encodePacked(types,values)};routes.push(routeSchema.parse({...body,id:digest(body)}));
   }else if(!ts.some(t=>same(t,next)))walk(next,newTokens,newLegs);
  }
 }
 walk(w,[network.weth],[]);
 // Stable bounded breadth: alternate route lengths, then pool-address diversity.
 const sorted=routes.sort((a,b)=>a.id.localeCompare(b.id)),groups=[2,3,4].map(n=>sorted.filter(r=>r.fees.length===n)),picked:LabRoute[]=[];
 for(let i=0;picked.length<320&&groups.some(g=>i<g.length);i++)for(const g of groups)if(g[i]&&picked.length<320)picked.push(g[i]!);
 return picked.sort((a,b)=>a.id.localeCompare(b.id));
}
export function verifyGraph(input:unknown){const g=graphSchema.parse(input),{graphHash,...body}=g;if(digest(body)!==graphHash||JSON.stringify(makeRoutes(g.pools,g.tokens))!==JSON.stringify(g.routes)||g.scan.toBlock!==g.block||g.scan.fromBlock<0||g.scan.toBlock-g.scan.fromBlock!==999999||new Set(g.pools.map(p=>p.address.toLowerCase())).size!==g.pools.length||g.pools.some(p=>BigInt(p.liquidity)===0n))throw Error('Frontier universe integrity mismatch');return g;}
export async function discoverGraph(rpc:string):Promise<LabGraph>{
 const c=client(rpc),eventClient=client(network.rpc);if(await c.getChainId()!==4663||await eventClient.getChainId()!==4663)throw Error('Wrong discovery chain');const blockNumber=(await c.getBlockNumber())-64n,b=await c.getBlock({blockNumber});if(!b.hash)throw Error('Missing discovery block');
 const fromBlock=blockNumber-999999n;
 const logs=await eventClient.getLogs({address:network.factory,event:parseAbiItem('event PoolCreated(address indexed token0,address indexed token1,uint24 indexed fee,int24 tickSpacing,address pool)'),fromBlock,toBlock:blockNumber});
 if((await eventClient.getBlock({blockNumber})).hash!==b.hash)throw Error('Independent discovery head differs');
 const events=logs.map(l=>({pool:l.args.pool!,token0:l.args.token0!,token1:l.args.token1!,fee:l.args.fee!,block:Number(l.blockNumber),blockHash:l.blockHash!,transactionHash:l.transactionHash!,logIndex:l.logIndex!}));
 const degree=new Map<string,number>();for(const e of events)for(const t of [e.token0,e.token1])degree.set(t.toLowerCase(),(degree.get(t.toLowerCase())??0)+1);
 const old=JSON.parse(readFileSync(new URL('../evidence/lab-universe-2026-10-22.json',import.meta.url),'utf8'));
 const pools:z.infer<typeof poolSchema>[]=[],excludedPools:{address:string;reason:string}[]=[],checkedPools:string[]=[],codeHashes:Record<string,string>={};
 const candidates=new Map<string,{address:string;token0:string;token1:string;fee:number}>();for(const p of old.pools)candidates.set(p.address.toLowerCase(),p);
 // Prioritize non-leaf assets. A lone pool cannot form a distinct-pool atomic cycle.
 const ranked=events.filter(e=>[e.token0,e.token1].filter(t=>!same(t,network.weth)&&!same(t,network.usdg)).some(t=>(degree.get(t.toLowerCase())??0)>1)||(!same(e.token0,network.weth)&&!same(e.token1,network.weth))).sort((a,b)=>b.block-a.block||a.pool.localeCompare(b.pool)).slice(0,24);
 for(const e of ranked)candidates.set(e.pool.toLowerCase(),{address:e.pool,token0:e.token0,token1:e.token1,fee:e.fee});
 for(const e of events)if(!candidates.has(e.pool.toLowerCase()))excludedPools.push({address:e.pool,reason:'Outside bounded 24-pool expansion; singleton or rank limit. Not a claim of zero liquidity.'});
 for(const a of [network.factory,network.quoter]){const code=await c.getCode({address:a as Address,blockNumber});if(!code||code==='0x')throw Error('Missing deployment');codeHashes[a.toLowerCase()]=keccak256(code);}
 for(const p of candidates.values()){
  const a=p.address as Address;checkedPools.push(a);
  try{const owner=await c.readContract({address:a,abi:poolAbi,functionName:'factory',blockNumber}),token0=await c.readContract({address:a,abi:poolAbi,functionName:'token0',blockNumber}),token1=await c.readContract({address:a,abi:poolAbi,functionName:'token1',blockNumber}),fee=await c.readContract({address:a,abi:poolAbi,functionName:'fee',blockNumber}),liquidity=await c.readContract({address:a,abi:poolAbi,functionName:'liquidity',blockNumber}),code=await c.getCode({address:a,blockNumber}),canonical=await c.readContract({address:network.factory,abi:factoryAbi,functionName:'getPool',args:[token0,token1,fee],blockNumber});
   if(!same(owner,network.factory)||!same(canonical,a)||!same(token0,p.token0)||!same(token1,p.token1)||fee!==p.fee||!code||code==='0x')throw Error('Pool identity mismatch');
   if(liquidity>0n)pools.push({address:a,token0,token1,fee,liquidity:liquidity.toString(),codeHash:keccak256(code)});else excludedPools.push({address:a,reason:'Zero active liquidity at pinned block'});
  }catch{excludedPools.push({address:a,reason:'Pinned identity/liquidity read failed; excluded, not zero-valued'});}
 }
 const tokens:{symbol:string;address:string}[]=[];for(const a of [...new Set(pools.flatMap(p=>[p.token0,p.token1]))]){const known=labTokens.find(t=>same(t.address,a));let symbol=known?.symbol??a.slice(0,8);try{symbol=String(await c.readContract({address:a as Address,abi:parseAbi(['function symbol() view returns(string)']),functionName:'symbol',blockNumber})).replace(/[^A-Za-z0-9._-]/g,'').slice(0,14)||a.slice(0,8);}catch{}tokens.push({symbol,address:a});}
 if((await c.getBlock({blockNumber})).hash!==b.hash)throw Error('Discovery reorg');
 const scan={fromBlock:Number(fromBlock),toBlock:Number(blockNumber),eventSource:network.rpc,events,checkedPools,excludedPools,policy:'Last 1,000,000 blocks, complete factory event query; previous 14 pools plus up to 24 recent pools prioritising non-leaf assets. Daily rescan after active screens settle. Bounded coverage, not the whole chain.'};
 const body={format:'mevy-frontier-universe/v1' as const,block:Number(blockNumber),blockHash:b.hash,timestamp:Number(b.timestamp),source:'https://rpc-robinhood.blockmachine.io' as const,tokens,pools,routes:makeRoutes(pools,tokens),missingPools:[],codeHashes,scan};return verifyGraph({...body,graphHash:digest(body)});
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
 const body={format:'mevy-frontier-frame/v1' as const,graphHash:g.graphHash,control,controlSource,quotes,sourceCheck:{status:'MATCH' as const,source:new URL(rpc).origin,checkedAt:new Date().toISOString(),quoteHash:digest(quotes)}};
 return verifyFrame(frameSchema.parse({...body,frameHash:digest(body)}),g);
}
export function verifyFrame(f:LabFrame,g:LabGraph){frameSchema.parse(f);const {frameHash,...body}=f,{receiptHash,...capture}=f.controlSource,check=capture.checks?.[0];if(digest(body)!==frameHash||f.graphHash!==g.graphHash||f.sourceCheck.quoteHash!==digest(f.quotes)||new Set(f.quotes.map(q=>digest({routeId:q.routeId,sizeWei:q.sizeWei}))).size!==f.quotes.length||f.quotes.some(q=>!g.routes.some(r=>r.id===q.routeId))||digest(capture)!==receiptHash||capture.sourceAudit!=='PASS'||capture.checks?.length!==1||check?.observationHash!==digest(f.control)||check.sourceDigest!==digest(Object.fromEntries(sourceFields.map(k=>[k,f.control[k]]))))throw Error('Discovery frame mismatch');return f;}
