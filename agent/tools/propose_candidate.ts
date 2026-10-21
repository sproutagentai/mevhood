import { defineTool } from 'eve/tools';
import { always } from 'eve/tools/approval';
import { Store } from '../../src/store.ts';
import { proposalSchema,submitProposal } from '../../src/research.ts';
export default defineTool({description:'Save a bounded candidate policy for human review. Does not edit the baseline, promote a strategy, deploy, or trade. At most three proposals per experiment.',inputSchema:proposalSchema,approval:always(),
  execute(input,ctx){const s=new Store(process.env.MEVY_DB??'data/mevy.sqlite');try{return submitProposal(s,input,{sessionId:ctx.session.id,model:'openai/gpt-6-luna-fast'});}finally{s.close();}}
});
