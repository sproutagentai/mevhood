import {existsSync,readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {z} from 'zod';
export const attemptSchema=z.object({id:z.string().regex(/^[a-z0-9-]{1,70}$/),startedAt:z.string().datetime(),planHash:z.string().regex(/^0x[a-f0-9]{64}$/),contextHash:z.string().regex(/^0x[a-f0-9]{64}$/),profile:z.enum(['v1','v2']),maxOutputTokens:z.number().int().positive(),reasoning:z.enum(['medium','low']),reservedUsd:z.string().regex(/^\d+\.\d{9}$/),outcome:z.enum(['SUCCEEDED','FAILED','INCOMPLETE']),failureCode:z.enum(['LEGACY_NO_STRUCTURED_OUTPUT','OUTPUT_TOKEN_LIMIT','NO_STRUCTURED_OUTPUT','INVALID_STRUCTURED_OUTPUT','PROVIDER_OR_VALIDATION_ERROR']).nullable(),provider:z.object({responseId:z.string().max(300).nullable(),modelId:z.string().max(100).nullable(),inputTokens:z.number().int().nonnegative().nullable(),outputTokens:z.number().int().nonnegative().nullable(),reasoningTokens:z.number().int().nonnegative().nullable(),finishReason:z.string().max(40),rawFinishReason:z.string().max(100).nullable(),visibleCharacters:z.number().int().nonnegative()}).strict().nullable(),analysisHash:z.string().regex(/^0x[a-f0-9]{64}$/).nullable(),automaticRetry:z.literal(false)}).strict();
export const attemptsSchema=z.array(attemptSchema).max(64);
export type ResearchAttempt=z.infer<typeof attemptSchema>;
export function readResearchAttempts(root:string):ResearchAttempt[]{
 if(!existsSync(root))return [];
 return readdirSync(root).filter(n=>/^lab-[a-z0-9-]{1,70}$/.test(n)).flatMap(n=>{
  const dir=join(root,n),read=(name:string)=>existsSync(join(dir,name))?JSON.parse(readFileSync(join(dir,name),'utf8')):null,plan=read('plan.json'),start=read('request-started.json');if(!plan||!start)return [];
  const failed=read('failure.json'),analysis=read('analysis.json'),metadata=read('provider-metadata.json');
  // The legacy runner did not retain response diagnostics. Do not infer a token-limit cause.
  return [attemptSchema.parse({id:n.slice(4),startedAt:start.startedAt,planHash:plan.planHash,contextHash:plan.contextHash,profile:(plan.format==='mevy-frontier-plan/v2'||plan.format==='mevy-learning-plan/v1')?'v2':'v1',maxOutputTokens:plan.maxOutputTokens,reasoning:plan.reasoning??'medium',reservedUsd:plan.reservedUsd,outcome:analysis?'SUCCEEDED':failed?'FAILED':'INCOMPLETE',failureCode:failed?(failed.code??'LEGACY_NO_STRUCTURED_OUTPUT'):null,provider:metadata,analysisHash:analysis?.analysisHash??null,automaticRetry:false})];
 }).sort((a,b)=>a.startedAt.localeCompare(b.startedAt));
}
