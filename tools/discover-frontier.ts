import {writeFileSync} from 'node:fs';
import {discoverGraph} from '../src/frontier-source.ts';
import {installRpcPacing} from '../src/rpc-pacing.ts';
const rpc='https://rpc-robinhood.blockmachine.io',restore=installRpcPacing(rpc,1100);
try{const g=await discoverGraph(rpc);writeFileSync('evidence/frontier-universe-2026-10-23.json',JSON.stringify(g,null,2)+'\n');console.log(JSON.stringify({block:g.block,pools:g.pools.length,tokens:g.tokens.length,routes:g.routes.length,events:g.scan.events.length}));}finally{restore();}
