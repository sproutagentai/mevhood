# Verification record — 2026-10-21

## Actual source check

Robinhood Chain 4663, block **94,179,906**, timestamp **2026-10-21 09:31:41 UTC**. The public reader verified deployed bytecode and the WETH/USDG pool identities, then obtained **12** complete two-pool quotes at that block. The best output for an input of 1,000,000,000,000,000 wei was **999,557,523,935,861 wei**, a loss before gas. Neither policy traded in the model.

The exported experiment was frozen before that observation. Its forward span is **43 seconds**, with **one observation**. Extra gas and infrastructure costs are unknown. The report is **HOLD** and both complete net P&L values are null. This is an adapter/replay check, not a strategy validation.

The full bundle was replayed offline, then the stored block was independently re-read and all route outputs, code hashes, pinned gas price and source fields were compared. Both passed.

Bundle digest:

```text
0xd79b76a0485359506fb3d61333545652be61cf4059ffbb342f0c0a5b3c6e09b0
```

## Code and state checks

`npm run typecheck` passes. `npm test` covers commitments, restart/idempotency, table/journal consistency, tampering, duplicate/pre-commit data, source gaps, stale reads, unknown costs, common gas accounting, rejected routes, bounded proposals, full training cutoff, sufficient synthetic forward evidence and disabled automatic promotion. Synthetic positive cases are test fixtures, not live evidence.

`npm run build:agent` builds successfully. `eve info --json` reports ready, zero discovery errors/warnings, exactly **read_experiment** and **propose_candidate**, zero subagents and zero schedules. No model request or paid credential was used. The compile-only build skips sandbox prewarming and does not establish a deployable/authenticated hosted service.

`forge test -vv` passes **10 local tests**, including **256 fuzz cases** for the balance-gain invariant. Authorization, ordering, duplicate reports, sample gate, nonce replay, deadline, route identity, size/profit floor, actual balance enforcement and allowance reset are covered. These checks are not an independent contract audit.

`FOUNDRY_PROFILE=fork forge test -vvv` passes **one integration test** at block **94,175,060**. It wraps native ETH using the actual WETH contract, funds a locally deployed executor on the fork, calls the real SwapRouter02 and verifies a losing round trip reverts without changing inventory or consuming a nonce. No transaction was sent to the public network. Fork success for this path does not prove every pool/router/token behavior is safe.

## Still unverified

- A seven-day forward comparison and useful net improvement.
- Provider invoice reconciliation and a useful approved candidate cycle.
- A complete seven-day continuous record and future restart monitoring.
- An onchain commitment, public contract deployment, independent security review or a signed funded canary.
- Any integration with the old private MEVHOOD searcher, token, holder payouts or vault.

CI status belongs to its actual Git commit. Inspect the latest workflow result rather than treating this dated local record as proof that every future change passed.

## Completion checks — 2026-10-21

The extended CLI imports the real bundle idempotently, binds exact reviewed proposals to successor experiments, shares the researcher's configured database, and prepares unsigned creation/registry transactions. **28 state/economic/CLI/lineage/ABI tests**, type checking and the eve build pass. The old evaluator files and integration bundle are unchanged; offline replay still returns the same digest and HOLD.

Both bundled deployment artifacts match locally compiled ABI/creation bytecode and their Solidity source digests. CI rebuilds them independently. Ten local contract tests, including256 fuzz cases, pass. No public deployment or real signing is claimed by these tests.

The RPC currently refuses historical state for the original94,175,060 fork and94,179,906 source-audit block. These new attempts failed visibly; they do not overwrite the earlier dated successful checks or count as successful re-verification. An archive-capable provider is needed to repeat those old state reads.

A separate actual fork check passes at **94,254,082** with the same real WETH/router loss-rollback test:

```sh
FOUNDRY_PROFILE=fork forge test --rpc-url https://rpc.mainnet.chain.robinhood.com --fork-block-number 94254082 -vvv
```

