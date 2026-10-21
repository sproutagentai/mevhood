import { defineTool } from 'eve/tools';
import { z } from 'zod';
import { Store } from '../../src/store.ts';
import { researchReport } from '../../src/research.ts';
export default defineTool({description:'Read a frozen paper experiment and its full evidence ledger. No trading or external writes.',inputSchema:z.object({experimentId:z.string().regex(/^[a-zA-Z0-9-]{1,64}$/)}),
  execute({experimentId}){const s=new Store(process.env.MEVY_DB??'data/mevy.sqlite');try{const {experiment,report}=researchReport(s,experimentId);return {experiment,report:{...report,ledger:report.ledger.slice(-20)},ledgerScope:'Most recent 20 rows; totals and data hash cover all observations.'};}finally{s.close();}}
});
