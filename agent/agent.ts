import { defineAgent } from 'eve';
import { openai } from 'eve/models/openai';
import { researchModelId } from '../src/llm-config.ts';
export default defineAgent({
  model:openai(researchModelId),reasoning:'high',defaultTools:false,tool:false,
  limits:{maxInputTokensPerSession:12000,maxOutputTokensPerSession:1800,maxTokenCostUsdPerSession:0.10,sessionTimeoutMs:600000}
});
