// Optional acceleration: cache genuine pinned storage reads in bounded RPC batches.
// No zeros or synthetic pool state are substituted for an archive response.
import{readFileSync,existsSync,writeFileSync}from'node:fs';import{createHash}from'node:crypto';import{keccak256,encodeAbiParameters}from'viem';
const at=process.argv.indexOf('--block'),block=Number(process.argv[at+1]);if(at<0||!Number.isSafeInteger(block))throw Error('Use --block NUMBER');
const plan=JSON.parse(readFileSync('evidence/fork-size-plan-2026-10-23.json','utf8')),route=plan.routes.find((r:any)=>r.block===block);if(!route)throw Error('Only a frozen study block is accepted');
const root='.release-private/fork-sizes-2026-10-23/rpc-cache',pending:any[]=[];
for(let i=0;i<route.route.pools.length;i++){
 // The 500-fee pool's bitmap bounds follow its ten-tick spacing. Reading a
 // non-bitmap slot would still cache the real storage value, never invent state.
 if(route.route.fees[i]!==500)continue;
 const pool=route.route.pools[i].toLowerCase();let hits:number[]=[];
 for(let word=-347;word<=346;word++){const slot=keccak256(encodeAbiParameters([{type:'int16'},{type:'uint256'}],[word,6n])),params=[pool,slot,'0x'+block.toString(16)],key=createHash('sha256').update(JSON.stringify(['eth_getStorageAt',params])).digest('hex');if(existsSync(root+'/'+key+'.json'))hits.push(word);}
 if(hits.length<20)continue;
 const increasing=hits.at(-1)!-hits[0]!>20; if(!increasing)continue;
 for(let word=hits.at(-1)!+1;word<=346;word++){const slot=keccak256(encodeAbiParameters([{type:'int16'},{type:'uint256'}],[word,6n])),params=[pool,slot,'0x'+block.toString(16)],key=createHash('sha256').update(JSON.stringify(['eth_getStorageAt',params])).digest('hex');if(!existsSync(root+'/'+key+'.json'))pending.push({params,key});}
}
let saved=0;for(let start=0;start<pending.length;start+=25){const batch=pending.slice(start,start+25),response=await fetch(process.env.MEVY_ARCHIVE_RPC_URL||'https://rpc-robinhood.blockmachine.io',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(batch.map((q,i)=>({jsonrpc:'2.0',id:i,method:'eth_getStorageAt',params:q.params}))),signal:AbortSignal.timeout(30000)}),items=await response.json();if(!response.ok||!Array.isArray(items)||items.length!==batch.length)throw Error('Archive batch unavailable');for(const item of items){if(!Number.isInteger(item.id)||!batch[item.id]||item.error||!/^0x[a-fA-F0-9]{64}$/.test(item.result))throw Error('Invalid archive storage response');const path=root+'/'+batch[item.id].key+'.json',value=JSON.stringify({result:item.result});if(existsSync(path)&&readFileSync(path,'utf8')!==value)throw Error('Archive cache conflict');writeFileSync(path,value);saved++;}await new Promise(r=>setTimeout(r,1100));}
console.log(JSON.stringify({state:'PINNED_BITMAP_PREFETCH',block,storageReads:saved,syntheticStorage:false}));
