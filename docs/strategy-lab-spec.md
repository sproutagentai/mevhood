# Strategy discovery — 22 October 2026

The old scheduled researcher inspected new windows, but only one WETH/USDG route family and three policy fields. A supported `NO_CHANGE` was correct within that restriction. It did not implement strategy discovery.

## Acceptance criteria recorded before implementation

1. Discover actual verified pools and quote new two/three-pool WETH cycles and sizes. Retain failed reads and the complete bounded search universe; never invent a route or scale an old quote to an unquoted size.
2. The LLM proposes novel, typed hypotheses with cited training blocks, a failure condition and an explicit test. It receives prior rejected/tested strategies. A zero-trade control cannot be beaten merely by relabelling an identical policy.
3. Freeze each paper hypothesis before its forward observations, acknowledge its public source publication, and evaluate the original control on the same subsequent blocks. Training rows cannot count as forward results. Missing coverage/costs, short duration and failed hypotheses stay visible; the seven-day gate and live execution remain unchanged.
4. Persist the search, proposals, trial state and budget through restart. Use the existing campaign expiry, shared rolling $1/day and $7 total reservations, no paid retry after an unknown outcome, and the dedicated repository publisher.
5. Show actual search/trials and their original quote/model/code evidence on the accepted website. Verify real source→model→trial→GitHub→website behavior, tests and mobile rendering. Do not describe future seven-day results or profitability as achieved.

## Decisions

- Add a separate versioned lab evaluator and store. Original committed engine, policies, observations and reports remain byte-identical.
- Use a bounded DSL: verified WETH cycles through USDG/PONS/CASHCAT, quoted sizes up to 0.02 WETH, edge/gas/persistence conditions. No arbitrary model-written code, signing or automatic live promotion.
- Trial signals show quote economics after known gas. Complete P&L is null until extra gas, infrastructure and model invoices are reconciled. Such signals are not trades or fills.
- The campaign's original absolute end remains; a new seven-day forward test cannot finish inside the remaining campaign. Publish partial results and HOLD, without extending consent or weakening the gate.

## Verification

Pending implementation and actual integration. Source availability, novelty, leakage, retries, restart, budget and publication are acceptance checks, not claims established by this document.
