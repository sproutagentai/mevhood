import { digest } from './model.ts';
import { sourceFields, verifyBundle, type EvidenceBundle } from './source-audit.ts';

export function verifyHistorySource(bundle: EvidenceBundle, input: unknown) {
  const p = input as any;
  if (!p || p.format !== 'mevy-history-audit-package/v1') throw Error('History source package required');
  const { packageHash, ...body } = p;
  if (digest(body) !== packageHash) throw Error('Source package digest mismatch');
  const s = p.summary;
  const { receiptHash, ...summaryBody } = s;
  const quotes = bundle.observations.reduce((n, o) => n + o.quotes.length, 0);
  if (digest(summaryBody) !== receiptHash || !s.auditComplete || !s.sourceRequoted || s.bundleHash !== bundle.bundleHash || s.auditedObservations !== bundle.observations.length || s.totalObservations !== bundle.observations.length || s.auditedQuotes !== quotes || p.receipts.length !== bundle.observations.length || s.receiptHashes.length !== p.receipts.length) throw Error('Incomplete or mismatched source coverage');
  for (let i = 0; i < bundle.observations.length; i++) {
    const o = bundle.observations[i]!, r = p.receipts[i];
    const { receiptHash, ...receiptBody } = r;
    const check = r.checks?.[0];
    if (digest(receiptBody) !== receiptHash || s.receiptHashes[i] !== receiptHash || r.bundleHash !== bundle.bundleHash || r.sourceId !== s.sourceId || r.offset !== i || r.auditedObservations !== 1 || r.sourceAudit !== 'PASS' || r.checks.length !== 1 || check?.block !== o.block || check.blockHash !== o.blockHash || check.observationHash !== digest(o) || check.quotes !== o.quotes.length || check.sourceDigest !== digest(Object.fromEntries(sourceFields.map(f => [f, o[f]])))) throw Error('Source receipt does not match observation');
  }
  return { status: 'MATCHED_SAVED_SNAPSHOT', packageHash, checkedAt: s.checkedAt, source: s.source, observations: s.auditedObservations, quotes: s.auditedQuotes, boundary: 'Provider consistency; not signed consensus or executed fills.' };
}

export function researchContext(bundle: EvidenceBundle, sourcePackage?: unknown) {
  const report = verifyBundle(bundle);
  if (!bundle.observations.length) throw Error('No observations to analyse');
  const routes: { route: string; sizeWei: string; poolOut: string; poolBack: string; path: string; feeOut: number; feeBack: number }[] = [];
  const routeIds = new Map<string, number>();
  let quoteCount = 0, quoteErrors = 0, positiveGrossQuotes = 0, positiveAfterKnownGasQuotes = 0;
  const observations = bundle.observations.map(o => ({
    block: o.block, blockHash: o.blockHash, observationHash: digest(o), timestamp: o.timestamp,
    gasPriceWei: o.gasPriceWei, extraGasWei: o.extraGasWei, infrastructureWei: o.infrastructureWei, errors: o.errors,
    quotes: o.quotes.map(q => {
      const route = { route: q.route, sizeWei: q.sizeWei, poolOut: q.poolOut, poolBack: q.poolBack, path: q.path, feeOut: q.feeOut, feeBack: q.feeBack };
      const key = digest(route);
      let id = routeIds.get(key);
      if (id === undefined) { id = routes.length; routeIds.set(key, id); routes.push(route); }
      quoteCount++;
      if (q.error !== null) quoteErrors++;
      else {
        const gross = BigInt(q.amountOutWei) - BigInt(q.sizeWei);
        if (gross > 0n) positiveGrossQuotes++;
        if (gross - BigInt(q.gasUnits) * BigInt(o.gasPriceWei) - BigInt(o.extraGasWei ?? '0') > 0n) positiveAfterKnownGasQuotes++;
      }
      return [id, q.amountOutWei, q.gasUnits, q.error];
    })
  }));
  const { ledger: _ledger, ...totals } = report;
  return {
    format: 'mevy-research-context/v1', bundleHash: bundle.bundleHash, experiment: bundle.experiment,
    sourceVerification: sourcePackage === undefined ? { status: 'NOT_SUPPLIED', boundary: 'Offline integrity only; no archive verification claimed.' } : verifyHistorySource(bundle, sourcePackage),
    coverage: { observations: observations.length, quoteCount, quoteErrors, sentObservations: observations.length, sentQuotes: quoteCount, truncated: false },
    totals, counts: { positiveGrossQuotes, positiveAfterKnownGasQuotes, extraGasUnknownRows: bundle.observations.filter(o => o.extraGasWei === null).length, infrastructureUnknownRows: bundle.observations.filter(o => o.infrastructureWei === null).length },
    units: 'All amounts are integer WETH wei. GasUnits already includes the frozen reader overhead. Known-gas counts exclude unknown costs and are not profit.',
    quoteColumns: ['routeId', 'amountOutWei', 'gasUnits', 'error'], routes, observations,
    boundary: 'Every supplied quote is included. This is training evidence for proposals only. Preserve the original control and gate; a successor must freeze after all inspected blocks.'
  };
}
export type ResearchContext = ReturnType<typeof researchContext>;
