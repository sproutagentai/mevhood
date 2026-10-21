import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { digest } from '../src/model.ts';
import { researchContext, verifyHistorySource } from '../src/research-context.ts';
import { planResearch, validateAnalysis, runResearch, type Generation } from '../src/llm-research.ts';
import type { EvidenceBundle } from '../src/source-audit.ts';
import { Store } from '../src/store.ts';
import readExperiment from '../agent/tools/read_experiment.ts';

const bundle = JSON.parse(readFileSync('evidence/preliminary-vps-2026-10-21.json', 'utf8')) as EvidenceBundle;
const source = JSON.parse(readFileSync('evidence/history-source-audit-2026-10-21.json', 'utf8'));
const context = researchContext(bundle, source);
const noChange = { decision: 'NO_CHANGE', summary: 'The inspected quote sample does not support changing the frozen strategy.', findings: [{ observation: 'The supplied history has unknown extra gas and infrastructure expenses.', evidenceBlocks: [bundle.observations[0]!.block] }], proposal: null, nextTest: 'Collect fresh quotes under an unchanged control and reconcile all execution costs before a new comparison.', limitations: ['Quoted outputs are not actual executed fills.', 'The short history cannot satisfy the frozen forward gate.'] };
const generation = (output: unknown = noChange): Generation => ({ output, responseId: 'resp_test_only', modelId: 'gpt-6.1-sol', inputTokens: 100, outputTokens: 100, finishReason: 'stop', serviceTier: 'default' });
const copy = <T>(x: T): T => structuredClone(x);

test('published genuine OpenAI analysis binds the full reviewed snapshot, plan and original HOLD', () => {
  const receipt = JSON.parse(readFileSync('evidence/llm-analysis-2026-10-21.json', 'utf8'));
  const plan = JSON.parse(readFileSync('evidence/llm-plan-2026-10-21.json', 'utf8'));
  const prepared = planResearch(bundle, source, '1'); assert.deepEqual(prepared.plan, plan);
  const { analysisHash, ...body } = receipt; assert.equal(digest(body), analysisHash);
  assert.equal(receipt.contextHash, prepared.plan.contextHash); assert.equal(receipt.planHash, plan.planHash); assert.equal(receipt.bundleHash, bundle.bundleHash);
  assert.equal(validateAnalysis(receipt.analysis, prepared.context).decision, 'NO_CHANGE'); assert.equal(receipt.parentResearchGate, 'HOLD');
  assert.equal(receipt.usage.inputTokens, 14832); assert.equal(receipt.usage.outputTokens, 1039); assert.equal(receipt.actualInvoiceCostUsd, null);
  assert.equal(receipt.estimatedStandardCostUsd, '0.040054000'); assert.equal(receipt.livePromotion, 'DISABLED');
  assert(bundle.observations.every(o => o.quotes.every(q => BigInt(q.amountOutWei) < BigInt(q.sizeWei))));
});

