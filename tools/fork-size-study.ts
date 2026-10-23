import {readFileSync,writeFileSync,mkdirSync,openSync,closeSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {createPublicClient,createWalletClient,http,parseAbi,defineChain,encodeFunctionData,decodeFunctionResult,type Address,type Hex} from 'viem';
const root='.release-private/fork-sizes-2026-10-23',plan=JSON.parse(readFileSync('evidence/fork-size-plan-2026-10-23.json','utf8'));
const proxy='http://127.0.0.1:18549',local='http://127.0.0.1:18550',chain=defineChain({id:4663,name:'LOCAL Robinhood historical fork',nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18},rpcUrls:{default:{http:[local]}}});
const weth='0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73' as Address,router='0xCaf681a66D020601342297493863E78C959E5cb2' as Address,quoter='0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7' as Address;
const token=parseAbi(['function deposit() payable','function transfer(address,uint256) returns(bool)','function balanceOf(address) view returns(uint256)']);
const quoteAbi=parseAbi(['function quoteExactInput(bytes path,uint256 amountIn) returns(uint256 amountOut,uint160[] sqrtPriceX96AfterList,uint32[] initializedTicksCrossedList,uint256 gasEstimate)']);
const artifact=JSON.parse(readFileSync('out/RouteProbe.sol/RouteProbe.json','utf8'));
const json=(x:unknown)=>JSON.stringify(x,(_,v)=>typeof v==='bigint'?v.toString():v,2)+'\n';mkdirSync(root,{recursive:true});
const archive=createPublicClient({transport:http(proxy,{timeout:300000,retryCount:0})});
const selectedAt=process.argv.indexOf('--only-block'),onlyBlock=selectedAt<0?null:Number(process.argv[selectedAt+1]);
const results:any[]=[];
for(let ri=0;ri<plan.routes.length;ri++){
 const r=plan.routes[ri];if(onlyBlock!==null&&r.block!==onlyBlock)continue;const referencePath=`evidence/fork-size-route-${r.block}-2026-10-23.json`;let reference:any=null;try{reference=JSON.parse(readFileSync(referencePath,'utf8'));}catch{}const log=openSync(root+`/anvil-${r.block}.log`,'a');
 const child=spawn(process.env.ANVIL_BIN||'anvil',['--host','127.0.0.1','--accounts','1','--port','18550','--fork-url',proxy,'--fork-block-number',String(r.block),'--fork-state-by-number','--no-fork-node-info','--no-rate-limit','--timeout','300000','--hardfork','cancun','--no-mining','--silent'],{stdio:['ignore',log,log]});closeSync(log);
 const c=createPublicClient({chain,transport:http(local,{timeout:300000,retryCount:0})}),rpc=async(method:string,params:any[]=[])=>c.request({method:method as any,params} as any);
 try{
  let ready=false;const deadline=Date.now()+180000;
  while(Date.now()<deadline){if(child.exitCode!==null)throw Error('Local fork process exited before startup');try{const ping=await fetch(local,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_chainId',params:[]}),signal:AbortSignal.timeout(2000)});if((await ping.json()).result==='0x1237'){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}if(!ready)throw Error('Local fork startup exceeded three minutes');
  const block=await c.getBlock({blockNumber:BigInt(r.block)});if(block.hash!==r.blockHash||await c.getChainId()!==4663)throw Error('Historical fork identity mismatch');
  const [account]=await rpc('eth_accounts') as Address[],wallet=createWalletClient({chain,account:account!,transport:http(local,{timeout:300000,retryCount:0})});
  const fee=BigInt(r.baseFeeWei),mined=async(hash:Hex)=>{for(let n=0;n<4800;n++){try{return await c.getTransactionReceipt({hash});}catch{await new Promise(r=>setTimeout(r,250));}}throw Error('Local transaction not mined');},tx=async(args:any)=>{await rpc('anvil_setNextBlockBaseFeePerGas',['0x'+fee.toString(16)]);const nonce=Number(BigInt(await rpc('eth_getTransactionCount',[account,'latest']) as string));const hash=await wallet.writeContract({...args,nonce,gas:8_000_000n,gasPrice:fee});await rpc('evm_mine');return mined(hash);};
  await rpc('anvil_setNonce',[account,'0x0']);await rpc('anvil_setBalance',[account,'0x56bc75e2d63100000']);await rpc('anvil_setNextBlockBaseFeePerGas',['0x'+fee.toString(16)]);
  const deployHash=await wallet.deployContract({abi:artifact.abi,bytecode:artifact.bytecode.object,args:[weth,router],gas:8_000_000n,gasPrice:fee,nonce:Number(BigInt(await rpc('eth_getTransactionCount',[account,'latest']) as string))}),deployment=(await rpc('evm_mine'),await mined(deployHash));if(deployment.status!=='success'||!deployment.contractAddress)throw Error('Research probe deployment failed');const probe=deployment.contractAddress;
  if((await tx({address:weth,abi:token,functionName:'deposit',value:30_000_000_000_000_000n})).status!=='success')throw Error('Local WETH deposit failed');
  if((await tx({address:weth,abi:token,functionName:'transfer',args:[probe,30_000_000_000_000_000n]})).status!=='success')throw Error('Probe funding failed');
  const rows:any[]=[];
  for(const size of plan.sizesWei){
   const checkpoint=await rpc('evm_snapshot');let row:any={sizeWei:size};
   try{
    const data=encodeFunctionData({abi:quoteAbi,functionName:'quoteExactInput',args:[r.route.path,BigInt(size)]});
    const original=await archive.call({to:quoter,data,blockNumber:BigInt(r.block)});if(!original.data)throw Error('Empty archive quote');const quote=decodeFunctionResult({abi:quoteAbi,functionName:'quoteExactInput',data:original.data});
    const recorded=reference?.rows.find((x:any)=>x.sizeWei===size)?.receipt?.blockTimestamp;if(recorded)await rpc('evm_setNextBlockTimestamp',[Number(recorded)]);
    const before=await c.readContract({address:weth,abi:token,functionName:'balanceOf',args:[probe]}),receipt=await tx({address:probe,abi:artifact.abi,functionName:'execute',args:[r.route.path,BigInt(size)]}),after=await c.readContract({address:weth,abi:token,functionName:'balanceOf',args:[probe]});
    const amountOut=after+BigInt(size)-before,gross=after-before,gasCost=receipt.gasUsed*receipt.effectiveGasPrice;
    row={...row,status:receipt.status,archiveAmountOutWei:quote[0].toString(),archiveQuoterGasUnits:quote[3].toString(),actualAmountOutWei:amountOut.toString(),quoteMatchesExecution:receipt.status==='success'&&quote[0]===amountOut,beforeBalanceWei:before.toString(),afterBalanceWei:after.toString(),grossDeltaWei:gross.toString(),executionGasUnits:receipt.gasUsed.toString(),effectiveGasPriceWei:receipt.effectiveGasPrice.toString(),executionGasWei:gasCost.toString(),afterExecutionGasWei:(gross-gasCost).toString(),receipt};
   }catch(e){row={...row,status:'SOURCE_OR_EXECUTION_ERROR',errorType:e instanceof Error?e.name:'UnknownError',errorSummary:e instanceof Error?e.message.slice(0,350):'Unknown error'};}
   finally{if(!await rpc('evm_revert',[checkpoint]))throw Error('Fork snapshot reset failed');}
   rows.push(row);writeFileSync(root+`/route-${r.block}.json`,json({format:'mevy-fork-route-raw/v1',route:r,probeDeployment:deployment,rows,localForkOnly:true}));console.log(json({state:'SIZE_EXECUTED',route:ri+1,block:r.block,sizeWei:size,status:row.status,match:row.quoteMatchesExecution,net:row.afterExecutionGasWei}).trim());
  }
  results.push({route:r,probeDeployment:deployment,rows});writeFileSync(root+(onlyBlock===null?'/raw-results.json':`/raw-recheck-${onlyBlock}.json`),json({plan,results,localForkOnly:true}));
 }finally{child.kill('SIGTERM');await new Promise<void>(resolve=>{if(child.exitCode!==null)resolve();else {const timer=setTimeout(()=>child.kill('SIGKILL'),5000);child.once('exit',()=>{clearTimeout(timer);resolve();});}});}
}
console.log(json({state:'STUDY_COMPLETE',routes:results.length,rows:results.flatMap(r=>r.rows).length}).trim());
