import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { z } from 'zod';

export function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return '{' + Object.entries(value).sort(([a], [b]) => a.localeCompare(b, 'en')).map(([k,v]) => JSON.stringify(k)+':'+canonical(v)).join(',') + '}';
}
export const digest = (v: unknown) => '0x'+createHash('sha256').update(canonical(v)).digest('hex');
export const uint = z.string().regex(/^(0|[1-9][0-9]*)$/);
export const hash = z.string().regex(/^0x[0-9a-f]{64}$/);
export const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
export const policySchema = z.object({
  name:z.string().min(1).max(48), sizeWei:uint.refine(v=>BigInt(v)>0n && BigInt(v)<=20_000_000_000_000_000n),
  minEdgeBps:z.number().int().min(1).max(500), gasSafetyBps:z.number().int().min(12000).max(30000)
}).strict();
export type Policy = z.infer<typeof policySchema>;
export const acceptanceSchema = z.object({
  minSeconds:z.number().int().min(604800), minObservations:z.number().int().min(1000),
  maxGapSeconds:z.number().int().positive().max(300), minImprovementWei:uint,
  maxDrawdownWei:uint, maxTradeLossWei:uint
}).strict();
export type Acceptance = z.infer<typeof acceptanceSchema>;
export const quoteSchema = z.object({
  route:z.string(), feeOut:z.number().int().positive(), feeBack:z.number().int().positive(),
  poolOut:address,poolBack:address, sizeWei:uint, amountOutWei:uint,
  gasUnits:uint, path:z.string().regex(/^0x[0-9a-f]+$/), error:z.string().nullable()
}).strict();
export const observationSchema = z.object({
  chainId:z.literal(4663), block:z.number().int().positive(), blockHash:hash,
  timestamp:z.number().int().positive(), collectedAt:z.number().int().positive(),
  provider:z.string().url(), factory:address, quoter:address, codeHashes:z.record(z.string(),hash),
  gasPriceWei:uint, extraGasWei:uint.nullable(), infrastructureWei:uint.nullable(),
  gasModel:z.literal('quoter-plus-overhead-v1'), quotes:z.array(quoteSchema).max(64),
  errors:z.array(z.string()).max(64)
}).strict();
export type Observation = z.infer<typeof observationSchema>;
export type Experiment = {
  version:1; id:string; createdAt:number; freezeBlock:number; freezeBlockHash:string;
  trainingThroughBlock:number; baseline:Policy; candidate:Policy; acceptance:Acceptance;
  engineHash:string; llmCostWei:string|null; llmCostNote:string; commitment:string;
};
export const engineFiles=['src/model.ts','src/engine.ts','src/store.ts','src/robinhood.ts'];
export function engineHash() { return digest(Object.fromEntries(engineFiles.map(p=>[p,readFileSync(new URL('../'+p,import.meta.url),'utf8')]))); }
export function verifyExperiment(e:Experiment) {
  policySchema.parse(e.baseline); policySchema.parse(e.candidate); acceptanceSchema.parse(e.acceptance);
  const {commitment,...body}=e;
  if (digest(body)!==commitment) throw Error('Experiment commitment mismatch');
  if (e.version!==1 || !Number.isSafeInteger(e.freezeBlock) || e.freezeBlock<1 || !Number.isSafeInteger(e.createdAt) || e.createdAt<1 || !Number.isSafeInteger(e.trainingThroughBlock) || e.trainingThroughBlock<0 || e.trainingThroughBlock>=e.freezeBlock) throw Error('Invalid training/freeze boundary');
  hash.parse(e.freezeBlockHash); hash.parse(e.engineHash);
  if (e.llmCostWei!==null) uint.parse(e.llmCostWei);
}