test('LLM packet includes every actual quote and raw integer amount without sampling or gas double count', () => {
  assert.deepEqual(context.coverage, { observations: 40, quoteCount: 480, quoteErrors: 0, sentObservations: 40, sentQuotes: 480, truncated: false });
  for (let i = 0; i < bundle.observations.length; i++) for (let j = 0; j < bundle.observations[i]!.quotes.length; j++) {
    const q = bundle.observations[i]!.quotes[j]!, row = context.observations[i]!.quotes[j]!;
    assert.equal(row[1], q.amountOutWei); assert.equal(row[2], q.gasUnits);
    assert.equal(context.routes[row[0] as number]!.path, q.path);
  }
  assert.equal(context.totals.researchGate, 'HOLD'); assert.equal(context.counts.extraGasUnknownRows, 40);
  assert.equal(context.sourceVerification.status, 'MATCHED_SAVED_SNAPSHOT');
});
test('archive checks reject altered coverage and receipt data even after recomputing outer package hash', () => {
  const changed = copy(source); changed.receipts[0].checks[0].observationHash = '0x' + '0'.repeat(64);
  const { packageHash: _, ...body } = changed; changed.packageHash = digest(body);
  assert.throws(() => verifyHistorySource(bundle, changed), /receipt/);
  assert.throws(() => researchContext({ ...bundle, bundleHash: '0x' + '1'.repeat(64) }, source), /mismatch/);
  const noAudit = researchContext(bundle); assert.equal(noAudit.sourceVerification.status, 'NOT_SUPPLIED');
});
test('preflight rejects insufficient budgets and commits exact source/instructions with no paid call', () => {
  const p = planResearch(bundle, source, '1'); assert.ok(Number(p.plan.reservedUsd) < 1); assert.equal(p.plan.observations, 40); assert.equal(p.plan.quotes, 480);
  assert.equal(p.plan.contextHash, digest(p.context)); assert.throws(() => planResearch(bundle, source, '0.001'), /exceeds approved/);
  for (const value of ['-1', 'NaN', '1e3', '0']) assert.throws(() => planResearch(bundle, source, value));
});
test('interactive reader can inspect the first and final quote pages, with explicit partial coverage', async () => {
  const root = mkdtempSync(join(tmpdir(), 'mevy-llm-pages-')), previous = process.env.MEVY_DB;
  process.env.MEVY_DB = join(root, 'ledger.sqlite');
  try {
    const store = new Store(process.env.MEVY_DB); store.freeze(bundle.experiment); for (const o of bundle.observations) store.add(bundle.experiment.id, o); store.close();
    const first = await readExperiment.execute!({ experimentId: bundle.experiment.id, offset: 0, limit: 2 }, undefined as never);
    const last = await readExperiment.execute!({ experimentId: bundle.experiment.id, offset: 38, limit: 5 }, undefined as never);
    if (!('observations' in first) || !('observations' in last)) throw Error('Expected a complete tool result, not an event stream');
    assert.equal(first.observations[0]!.block, bundle.observations[0]!.block); assert.equal(first.nextOffset, 2);
    assert.equal(first.coverage.sentQuotes, 24); assert.equal(first.coverage.quoteCount, 480); assert.equal(first.coverage.truncated, true);
    assert.equal(last.observations.at(-1)!.block, bundle.observations.at(-1)!.block); assert.equal(last.nextOffset, null);
  } finally { if (previous === undefined) delete process.env.MEVY_DB; else process.env.MEVY_DB = previous; rmSync(root, { recursive: true, force: true }); }
});
test('analysis rejects fabricated citations, forced no-change proposals, rename-only and multi-field candidates', () => {
  assert.equal(validateAnalysis(noChange, context).decision, 'NO_CHANGE');
  const p = { experimentId: bundle.experiment.id, candidate: { ...bundle.experiment.candidate, name: 'mevy-test-edge', minEdgeBps: 40 }, rationale: 'Test whether a stricter threshold rejects weaker observed signals.', failureHypothesis: 'Signals close to the floor may fail after full execution costs.', evidenceBlocks: [bundle.observations[0]!.block] };
  const draft = { ...noChange, decision: 'PROPOSE_TEST', proposal: p };
  assert.equal(validateAnalysis(draft, context).proposal?.candidate.minEdgeBps, 40);
  assert.throws(() => validateAnalysis({ ...draft, findings: [{ observation: noChange.findings[0]!.observation, evidenceBlocks: [1] }] }, context), /Invented/);
  assert.throws(() => validateAnalysis({ ...draft, decision: 'NO_CHANGE' }, context), /NO_CHANGE/);
  assert.throws(() => validateAnalysis({ ...draft, proposal: { ...p, candidate: { ...p.candidate, minEdgeBps: bundle.experiment.candidate.minEdgeBps } } }, context), /exactly one/);
  assert.throws(() => validateAnalysis({ ...draft, proposal: { ...p, candidate: { ...p.candidate, gasSafetyBps: 22000 } } }, context), /exactly one/);
});
test('one-shot saves an unapproved receipt with usage, original HOLD and immutable run directory', async () => {
  const root = mkdtempSync(join(tmpdir(), 'mevy-llm-')); const out = join(root, 'run'); let calls = 0;
  try {
    const receipt = await runResearch(planResearch(bundle, source, '1'), out, async () => { calls++; return generation(); });
    assert.equal(calls, 1); assert.equal(receipt.state, 'AWAITING_HUMAN_REVIEW'); assert.equal(receipt.parentResearchGate, 'HOLD');
    assert.equal(receipt.actualInvoiceCostUsd, null); assert.equal(receipt.trainingThroughBlock, bundle.observations.at(-1)!.block);
    const { analysisHash, ...body } = receipt; assert.equal(digest(body), analysisHash);
    await assert.rejects(runResearch(planResearch(bundle, source, '1'), out, async () => { calls++; return generation(); }), /repeated paid/); assert.equal(calls, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('provider failures retain unknown cost and never copy a secret-bearing error or auto-retry', async () => {
  const root = mkdtempSync(join(tmpdir(), 'mevy-llm-fail-')); const out = join(root, 'run'); let calls = 0;
  try {
    await assert.rejects(runResearch(planResearch(bundle, source, '1'), out, async () => { calls++; throw Object.assign(Error('credential-secret-must-not-be-saved'), { statusCode: 401 }); }), /No automatic retry/);
    assert.equal(calls, 1); const text = readFileSync(join(out, 'failure.json'), 'utf8'); assert.ok(!text.includes('credential-secret')); assert.match(text, /UNKNOWN_AFTER_REQUEST_STARTED/); assert.equal(existsSync(join(out, 'analysis.json')), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('invalid/incomplete model results are retained for inspection but cannot become reviewed analysis', async () => {
  const root = mkdtempSync(join(tmpdir(), 'mevy-llm-incomplete-'));
  try {
    const out = join(root, 'run'); await assert.rejects(runResearch(planResearch(bundle, source, '1'), out, async () => ({ ...generation(), finishReason: 'length' })), /failed/);
    assert.equal(existsSync(join(out, 'provider-result.json')), true); assert.equal(existsSync(join(out, 'analysis.json')), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('actual CLI/AI SDK direct OpenAI wiring sends one bounded Responses request with no real network', () => {
  const root = mkdtempSync(join(tmpdir(), 'mevy-llm-wire-'));
  try {
    const preload = join(root, 'no-network.mjs');
    writeFileSync(preload, `import assert from 'node:assert/strict'; let calls=0; globalThis.fetch=async(input,init)=>{const url=typeof input==='string'?input:input.url;assert.equal(url,'https://api.openai.com/v1/responses');assert.equal(++calls,1);const b=JSON.parse(init.body);assert.equal(b.model,'gpt-6.1-sol');assert.equal(b.store,false);assert.equal(b.service_tier,'default');assert.equal(b.max_output_tokens,12000);assert(!b.tools?.length);assert(JSON.stringify(b).includes('480'));return new Response(JSON.stringify({id:'resp_test_only',object:'response',created_at:1792591200,status:'completed',model:'gpt-6.1-sol',service_tier:'default',output:[{id:'msg_test',type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:${JSON.stringify(JSON.stringify(noChange))},annotations:[]}]}],usage:{input_tokens:100,output_tokens:100,total_tokens:200}}),{headers:{'content-type':'application/json','x-request-id':'req_test_only'}});};`);
    const r = spawnSync(process.execPath, ['--import', 'tsx', '--import', preload, 'src/llm-cli.ts', '--file', 'evidence/preliminary-vps-2026-10-21.json', '--source-audit', 'evidence/history-source-audit-2026-10-21.json', '--budget-usd', '1', '--output', join(root, 'run'), '--execute'], { encoding: 'utf8', timeout: 15000, env: { ...process.env, OPENAI_API_KEY: 'test-only-not-a-real-key' } });
    assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /AWAITING_HUMAN_REVIEW/); assert.ok(!r.stdout.includes('test-only-not-a-real-key'));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
