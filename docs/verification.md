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
