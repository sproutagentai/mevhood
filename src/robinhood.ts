import { createPublicClient, http, parseAbi, encodeFunctionData, decodeFunctionResult, encodePacked, keccak256, type Address, type Hex } from 'viem';
import { observationSchema, type Observation } from './model.ts';

export const network={chainId:4663,rpc:'https://rpc.mainnet.chain.robinhood.com',
  factory:'0x1f7d7550b1b028f7571e69a784071f0205fd2efa',quoter:'0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7',
  router:'0xcaf681a66d020601342297493863e78c959e5cb2',
  weth:'0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73',usdg:'0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168'} as const;
const factoryAbi=parseAbi(['function getPool(address,address,uint24) view returns(address)']);
const poolAbi=parseAbi(['function factory() view returns(address)','function token0() view returns(address)','function token1() view returns(address)','function fee() view returns(uint24)','function liquidity() view returns(uint128)']);
const quoterAbi=parseAbi(['function quoteExactInput(bytes path,uint256 amountIn) returns(uint256 amountOut,uint160[] sqrtPriceX96AfterList,uint32[] initializedTicksCrossedList,uint256 gasEstimate)']);
const zero='0x0000000000000000000000000000000000000000';
export function client(rpc=network.rpc as string){const u=new URL(rpc);if(u.protocol!=='https:')throw Error('HTTPS RPC required');return createPublicClient({transport:http(rpc,{timeout:15000,retryCount:1,fetchOptions:{headers:{'User-Agent':'Mozilla/5.0 Mevy/0.1'}}})});}
export async function head(rpc?:string){const c=client(rpc);if(await c.getChainId()!==4663)throw Error('Wrong chain');const b=await c.getBlock();if(!b.hash)throw Error('Unmined block');return {number:Number(b.number),hash:b.hash,timestamp:Number(b.timestamp)};}
export async function snapshot(sizes:string[],costs:{extraGasWei:string|null;infrastructureWei:string|null},rpc=network.rpc as string,pinnedBlock?:number):Promise<Observation>{
  const c=client(rpc);if(await c.getChainId()!==4663)throw Error('Wrong chain');
  const tip=await c.getBlockNumber();const blockNumber=pinnedBlock===undefined?tip-64n:BigInt(pinnedBlock);const b=await c.getBlock({blockNumber});if(!b.hash)throw Error('Missing block hash');
  const errors:string[]=[];const codeHashes:Record<string,Hex>={};
  const pools:{fee:number;address:Address}[]=[];
  for(const a of [network.factory,network.quoter,network.router,network.weth,network.usdg]){const code=await c.getCode({address:a,blockNumber});if(!code||code==='0x')throw Error('Missing deployment: '+a);codeHashes[a.toLowerCase()]=keccak256(code);}
  for(const fee of [100,500,3000,10000]){
    const pool=await c.readContract({address:network.factory,abi:factoryAbi,functionName:'getPool',args:[network.weth,network.usdg,fee],blockNumber});
    if(pool===zero)continue;
    const factory=await c.readContract({address:pool,abi:poolAbi,functionName:'factory',blockNumber});
    const t0=await c.readContract({address:pool,abi:poolAbi,functionName:'token0',blockNumber});
    const t1=await c.readContract({address:pool,abi:poolAbi,functionName:'token1',blockNumber});
    const actualFee=await c.readContract({address:pool,abi:poolAbi,functionName:'fee',blockNumber});
    const liquidity=await c.readContract({address:pool,abi:poolAbi,functionName:'liquidity',blockNumber});
    if(factory.toLowerCase()!==network.factory || actualFee!==fee || [t0.toLowerCase(),t1.toLowerCase()].sort().join()!==[network.weth.toLowerCase(),network.usdg.toLowerCase()].sort().join())throw Error('Invalid pool identity');
    const code=await c.getCode({address:pool,blockNumber});if(!code)throw Error('Pool has no code');codeHashes[pool.toLowerCase()]=keccak256(code);
    if(liquidity>0n)pools.push({fee,address:pool});
  }
  const quotes:Observation['quotes']=[];
  if(pools.length<2)errors.push('Fewer than two liquid WETH/USDG fee-tier pools; no valid round trip');
  for(const sizeWei of [...new Set(sizes)].sort()) for(const a of pools)for(const back of pools){
    if(a.address===back.address)continue;
    const path=encodePacked(['address','uint24','address','uint24','address'],[network.weth,a.fee,network.usdg,back.fee,network.weth]);
    const common={route:`WETH/USDG ${a.fee} → ${back.fee}`,feeOut:a.fee,feeBack:back.fee,poolOut:a.address,poolBack:back.address,sizeWei,path};
    try{const result=await c.call({to:network.quoter,data:encodeFunctionData({abi:quoterAbi,functionName:'quoteExactInput',args:[path,BigInt(sizeWei)]}),blockNumber});
      if(!result.data)throw Error('Empty quote');const [out,,,gas]=decodeFunctionResult({abi:quoterAbi,functionName:'quoteExactInput',data:result.data});
      quotes.push({...common,amountOutWei:out.toString(),gasUnits:(gas+150000n).toString(),error:null});
    }catch{quotes.push({...common,amountOutWei:'0',gasUnits:'0',error:'Pinned QuoterV2 call reverted or failed'});}
  }
  // eth_gasPrice is a current hint, not a historical block price. The block's base fee is pinned;
  // the additional execution/L1 fee upper bound must be supplied explicitly by an operator.
  if(b.baseFeePerGas===null)throw Error('Missing pinned base fee');
  const reread=await c.getBlock({blockNumber});if(reread.hash!==b.hash)throw Error('Reorg during snapshot');
  return observationSchema.parse({chainId:4663,block:Number(blockNumber),blockHash:b.hash,timestamp:Number(b.timestamp),collectedAt:Math.floor(Date.now()/1000),provider:rpc,factory:network.factory,quoter:network.quoter,codeHashes,
    gasPriceWei:b.baseFeePerGas.toString(),extraGasWei:costs.extraGasWei,infrastructureWei:costs.infrastructureWei,gasModel:'quoter-plus-overhead-v1',quotes,errors});
}
