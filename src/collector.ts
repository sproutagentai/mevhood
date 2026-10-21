import { openSync,closeSync,unlinkSync,writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { setTimeout as pause } from 'node:timers/promises';
import { Store } from './store.ts';
import { engineHash } from './model.ts';
import { snapshot } from './robinhood.ts';

// An explicit, bounded read-only process. Never started by import, install, build or tests.
const {values:v,positionals:[id]}=parseArgs({allowPositionals:true,options:{db:{type:'string',default:'data/mevy.sqlite'},seconds:{type:'string',default:'3600'},interval:{type:'string',default:'60'},'extra-gas-wei':{type:'string'},'infra-wei':{type:'string'}}});
async function main(){
  const seconds=Number(v.seconds),interval=Number(v.interval);
  if(!id||!Number.isInteger(seconds)||seconds<60||seconds>86400||!Number.isInteger(interval)||interval<30||interval>240)throw Error('Provide experiment ID, --seconds 60..86400 and --interval 30..240');
  const s=new Store(v.db!);const lock=v.db!+'.collector.lock';let fd:number|undefined;
  try{fd=openSync(lock,'wx',0o600);writeFileSync(fd,JSON.stringify({pid:process.pid,expiresAt:Date.now()+seconds*1000}));s.verifyJournal();const e=s.experiment(id);
    if(e.engineHash!==engineHash())throw Error('Engine differs from frozen experiment');
    const until=Date.now()+seconds*1000;const abort=new AbortController();process.once('SIGINT',()=>abort.abort());process.once('SIGTERM',()=>abort.abort());
    while(Date.now()<until&&!abort.signal.aborted){
      // Provider failures stop visibly. Restarting must not erase the resulting collection gap.
      const o=await snapshot([e.baseline.sizeWei,e.candidate.sizeWei],{extraGasWei:v['extra-gas-wei']??null,infrastructureWei:v['infra-wei']??null});
      const last=s.observations(id).at(-1);if(last?.block!==o.block){s.add(id,o);console.log(JSON.stringify({block:o.block,quotes:o.quotes.length,sourceErrors:o.errors}));}
      await pause(Math.min(interval*1000,Math.max(0,until-Date.now())),undefined,{signal:abort.signal}).catch(err=>{if(err.name!=='AbortError')throw err;});
    }
  }finally{if(fd!==undefined){closeSync(fd);unlinkSync(lock);}s.close();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
