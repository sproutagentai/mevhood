import {test} from 'node:test';import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';import {installRpcPacing} from '../src/rpc-pacing.ts';
test('concurrent archive requests are paced and unrelated hosts are not intercepted',async()=>{
 const original=globalThis.fetch,times:number[]=[];globalThis.fetch=async()=>{times.push(performance.now());return new Response('{}');};
 const restore=installRpcPacing('https://archive.example',25);
 try{await Promise.all([fetch('https://archive.example'),fetch('https://archive.example'),fetch('https://archive.example')]);assert.equal(times.length,3);assert.ok(times[1]!-times[0]!>=20);assert.ok(times[2]!-times[1]!>=20);await fetch('https://other.example');assert.equal(times.length,4);}
 finally{restore();globalThis.fetch=original;}
});
