import { defineTool } from 'eve/tools';
import { z } from 'zod';
import { Store } from '../../src/store.ts';
import { researchReport } from '../../src/research.ts';
import { researchContext } from '../../src/research-context.ts';
import { digest } from '../../src/model.ts';
export default defineTool({description:'Read full-history totals and a page of original route quotes. Follow nextOffset to inspect earlier/later blocks. No trading or external writes.',inputSchema:z.object({experimentId:z.string().regex(/^[a-zA-Z0-9-]{1,64}$/),offset:z.number().int().min(0).optional(),limit:z.number().int().min(1).max(10).optional()}),
  execute({experimentId,offset=0,limit=5}){const s=new Store(process.env.MEVY_DB??'data/mevy.sqlite');try{
    const {experiment,report}=researchReport(s,experimentId),observations=s.observations(experimentId),body={experiment,report,observations};
    const context=researchContext({...body,bundleHash:digest(body)});
    if(offset>=observations.length)throw Error('Offset outside history');
    const page=context.observations.slice(offset,offset+limit),next=offset+page.length;
    return {...context,observations:page,coverage:{...context.coverage,sentObservations:page.length,sentQuotes:page.reduce((n,o)=>n+o.quotes.length,0),truncated:page.length!==observations.length},offset,nextOffset:next<observations.length?next:null,boundary:'Full totals; only this explicitly bounded page of original quotes is shown. Request more pages before claiming inspection of all rows.'};
  }finally{s.close();}}
});