A fresh public source read at that same pinned block (**2026-10-21 11:39:39 UTC**) obtained12 successful two-pool quotes, zero source errors. Best output for1,000,000,000,000,000 wei was **999,716,082,448,806 wei**, still below input before gas. This read verifies current connectivity; it is not a new forward performance experiment. Historical-state availability can change.

At that preparation checkpoint, live provider generation, continuous collection and deployment had not been launched. Later dated records below supersede those integration blockers; invoices, profit improvement and funded execution remain unverified.

## Archive connection — 2026-10-21

Historical reads now use the keyless Blockmachine archive endpoint documented in the [provider's Robinhood guide](https://blockmachine.io/docs/robinhood-rpc). The previously failing original integration block **94,179,906** was re-read successfully from both the operator machine and VPS. All12 route outputs and returned gas values, block identity, deployed code hashes and pool identities matched the unchanged original bundle. The detailed [VPS source receipt](../evidence/source-audit-2026-10-21.json) records the actual check at **13:37:33 UTC**. It supersedes the historical-RPC blocker above for this endpoint, not for every provider.

The audit layer passes **36 tests**, type checking and agent compilation locally; the same 36 tests and type checking pass on the VPS. The 10 local contract tests and original offline replay still pass. Frozen model, evaluator, storage and Robinhood reader files remain byte-identical to the original release. New tests cover changed source fields, tampered bundles/receipts, partial coverage, credential-URL redaction, request spacing and restart without network access for already checked blocks.

The preliminary VPS reader originally stopped at **13:05:24 UTC** on a main-RPC quota error, after 40 saved observations. Collection resumed through the verified archive endpoint under the original absolute deadline, **22 October 2026 12:24:36 UTC**. Complete new snapshots contain12 quotes and zero quote errors. The source outage remains a data gap; records were neither synthesized nor backfilled. This is read-only collection with no paid model, signing or trading. Archive consistency is separate from the unchanged research verdict **HOLD**.

The complete published preliminary snapshot was re-quoted at **14:07:54 UTC**: **40/40 observations and 480/480 route quotes matched**, spanning blocks **94,280,091–94,303,272**. The [original 40-row bundle](../evidence/preliminary-vps-2026-10-21.json) retains digest `0x1eaca2af51da7b19be6fdca68f1ff913b3c48e9d20cd371a9e8050bafa87c8a2`; the [archive receipt package](../evidence/history-source-audit-2026-10-21.json) contains the complete summary and 40 individual source receipts. Their hashes, source identities and original observation/source digests were checked before publication. This covers that fixed pre-outage snapshot, not observations collected later or a completed 24-hour run. Empty histories now fail before network access, also covered by the CLI test.

## First genuine OpenAI analysis — 2026-10-21

The direct OpenAI model endpoint accepted the operator credential and confirmed access to `gpt-6.1-sol`. One actual Responses API request then analysed the full archive-checked 40-row/480-quote snapshot, with no tools or automatic client retry. The response completed at **15:18:21 UTC** and returned **NO_CHANGE**, with no candidate policy. Its [unaltered receipt](../evidence/llm-analysis-2026-10-21.json) includes the response ID, exact model, usage, data/context/plan digests and original HOLD verdict. The [actual request plan](../evidence/llm-plan-2026-10-21.json) is reproducible from the committed source, bundle and source receipts without a model call.

The model's numerical findings were recomputed independently: all 480 outputs are below the 1,000,000,000,000,000 wei input. The best output is 999,825,874,745,286 wei at block 94,284,606, a gross shortfall of 174,125,254,714 wei (about 1.7413 bps). Its 342,072 gas units at 20,566,000 wei/unit cost 7,035,052,752,000 wei in the frozen model; output minus input and known gas is −7,209,178,006,714 wei before unknown expenses. Both policies made zero paper trades. The 2377-second sample still fails the unchanged forward gate.

Returned usage is **14,832 input and 1,039 output tokens**, standard service tier. At the reviewed $2/$10 per million input/output token rates, the conservative uncached estimate is **$0.040054**. `actualInvoiceCostUsd` remains null; this is a token-based estimate, not an independently reconciled provider invoice. The application reserved about $0.49 before the one request. No recurring paid process was launched.

**46 offline tests**, type checking, agent compilation, 10 local contract tests/256 fuzz and both historical bundle replays pass. The tests include direct OpenAI request wiring with network blocked, complete real quote coverage/source bindings, citation/policy rejection, explicit quote pagination, failed/unknown-cost receipts and repeated-attempt prevention. The new genuine-response fixture is checked offline. Four frozen engine files, policies and historical bundles remain unchanged. The model saw the fixed pre-outage snapshot; newer collection records and its later source gap were outside that context. A no-change recommendation does not establish profitability, a useful improved strategy or public commitment timing.


## Automatic VPS campaign — observed 22 October 2026

Public source PR3 passed branch, PR and merged-main CI before activation. The 73-file launch tree was independently fetched and byte-compared to the reviewed source. The four frozen engine/source files, policies and earlier evidence remain unchanged. The campaign worker started at **21 October 18:22:12 UTC**, with an absolute stop at **28 October 18:21:45 UTC**. Source collection and actual same-block re-quotes run at a nominal 120-second cadence.

At **22 October 08:19 UTC**, the worker had saved and source-paired **416 observations**, with zero quote errors and zero process restarts. Exactly three request markers, three saved provider results and three successful publication receipts were present. The startup report was published at 18:26 UTC; subsequent scheduled reports were published at **00:24 UTC** and **06:25 UTC** on 22 October. Their non-overlapping cohorts contain 179 observations / 2,148 quotes each. All three actual responses are `NO_CHANGE`, proposals are null and the research gate is `HOLD`. The [index](../evidence/research-index.json) retains original responses, plans, complete quote bundles and source checks; exact smaller quote files preserve readable GitHub line anchors.

Independent offline validation reproduced each plan, checked every response/source binding and every quote-source file, replayed the original evaluator and verified that the published cohorts do not overlap. The published 359-observation prefix contains 4,308 quotes. This observed sequence establishes that scheduled analysis and publication occurred; it does not prove future seven-day uptime or profitable trading.

The three automatic token estimates are **$0.0009295**, **$0.0061695** and **$0.0059774**: **$0.0130764 total**. Conservative reservations remain held at **$0.122004575 total**. `actualInvoiceCostUsd` remains null. The application permits at most $1 of reservations in rolling 24 hours and $7 for this campaign; this is not an account-wide provider billing cap.

The researcher cannot read the dedicated repository private key, and the publisher cannot read the OpenAI key. The public GitHub key registration does not expire itself; the absolute-expiry service stops the workers and removes their dedicated private key/API credential copies. Model outputs remain unapproved proposals. No signing, strategy promotion or funded execution was added.

The existing crash/publication test now fixes its clock explicitly, so future CI runs do not fail merely because the fixture's seven-day authorization window has elapsed. This changes the test only; the production authorization check is retained.

The evaluator remains bound to the original experiment freeze. Window reports retain its elapsed-since-freeze duration and gap rules: later windows exclude previously analysed rows, so their `SOURCE_GAP` flag also reflects that omitted prefix. Inspect the quoted-window timestamps for the actual cohort span. The second full cohort's maximum internal timestamp gap was 271 seconds; this does not establish a complete seven-day comparison. No flag, raw response or gate was removed.


## Strategy discovery — 22 October 2026

The old researcher received new observations, but could change only three fields of one route family. The new paper lab explores verified pool cycles and exact trade sizes. The LLM receives new exploration quotes and prior trial results, then proposes typed route and entry-rule hypotheses. The original engine, control, acceptance rules and historical evidence remain unchanged.

At block **95,031,463**, discovery found **14 liquid pools and 120 cycles**, including 100 triangles. The first public scan contains three source-paired blocks and 18 new quotes. An actual archive check at **22 October 10:45:46 UTC** reproduced all 12 control and six exploration quotes at block 95,046,937. The [source receipt](../evidence/lab-archive-source-check-2026-10-22.json) retains the exact input hashes; `lab:audit` repeats the provider check.

One genuine GPT-6 Luna request inspected all six training frames and 36 exploration quotes. It proposed WETH–CASHCAT–USDG and WETH–PONS–CASHCAT triangles, each with a 0.005 WETH input, 30 bps threshold, 1.5× gas buffer, two consecutive eligible observations and a 30,000,000 wei base-fee cap. The model explicitly identified both cells as unquoted hypotheses requiring fresh data. [Commit d75f347](https://github.com/sproutagentai/mevhood/commit/d75f34717487821872b9122ecb52365fa4808a82) retains its original response, complete context and plan. Usage of 72,991 input and 5,600 output tokens implies **$0.0100991**, with a **$0.048303475** conservative reservation. The invoice is unreconciled.

### Prospective comparison observed

The worker acknowledged that public freeze at **10:51:12 UTC**. Its forward boundary, **95,056,142**, is after the last training block, **95,053,024**. Subsequent blocks **95,056,149 and 95,057,227** were compared against the unchanged control and [published automatically](../evidence/lab-mevy-auto-20261021-progress-95057227-report.json). Both reports replay exactly; a separate integer calculation reproduced all four candidate/block signal decisions. Both candidates and the control have zero qualifying known-gas quote signals in this short window. Complete P&L remains null and the gate remains HOLD.

At **11:04 UTC**, the VPS retained 13 lab frames and 78 exploration quotes, with zero quote errors, one discovery response and two hypotheses. The three lab publications are an initial source scan, the model proposals and an automatic forward comparison. A controlled runtime update retained the exact budget, state, evaluator hashes, public anchors and absolute expiry. It made no additional model call. Source **baa5c9e4e10c8f2199fa28801ad04308749828e7** passed 58 local and VPS tests, type checking, agent compilation, contract checks and the original replay. [Main CI passed](https://github.com/sproutagentai/mevhood/actions/runs/39767256289). The additional fault test covers recovery after an interrupted envelope rename or publication without rewriting its original bytes.

The website displays actual hypotheses, test rules, paired counts and original GitHub sources. Seventy tests and native checks at 1280, 390 and 700 pixels passed. The first forward quote link opened block 95,056,149 in GitHub. The tested production build **dpl_516onjp535SNqqGDHcpvwnUFJRa6** was promoted to mevhood.xyz and www.mevhood.xyz. The [dated live check](../evidence/lab-live-check-2026-10-22.json) distinguishes the saved current data from the older published window.

All five implementation criteria in [the lab specification](strategy-lab-spec.md) pass for this bounded paper cycle. Full seven-day acceptance, reconciled costs, profit improvement, signing and live trading are not established. The remaining authorization ends before seven full days can elapse after the new trial freeze; it was not extended to make that gate pass. Quotes are not executed fills, and provider consistency is not consensus proof.


## 23 October: historical execution study and researcher repair

- Frozen source selection: every one of six positive-before-gas cells from the fixed 286-frame / 1,716-quote snapshot, ten exact sizes each. All 60 local fork router executions succeeded and matched independently read archive outputs; none covered actual execute transaction gas at the saved historical base fee. Control selection stayed zero.
- All source frame hashes, graph/route identities, original selection, balance changes, receipts, gas products and totals replay through `npm run fork:verify`. The same ten sizes on block95,139,899 were executed on a fresh fork with recorded timestamps; amounts and transaction gas matched every row. Original pilot revert, local receipt timeout and archive startup failure remain in diagnostics; these are distinct from the completed matrix.
- 64 TypeScript tests/typecheck/agent build and12 Solidity tests passed; original integration and published research plans replay unchanged. Two current proof tests also cover the final independent-replay binding and reject rehashed incorrect gas, missing sizes and replaced windows.
- Actual v2 OpenAI repair response and later scheduled outcomes are bound in `evidence/research-repair-2026-10-23.json`. Empty/truncated/invalid output diagnostics are captured before parsing; no retry, live strategy adoption or gate relaxation. An unavailable evidence citation was rejected by the existing guard.
- These are hindsight-selected historical cost measurements, not seven-day acceptance, achieved fills/inclusion, complete P&L or a profitable strategy. Runtime repair preserves the original campaign expiry/budget and frozen engine/evaluator.
