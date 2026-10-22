import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {MockLanguageModelV4} from 'ai/test';
import {generateDiscoveryOutput,type ProviderReceipt} from '../src/lab-generation.ts';
import {discoveryInstructions,planDiscovery,runDiscovery} from '../src/lab-research.ts';
import {verifyGraph} from '../src/lab-source.ts';
import {labRecord,validateLabRecord} from '../src/lab-publication.ts';
import {readResearchAttempts} from '../src/lab-attempts.ts';
import {AutoStore} from '../src/auto-research.ts';
const report=JSON.parse(readFileSync('evidence/lab-mevy-auto-20261021-progress-95408918-report.json','utf8')),graph=verifyGraph(JSON.parse(readFileSync(report.graphPath,'utf8'))),frames=report.sources.slice(0,6).map((s:any)=>JSON.parse(readFileSync(s.path,'utf8'))),control=report.control;
const usage=(out:number,reasoning:number)=>({inputTokens:{total:100,noCache:100,cacheRead:undefined,cacheWrite:undefined},outputTokens:{total:out,text:out-reasoning,reasoning}});
test('reasoning-only exhausted output persists diagnostics before the installed SDK throws, without retry',async()=>{
 const model=new MockLanguageModelV4({modelId:'gpt-6-luna',doGenerate:{content:[],finishReason:{unified:'length',raw:'max_output_tokens'},usage:usage(6000,6000),warnings:[],response:{id:'offline-no-output',modelId:'gpt-6-luna',timestamp:new Date()}}});let receipt:ProviderReceipt|undefined;
 await assert.rejects(()=>generateDiscoveryOutput('offline fixture',discoveryInstructions,'v2',r=>{receipt=r;},model),{name:'AI_NoOutputGeneratedError'});
 assert.equal(model.doGenerateCalls.length,1);assert.equal(model.doGenerateCalls[0]!.maxOutputTokens,16000);assert.equal(receipt!.outputTokens,6000);assert.equal(receipt!.reasoningTokens,6000);assert.equal(receipt!.finishReason,'length');assert.equal(receipt!.visibleCharacters,0);
});
test('invalid JSON retains response usage before parsing; a complete v2 output is typed and reproducible',async()=>{
 const bad=new MockLanguageModelV4({modelId:'gpt-6-luna',doGenerate:{content:[{type:'text',text:'{"broken":'}],finishReason:{unified:'length',raw:'max_output_tokens'},usage:usage(8,0),warnings:[]}});let captured=false;
 await assert.rejects(()=>generateDiscoveryOutput('offline fixture',discoveryInstructions,'v2',()=>{captured=true;},bad));assert.equal(captured,true);assert.equal(bad.doGenerateCalls.length,1);
 const real=JSON.parse(readFileSync(report.modelRuns[0].paths.analysis,'utf8')).analysis,good=new MockLanguageModelV4({modelId:'gpt-6-luna',doGenerate:{content:[{type:'text',text:JSON.stringify(real)}],finishReason:{unified:'stop',raw:undefined},usage:usage(200,0),warnings:[],response:{id:'offline-complete',modelId:'gpt-6-luna',timestamp:new Date()}}});
 const result=await generateDiscoveryOutput('offline fixture',discoveryInstructions,'v2',()=>{},good);assert.equal((result.output as any).hypotheses.length,2);assert.equal(result.finishReason,'stop');
});
test('v1 commitments remain byte-reproducible and v2 request settings are bound to the plan',async()=>{
 const old=JSON.parse(readFileSync(report.modelRuns[0].paths.plan,'utf8')),v1=planDiscovery(graph,frames,[],control),v2=planDiscovery(graph,frames,[],control,frames,'v2');assert.deepEqual(v1.plan,old);assert.equal(v2.plan.maxOutputTokens,16000);assert.notEqual(v1.plan.planHash,v2.plan.planHash);
 const dir=mkdtempSync(join(tmpdir(),'mevy-output-recovery-'));try{
  const analysis=JSON.parse(readFileSync(report.modelRuns[0].paths.analysis,'utf8')).analysis;
  await runDiscovery(v2,join(dir,'lab-broken'),graph,frames,[],async(_p,_profile,capture)=>{capture?.({responseId:'offline-failure',modelId:'gpt-6-luna',inputTokens:100,outputTokens:16000,reasoningTokens:16000,finishReason:'length',rawFinishReason:'max_output_tokens',visibleCharacters:0});throw Object.assign(Error('synthetic exhaustion'),{name:'AI_NoOutputGeneratedError'});});
 }catch(e){assert.equal((e as Error).name,'AI_NoOutputGeneratedError');const attempts=readResearchAttempts(dir);assert.equal(attempts[0]!.outcome,'FAILED');assert.equal(attempts[0]!.failureCode,'OUTPUT_TOKEN_LIMIT');assert.equal(attempts[0]!.provider!.outputTokens,16000);const record=labRecord(report.campaign,'failure-fixture',graph,frames,[],[],control,attempts);assert.ok(validateLabRecord(record).report.attemptsPath);await assert.rejects(()=>runDiscovery(v2,join(dir,'lab-broken'),graph,frames,[],async()=>{throw Error('must not retry');}),/already started/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('the one repair verification shares original limits and cannot be reserved twice',()=>{
 const dir=mkdtempSync(join(tmpdir(),'mevy-repair-budget-')),s=new AutoStore(join(dir,'budget.sqlite'),report.campaign);try{const now=report.campaign.startsAt;s.reserveRepair(now,'new-repair-context',1,'0.100000000');assert.throws(()=>s.reserveRepair(now+1,'another-context',2,'0.100000000'),/claimed/);assert.equal(s.reservations().length,1);s.reserve(1,now+21600,'scheduled',3,'0.850000000');assert.throws(()=>s.reserveUpgrade(now+21600,'upgrade',4,'0.100000000'),/budget/);}finally{s.close();rmSync(dir,{recursive:true,force:true});}
});
