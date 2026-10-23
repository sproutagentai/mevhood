# Autonomous frontier search — version 1

Mevy now discovers additional Uniswap v3 pools and proposes experiments beyond a single fixed-size cycle. The original evaluator and old lab remain unchanged and reproducible. The research campaign still ends28October2026 at18:21:45UTC, with$1rolling24h/$7total request reservations. No trading is enabled.

## Source and coverage

A complete factory PoolCreated query covers the latest1,000,000blocks using the official public RPC. Each selected pool is independently checked against archive state: factory, token0/token1, fee, canonical getPool, active liquidity and code hash at one pinned block. A source snapshot contains all events and explicit exclusions. The bound is previous14pools plus at most24recent pools, prioritising assets occurring in multiple pool events or non-WETH pairs. A singleton pool is not evidence of an atomic cyclic opportunity. Failure means unknown, never zero liquidity. This is not all-pool or all-DEX coverage.

The actual23October snapshot has28liquid pools,20tokens,262distinct-pool cycles:20two-leg,106triangles,136four-leg. Four exact WETH sizes give1,048route/size cells.34routes involve tokens outside the former four-token universe. All labels are untrusted token metadata, not endorsements.

Discovery repeats daily in the background through the shared paced transport. A new graph activates only after current screens settle, with a separate immutable epoch database. Old graphs, source frames and failed tests remain available in the index. Earlier epoch hypotheses remain novelty memory, preventing threshold/name-only recycling.

## Distinct strategy families

- EXACT_EDGE: one route and exact size, subject to fixed edge and safety-gas rules.
- SIZE_CURVE: independently quote every declared size up to the frozen cap; select the highest known-gas net at that block. Missing one required size prevents entry. Never scale quotes.
- QUOTE_IMPROVEMENT: current exact-size output must improve by the frozen basis-point threshold versus the preceding consecutive valid quote and independently cover current safety gas/edge. First observation cannot signal; missing data resets state.

Every response must propose a non-static family and a route outside the former token universe when available. Schema references are restricted to supplied route IDs and actual training blocks. Arbitrary generated code, signing and live policy adoption are unavailable.

## New data and control

Every6hours a decision sees up to the latest80previously unseen frames and a deterministic128-cell novel menu; all supplied rows are included, the selection policy is explicit, and all other source frames remain published. It is a bounded research cohort, not a claim to have analysed the complete market. Current and earlier epoch hypotheses are retained as memory.

A hypothesis freezes strategy, exact evaluator files, graph, training cutoff and actual model response. Only blocks collected after its independently acknowledged GitHub publication enter its control comparison. Both versions see the same source rows; full profit is null while any costs are unknown. Ten rows can reject a hypothesis; the original seven-day/1,000-observation gate is unchanged. New23October experiments cannot complete seven days before the original28October stop. There is no automatic extension or trade promotion.

An owner-authorized, unique frontier verification request shares the original budget ledger. A failed paid request is never repeated. Normal slots remain six hours apart; publisher identity and model credentials remain isolated.

## Inspect and reproduce

The public website reads evidence/frontier-index.json from a pinned GitHub revision and verifies file hashes. Each report links original graph/events, exact quote frames, model context/response, public freeze and deterministic comparison. Clone that revision and run:

```sh
npm run frontier:verify -- --report evidence/lab-frontier-…-report.json
```

This verifies source integrity and decision arithmetic offline. It is separate from independently re-reading the chain and from fork execution. Historical60-swap receipts remain in execution-index.json; new quote screens are not new executed swap receipts.

## Observed launch

The genuine first response used189545input/1270outputtokens, estimated$0.0195895; provider invoice remains unknown. It proposed a wPONS four-leg size curve and a different wPONS four-leg exact-size test. Both reached10freshpairedrows after public freeze13f108b and were rejected without a qualifying signal; maximum gap248seconds. `evidence/frontier-launch-2026-10-23.json` links the response and comparisons. Independent archive recheck96049192 matched12control+6frontierquotes. The first failed recheck is retained; its exact differing quote was not captured. Daily rescan uptime is not yet observed.

```sh
npm run frontier:audit -- --report evidence/lab-frontier-mevy-auto-20261021-96024753-progress-96066325-report.json --block 96049192
```
