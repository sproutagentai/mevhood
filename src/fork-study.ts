import {readFileSync} from 'node:fs';
import {digest,canonical} from './model.ts';
import {decision} from './engine.ts';
import {verifyGraph,verifyFrame} from './lab-source.ts';
export function verifyForkStudy(report:any,read:(p:string)=>any){
 const {reportHash,...body}=report;if(report.format!=='mevy-fork-size-study/v1'||digest(body)!==reportHash||report.localForkOnly!==true||report.livePromotion!=='DISABLED'||report.completeNetWei!==null)throw Error('Invalid historical study commitment');
 const plan=read(report.planPath);if(digest(plan)!==report.planHash||plan.routes.length!==6||plan.sizesWei.length!==10||new Set(plan.sizesWei).size!==10||report.routes.length!==6||new Set(report.routes.map((x:any)=>x.block+':'+x.routeId)).size!==6)throw Error('Invalid frozen size plan');
 if(!report.attemptsPath||read(report.attemptsPath).localForkOnly!==true)throw Error('Missing preliminary attempt diagnostics');
 const source=read(plan.sourceReport),graph=verifyGraph(read(plan.graphPath)),all:any[]=[];let controlSelections=0;
 const selectedCells=new Set(plan.routes.map((r:any)=>r.block+':'+r.route.id+':'+r.quote.sizeWei)),actualPositive=new Set<string>();
 for(const item of source.sources){const f=verifyFrame(read(item.path),graph);if(f.frameHash!==item.frameHash)throw Error('Original study source changed');for(const q of f.quotes)if(q.error===null&&BigInt(q.amountOutWei)>BigInt(q.sizeWei))actualPositive.add(f.control.block+':'+q.routeId+':'+q.sizeWei);}
 if(canonical([...actualPositive].sort())!==canonical([...selectedCells].sort()))throw Error('Selected windows do not match every original positive quote');
 for(const ref of report.routes){
  const r=read(ref.path),{routeHash,...rowBody}=r;if(digest(rowBody)!==routeHash||routeHash!==ref.routeHash||r.localForkOnly!==true||r.probeSource!=='contracts/research/RouteProbe.sol'||r.probeSourceHash!==digest(readFileSync(new URL('../contracts/research/RouteProbe.sol',import.meta.url),'utf8')))throw Error('Fork route commitment mismatch');
  const selected=plan.routes.find((x:any)=>x.block===r.block&&x.route.id===r.routeId);if(!selected||r.rows.length!==10||new Set(r.rows.map((x:any)=>x.sizeWei)).size!==10||r.blockHash!==selected.blockHash||r.baseFeeWei!==selected.baseFeeWei||canonical(selected.route)!==canonical(graph.routes.find((x:any)=>x.id===r.routeId)))throw Error('Fork route identity/coverage mismatch');
  const frame=read(selected.sourcePath);if(frame.frameHash!==selected.frameHash||frame.control.blockHash!==r.blockHash||!source.sources.some((x:any)=>x.path===selected.sourcePath&&x.frameHash===frame.frameHash)||!frame.quotes.some((q:any)=>canonical(q)===canonical(selected.quote))||BigInt(selected.quote.amountOutWei)<=BigInt(selected.quote.sizeWei))throw Error('Missing original positive quote');
  const baseline=decision(source.control.baseline,frame.control);if(canonical(baseline)!==canonical(r.control.decision)||r.control.commitment!==source.control.commitment)throw Error('Frozen control comparison changed');if(baseline.trade)controlSelections++;
  for(const row of r.rows){
   if(!plan.sizesWei.includes(row.sizeWei)||!['success','reverted'].includes(row.status))throw Error('Incomplete executed size grid');
   const before=BigInt(row.beforeBalanceWei),after=BigInt(row.afterBalanceWei),amount=BigInt(row.sizeWei),gas=BigInt(row.executionGasUnits)*BigInt(row.effectiveGasPriceWei),receipt=row.receipt;
   if(BigInt(row.actualAmountOutWei)!==after+amount-before||BigInt(row.grossDeltaWei)!==after-before||BigInt(row.executionGasWei)!==gas||BigInt(row.afterExecutionGasWei)!==after-before-gas||receipt.status!==row.status||receipt.gasUsed!==row.executionGasUnits||receipt.effectiveGasPrice!==row.effectiveGasPriceWei||row.effectiveGasPriceWei!==r.baseFeeWei||receipt.to.toLowerCase()!==r.probeDeployment.contractAddress.toLowerCase()||BigInt(receipt.blockNumber)<=BigInt(r.block))throw Error('Fork balance/receipt arithmetic mismatch');
   if(row.status==='success'&&row.actualAmountOutWei!==row.archiveAmountOutWei||row.status==='reverted'&&after!==before)throw Error('Historical quote/execution mismatch');
   if(row.sizeWei===selected.quote.sizeWei&&row.archiveAmountOutWei!==selected.quote.amountOutWei)throw Error('Original archived quote did not reproduce');all.push(row);
  }
 }
 const success=all.filter(r=>r.status==='success'),positive=success.filter(r=>BigInt(r.afterExecutionGasWei)>0n).length;
 if(report.replayPath){const replay=read(report.replayPath),{replayHash,...receipt}=replay,fresh=read(replay.rawPath).result,old=read(report.routes.find((r:any)=>r.block===replay.block).path);if(digest(receipt)!==replayHash||digest(fresh)!==replay.newRawHash||old.routeHash!==replay.routeHash||fresh.rows.length!==10)throw Error('Fork recheck commitment mismatch');for(const row of old.rows){const again=fresh.rows.find((r:any)=>r.sizeWei===row.sizeWei);for(const k of ['status','actualAmountOutWei','archiveAmountOutWei','beforeBalanceWei','afterBalanceWei','executionGasUnits','effectiveGasPriceWei','afterExecutionGasWei'])if(again?.[k]!==row[k])throw Error('Independent fork recheck differs');}}
 if(report.summary.executions!==all.length||report.summary.successful!==success.length||report.summary.reverted!==all.length-success.length||report.summary.positiveAfterExecutionGas!==positive||report.summary.controlSelections!==controlSelections)throw Error('Study totals mismatch');
 return {verified:true,routes:report.routes.length,executions:all.length,successful:success.length,reverted:all.length-success.length,positiveAfterExecutionGas:positive,controlSelections,completeNetWei:null,livePromotion:'DISABLED'};
}
if(process.argv[1]?.endsWith('/fork-study.ts')){const p=process.argv[process.argv.indexOf('--report')+1];if(!p||!/^evidence\/fork-size-study-[a-z0-9-]+\.json$/.test(p))throw Error('Use --report evidence/fork-size-study-YYYY-MM-DD.json');const read=(p:string)=>{if(!/^evidence\/[a-z0-9-]+\.json$/.test(p))throw Error('Invalid study source path');return JSON.parse(readFileSync(p,'utf8'));};console.log(JSON.stringify(verifyForkStudy(read(p),read),null,2));}
