import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,readFileSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {spawnSync} from 'node:child_process';
import {auditSource,type EvidenceBundle} from '../src/source-audit.ts';
test('history CLI resumes bound receipts without network and rejects a changed receipt',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'mevy-source-resume-'));
 try{
  const b=JSON.parse(readFileSync('evidence/integration-2026-10-21.json','utf8')) as EvidenceBundle;
  const rpc='https://archive.example',receipt=await auditSource(b,{rpc,read:async()=>structuredClone(b.observations[0]!)}),out=join(dir,'receipts');mkdirSync(out);
  writeFileSync(join(dir,'bundle.json'),JSON.stringify(b));writeFileSync(join(dir,'no-network.mjs'),"globalThis.fetch=async()=>{throw new Error('Unexpected network in resume test')};\n");
  const path=join(out,`block-${b.observations[0]!.block}.json`);writeFileSync(path,JSON.stringify(receipt));
  const args=['--import','tsx','--import',join(dir,'no-network.mjs'),'src/audit-history.ts','--file',join(dir,'bundle.json'),'--output',out,'--rpc',rpc];
  const ok=spawnSync(process.execPath,args,{encoding:'utf8'});assert.equal(ok.status,0,ok.stderr);assert.match(ok.stdout,/"auditComplete":true/);
  receipt.checks[0]!.observationHash='0x'+'0'.repeat(64);writeFileSync(path,JSON.stringify(receipt));
  const bad=spawnSync(process.execPath,args,{encoding:'utf8'});assert.notEqual(bad.status,0);assert.match(bad.stderr,/Saved audit receipt mismatch/);assert.doesNotMatch(bad.stderr,/Unexpected network/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
