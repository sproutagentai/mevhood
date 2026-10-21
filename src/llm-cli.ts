import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { generateText, Output } from 'ai';
import { openai } from 'eve/models/openai';
import { analysisSchema, planResearch, researchInstructions, runResearch } from './llm-research.ts';
import { researchModelId, researchMaxOutputTokens } from './llm-config.ts';

const { values: v } = parseArgs({ options: { file: { type: 'string' }, 'source-audit': { type: 'string' }, output: { type: 'string' }, 'budget-usd': { type: 'string' }, execute: { type: 'boolean', default: false } } });
async function main() {
  if (!v.file || !v['source-audit'] || !v['budget-usd']) throw Error('--file BUNDLE --source-audit PACKAGE --budget-usd APPROVED_AMOUNT required');
  const prepared = planResearch(JSON.parse(readFileSync(v.file, 'utf8')), JSON.parse(readFileSync(v['source-audit'], 'utf8')), v['budget-usd']);
  console.log(JSON.stringify({ ...prepared.plan, executionRequested: v.execute }));
  if (!v.execute) return;
  if (!v.output) throw Error('--output NEW_PRIVATE_DIRECTORY required for execution');
  if (!process.env.OPENAI_API_KEY?.trim()) throw Error('OPENAI_API_KEY missing; no model request sent');
  const result = await runResearch(prepared, v.output, async prompt => {
    const r = await generateText({ model: openai(researchModelId), system: researchInstructions, prompt, output: Output.object({ schema: analysisSchema }), reasoning: 'medium', maxOutputTokens: researchMaxOutputTokens, maxRetries: 0, timeout: 180000, providerOptions: { openai: { store: false, serviceTier: 'default' } } });
    return { output: r.output, responseId: r.response.id, modelId: r.response.modelId, inputTokens: r.usage.inputTokens, outputTokens: r.usage.outputTokens, finishReason: r.finishReason, serviceTier: typeof r.providerMetadata?.openai?.serviceTier === 'string' ? r.providerMetadata.openai.serviceTier : null };
  });
  console.log(JSON.stringify({ output: v.output + '/analysis.json', analysisHash: result.analysisHash, decision: result.analysis.decision, responseId: result.responseId, estimatedStandardCostUsd: result.estimatedStandardCostUsd, actualInvoiceCostUsd: result.actualInvoiceCostUsd, state: result.state }));
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'LLM command failed'); process.exitCode = 1; });
