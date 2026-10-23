import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {digest} from '../src/model.ts';import {verifyForkStudy} from '../src/fork-study.ts';
const path='evidence/fork-size-study-2026-10-23.json',read=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
test('the complete historical study reproduces source selection, all exact sizes, receipts and unchanged control',()=>{const r=verifyForkStudy(read(path),read);assert.equal(r.routes,6);assert.equal(r.executions,60);assert.equal(r.completeNetWei,null);assert.equal(r.livePromotion,'DISABLED');});
test('new hashes cannot conceal a changed gas equation, missing size or replaced original window',()=>{
 const original=read(path);for(const mode of ['gas','missing','window']){const report=structuredClone(original),routePath=report.routes[0].path,route=read(routePath);
  if(mode==='gas')route.rows[0].afterExecutionGasWei='1';if(mode==='missing')route.rows.pop();if(mode==='window')route.block++;
  const {routeHash,...body}=route;route.routeHash=digest(body);report.routes[0].routeHash=route.routeHash;const {reportHash,...r}=report;report.reportHash=digest(r);
  assert.throws(()=>verifyForkStudy(report,p=>p===routePath?route:read(p)));
 }
});
