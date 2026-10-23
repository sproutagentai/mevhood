import { readFileSync } from 'node:fs';
import { validateLabRecord } from './frontier-publication.ts';
const at=process.argv.indexOf('--report');if(at<0||!process.argv[at+1])throw Error('Use --report evidence/lab-…-report.json');
const path=process.argv[at+1]!;if(!/^evidence\/lab-[a-z0-9-]+-report\.json$/.test(path))throw Error('Only a published evidence report path is accepted');
const report=JSON.parse(readFileSync(path,'utf8')),files:Record<string,string>={};
for(const p of [path,report.graphPath,...report.sources.map((s:any)=>s.path),...report.modelRuns.flatMap((r:any)=>Object.values(r.paths)),...(report.attemptsPath?[report.attemptsPath]:[])]){if(typeof p!=='string'||!/^evidence\/lab-[a-z0-9-]+\.json$/.test(p))throw Error('Invalid lab source reference');files[p]=readFileSync(p,'utf8');}
const stem=`evidence/lab-frontier-${report.campaign.id}-${report.search.scanToBlock}-`,id=path.slice(stem.length,-'-report.json'.length),result=validateLabRecord({format:'mevy-frontier-publication/v1',campaign:report.campaign,id,reportPath:path,reportHash:report.reportHash,files});
console.log(JSON.stringify({verified:true,reportHash:report.reportHash,observations:result.frames.length,strategies:report.trials.length,results:report.trials.map((r:any)=>({name:r.trial.hypothesis.name,status:r.result.status,paired:r.result.pairedObservations,deltaKnownGasQuoteWei:r.result.knownGasQuoteDeltaWei})),livePromotion:'DISABLED'},null,2));
