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
- A paid LLM generation, provider invoice reconciliation and a useful approved candidate cycle.
- Continuous hosted collection and restart monitoring.
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

Live provider generation/invoice, continuous collection, public registry deployment and funded execution remain unverified and unlaunched.

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
