import { defineAgent } from 'eve';
export default defineAgent({
  model:'openai/gpt-6-luna-fast',reasoning:'high',defaultTools:false,tool:false,
  limits:{maxInputTokensPerSession:12000,maxOutputTokensPerSession:1800,maxTokenCostUsdPerSession:0.10,sessionTimeoutMs:600000}
});
