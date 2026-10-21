import { digest, engineHash, observationSchema, verifyExperiment, type Experiment, type Observation, type Policy } from './model.ts';

export function decision(policy:Policy,o:Observation) {
  const quotes=o.quotes.filter(q=>q.error===null && q.sizeWei===policy.sizeWei && q.poolOut.toLowerCase()!==q.poolBack.toLowerCase());
  const rows=quotes.map(q=>{
    const gas=BigInt(q.gasUnits)*BigInt(o.gasPriceWei)+BigInt(o.extraGasWei??'0');
    const gross=BigInt(q.amountOutWei)-BigInt(q.sizeWei);
    const safety=(gas*BigInt(policy.gasSafetyBps)+9999n)/10000n;
    return {route:q.route,grossWei:gross.toString(),gasWei:gas.toString(),decisionGasBudgetWei:safety.toString(),netWei:(gross-gas).toString()};
  }).sort((a,b)=>BigInt(a.netWei)>BigInt(b.netWei)?-1:BigInt(a.netWei)<BigInt(b.netWei)?1:a.route.localeCompare(b.route));
  const best=rows[0];
  const threshold=(BigInt(policy.sizeWei)*BigInt(policy.minEdgeBps)+9999n)/10000n;
  const trade=!!best && BigInt(best.grossWei)-BigInt(best.decisionGasBudgetWei)>=threshold && o.errors.length===0 && o.extraGasWei!==null;
  return {trade, route:trade?best!.route:null, quote:best??null,
    paperTradeWei:trade?best!.netWei:'0', reason:trade?'quote-exceeds-threshold':!best?'no-valid-route':'no-eligible-edge'};
}
export function evaluate(e:Experiment, observations:Observation[],options:{checkEngine?:boolean}={}) {
  verifyExperiment(e);
  if(options.checkEngine!==false && e.engineHash!==engineHash()) throw Error('Evaluator differs from committed engine');
  const issues=new Set<string>();
  if(e.llmCostWei===null) issues.add('LLM_COST_UNKNOWN');
  let priorBlock=e.freezeBlock,priorTime=e.createdAt;
  const sorted=[...observations].sort((a,b)=>a.block-b.block);
  const ledger=sorted.map(o=>{
    observationSchema.parse(o);
    if(o.block<=priorBlock || o.block<=e.freezeBlock || o.timestamp<e.createdAt) throw Error('Overlapping, duplicate or pre-commit observation');
    if(o.timestamp<priorTime || o.collectedAt<o.timestamp || o.collectedAt-o.timestamp>120) issues.add('STALE_OR_INVALID_TIME');
    if(o.timestamp-priorTime>e.acceptance.maxGapSeconds) issues.add('SOURCE_GAP');
    priorBlock=o.block; priorTime=o.timestamp;
    if(o.errors.length || o.quotes.some(q=>q.error!==null)) issues.add('SOURCE_ERRORS');
    if(o.extraGasWei===null) issues.add('EXTRA_GAS_UNKNOWN');
    if(o.infrastructureWei===null) issues.add('INFRA_COST_UNKNOWN');
    for(const p of [e.baseline,e.candidate]) if(!o.quotes.some(q=>q.sizeWei===p.sizeWei && q.error===null)) issues.add('QUOTE_COVERAGE_MISSING');
    return {block:o.block,blockHash:o.blockHash,observationHash:digest(o),baseline:decision(e.baseline,o),candidate:decision(e.candidate,o),infrastructureWei:o.infrastructureWei};
  });
  const summarise=(side:'baseline'|'candidate')=>{
    let total=-BigInt(side==='candidate'?(e.llmCostWei??'0'):'0'),peak=0n,drawdown=-total;
    let trades=0,worst=0n;
    for(const row of ledger){const d=row[side]; const pnl=BigInt(d.paperTradeWei); if(d.trade)trades++; if(pnl<worst)worst=pnl;
      total+=pnl-BigInt(row.infrastructureWei??'0');if(total>peak)peak=total; if(peak-total>drawdown)drawdown=peak-total;}
    const complete=sorted.every(o=>o.infrastructureWei!==null&&o.extraGasWei!==null)&&(side==='baseline'||e.llmCostWei!==null);
    return {trades,paperNetWei:complete?total.toString():null,subtotalBeforeUnknownCostsWei:total.toString(),costsComplete:complete,maxDrawdownWei:drawdown.toString(),worstTradeWei:worst.toString()};
  };
  const baseline=summarise('baseline'),candidate=summarise('candidate');
  const duration=sorted.length?sorted.at(-1)!.timestamp-e.createdAt:0;
  if(sorted.length<e.acceptance.minObservations)issues.add('INSUFFICIENT_OBSERVATIONS');
  if(duration<e.acceptance.minSeconds)issues.add('INSUFFICIENT_FORWARD_TIME');
  if(!candidate.costsComplete||!baseline.costsComplete||BigInt(candidate.subtotalBeforeUnknownCostsWei)-BigInt(baseline.subtotalBeforeUnknownCostsWei)<BigInt(e.acceptance.minImprovementWei))issues.add('NO_COST_ADJUSTED_IMPROVEMENT');
  if(BigInt(candidate.maxDrawdownWei)>BigInt(e.acceptance.maxDrawdownWei))issues.add('DRAWDOWN_LIMIT');
  if(-BigInt(candidate.worstTradeWei)>BigInt(e.acceptance.maxTradeLossWei))issues.add('TRADE_LOSS_LIMIT');
  const body={version:1,kind:'paper-quote-comparison',experiment:e.commitment,dataHash:digest(sorted),observations:sorted.length,durationSeconds:duration,
    baseline,candidate,ledger,researchGate:issues.size?'HOLD':'ELIGIBLE_FOR_REVIEW',issues:[...issues].sort(),livePromotion:'DISABLED',
    limitations:['Quote estimates are not executed fills.','Private orderflow, competition, reverts and MEV leakage are not simulated.','Passing the research gate does not authorize trading.']};
  return {...body,resultHash:digest(body)};
}
