import { setTimeout as pause } from 'node:timers/promises';
import { performance } from 'node:perf_hooks';

// A transport-only budget. Does not change frozen request parameters or source values.
// Share a host's quota operationally: do not run separate free-tier audits and collection concurrently.
export function installRpcPacing(rpc:string,intervalMs=1100){
 if(!Number.isSafeInteger(intervalMs)||intervalMs<0)throw Error('Invalid RPC pacing interval');
 const target=new URL(rpc).href,original=globalThis.fetch;let tail=Promise.resolve(),next=0;
 const wrapped:typeof fetch=async(input,init)=>{
  const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;
  if(new URL(url).href!==target)return original(input,init);
  const turn=tail.then(async()=>{const wait=next-performance.now();if(wait>0)await pause(wait);next=performance.now()+intervalMs;});
  tail=turn.catch(()=>{});await turn;return original(input,init);
 };
 globalThis.fetch=wrapped;return ()=>{if(globalThis.fetch===wrapped)globalThis.fetch=original;};
}
