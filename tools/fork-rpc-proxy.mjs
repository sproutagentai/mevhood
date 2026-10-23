// Read-only archive pacing for local fork studies. Never forwards transactions.
import http from 'node:http';
import {createHash} from 'node:crypto';
import {mkdirSync,existsSync,readFileSync,writeFileSync} from 'node:fs';
const port=Number(process.env.MEVY_FORK_PROXY_PORT||18549),root=process.env.MEVY_FORK_CACHE||'.release-private/fork-sizes-2026-10-23/rpc-cache';
const upstream=process.env.MEVY_ARCHIVE_RPC_URL||'https://rpc-robinhood.blockmachine.io';mkdirSync(root,{recursive:true});
let chain=Promise.resolve(),last=0,requests=0,hits=0;
const allowed=new Set(['eth_chainId','eth_blockNumber','eth_getBlockByNumber','eth_getBlockByHash','eth_getCode','eth_getStorageAt','eth_getBalance','eth_getTransactionCount','eth_call','eth_getProof','eth_getTransactionByHash','eth_getTransactionReceipt','net_version','web3_clientVersion']);
async function one(q){
 if(!allowed.has(q.method))return {jsonrpc:'2.0',id:q.id,error:{code:-32601,message:'Read-only fork proxy: method unavailable'}};
 const key=createHash('sha256').update(JSON.stringify([q.method,q.params||[]])).digest('hex'),path=root+'/'+key+'.json';
 const cacheable=!JSON.stringify(q.params||[]).includes('latest')&&!['eth_blockNumber'].includes(q.method);
 if(cacheable&&existsSync(path)){hits++;return {jsonrpc:'2.0',id:q.id,...JSON.parse(readFileSync(path,'utf8'))};}
 const task=async()=>{
  if(cacheable&&existsSync(path)){hits++;return {jsonrpc:'2.0',id:q.id,...JSON.parse(readFileSync(path,'utf8'))};}
  for(let attempt=0;attempt<3;attempt++){
   await new Promise(r=>setTimeout(r,Math.max(0,last+1100-Date.now())));last=Date.now();requests++;
   const r=await fetch(upstream,{method:'POST',headers:{'Content-Type':'application/json','User-Agent':'Mevy-local-fork-study'},body:JSON.stringify({...q,id:1}),signal:AbortSignal.timeout(30000)});
   if(r.status===429){await new Promise(r=>setTimeout(r,5000));continue;}
   if(!r.ok)throw Error('Archive HTTP '+r.status);
   const d=await r.json(),body=d.error?{error:d.error}:{result:d.result};
   if(cacheable&&!d.error&&d.result!==undefined)writeFileSync(path,JSON.stringify(body));
   return {jsonrpc:'2.0',id:q.id,...body};
  }throw Error('Archive pacing exhausted');
 };
 const out=chain.then(task);chain=out.catch(()=>{});return out;
}
const server=http.createServer(async(req,res)=>{try{let raw='';for await(const x of req){raw+=x;if(raw.length>2_000_000)throw Error('Request too large');}const q=JSON.parse(raw),result=Array.isArray(q)?await Promise.all(q.map(one)):await one(q);res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(result));}catch{res.writeHead(502,{'Content-Type':'application/json'});res.end(JSON.stringify({jsonrpc:'2.0',id:null,error:{code:-32000,message:'Archive read failed'}}));}});
server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({state:'READ_ONLY_FORK_PROXY',port,upstream:new URL(upstream).origin})));
setInterval(()=>console.log(JSON.stringify({state:'PROXY_PROGRESS',requests,cacheHits:hits})),30000).unref();
for(const sig of ['SIGTERM','SIGINT'])process.on(sig,()=>server.close(()=>process.exit(0)));
