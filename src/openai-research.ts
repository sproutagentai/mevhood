import { generateText, Output } from 'ai';
import { openai } from 'eve/models/openai';
import { analysisSchema,researchInstructions,type Generation,type ResearchModel } from './llm-research.ts';
import { researchMaxOutputTokens } from './llm-config.ts';
export async function generateResearch(model:ResearchModel,prompt:string):Promise<Generation>{
 const r=await generateText({model:openai(model),system:researchInstructions,prompt,output:Output.object({schema:analysisSchema}),reasoning:'medium',maxOutputTokens:researchMaxOutputTokens,maxRetries:0,timeout:180000,providerOptions:{openai:{store:false,serviceTier:'default'}}});
 return {output:r.output,responseId:r.response.id,modelId:r.response.modelId,inputTokens:r.usage.inputTokens,outputTokens:r.usage.outputTokens,finishReason:r.finishReason,serviceTier:typeof r.providerMetadata?.openai?.serviceTier==='string'?r.providerMetadata.openai.serviceTier:null};
}
