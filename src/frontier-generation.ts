import {generateText,Output} from 'ai';
import {openai} from 'eve/models/openai';
import {outputSchema} from './frontier-strategy.ts';
import type {Generation} from './llm-research.ts';
export const discoverySettings={v1:{maxOutputTokens:6000,reasoning:'medium' as const},v2:{maxOutputTokens:16000,reasoning:'low' as const}};
export type DiscoveryProfile=keyof typeof discoverySettings;
export type ProviderReceipt={responseId:string|null;modelId:string|null;inputTokens:number|null;outputTokens:number|null;reasoningTokens:number|null;finishReason:string;rawFinishReason:string|null;visibleCharacters:number};
export async function generateDiscoveryOutput(prompt:string,instructions:string,profile:DiscoveryProfile,capture:(r:ProviderReceipt)=>void=()=>{},model:any=openai('gpt-6-luna'),schema:any=outputSchema(JSON.parse(prompt))):Promise<Generation>{
 const settings=discoverySettings[profile];
 const r=await generateText({model,system:instructions,prompt,output:Output.object({schema}),...settings,maxRetries:0,timeout:180000,providerOptions:{openai:{store:false,serviceTier:'default'}},onEnd:e=>{
  // Persist only allowlisted diagnostics, before schema parsing or .output can throw.
  capture({responseId:e.response.id??null,modelId:e.response.modelId??null,inputTokens:e.totalUsage.inputTokens??null,outputTokens:e.totalUsage.outputTokens??null,reasoningTokens:e.totalUsage.outputTokenDetails.reasoningTokens??null,finishReason:e.finishReason,rawFinishReason:e.rawFinishReason??null,visibleCharacters:e.text.length});
 }});
 return {output:r.output,responseId:r.response.id,modelId:r.response.modelId,inputTokens:r.usage.inputTokens,outputTokens:r.usage.outputTokens,finishReason:r.finishReason,serviceTier:typeof r.providerMetadata?.openai?.serviceTier==='string'?r.providerMetadata.openai.serviceTier:null};
}
