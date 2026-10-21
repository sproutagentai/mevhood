<p align="center"><img src="assets/mevy.svg" width="76" alt="Mevy"></p>
<h1 align="center">MEVHOOD · Mevy</h1>
<p align="center"><strong>Every change faces a frozen control.</strong></p>
<p align="center">Onchain observations → paired experiments → evidence → a reviewed next version.</p>
<p align="center"><a href="https://github.com/sproutagentai/mevhood/actions/workflows/verify.yml"><img alt="Reproduce Mevy" src="https://github.com/sproutagentai/mevhood/actions/workflows/verify.yml/badge.svg?branch=main"></a> <a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-e8e6e3?labelColor=161616"></a> <img alt="Research preview" src="https://img.shields.io/badge/status-research_preview-ef986f?labelColor=161616"></p>

Mevy is MEVHOOD's research agent. It examines public onchain quotes, compares a candidate policy with a pinned control, and proposes the next experiment. Both versions see the same new data. Costs, rejected changes and incomplete evidence stay visible.

**This release is a working research implementation. Profit improvement, continuous operation, a paid LLM cycle and public contract deployment are not established.** The existing MEVHOOD website and funded searcher are separate systems.

<p align="center"><a href="#reproduce-the-evidence">Reproduce</a> · <a href="docs/architecture.md">Architecture</a> · <a href="docs/runbook.md">Operator guide</a> · <a href="docs/claims.md">Claims & evidence</a> · <a href="SECURITY.md">Security</a> · <a href="https://mevhood.xyz">Website</a></p>

## What is here

| Layer | What it does | Boundary |
|---|---|---|
| Onchain reader | Pins Robinhood Chain / Uniswap v3 quotes to one block; verifies pools and deployed code | Public reads; no keys |
| Experiment engine | Runs frozen control and candidate on identical observations; accounts for fees, gas, infrastructure and research cost | Paper estimates; seven-day gate |
| Evidence store | SQLite transactions, immutable rows, hash-linked journal, reproducible bundles | Local integrity; anchoring remains separate |
| Mevy researcher | eve agent with two typed tools: inspect results and propose a bounded policy | No shell, self-editing, deploy or signing tools |
| Reviewed evolution | Binds a saved proposal and exact human-approved draft to a fresh immutable experiment | Original control/gate retained; stale approvals fail |
| Registry | Prepared creation/call calldata, creation-receipt checks and actual public-anchor timing validation | Unsigned; receipts do not prove P&L |
| Atomic executor | Executes a fixed two-pool round trip only when actual WETH balance increases by the required floor | Unaudited; not deployed or funded |

The first strategy family is WETH → USDG → WETH across **different** v3 fee-tier pools. A proposal can change size, minimum edge and a gas decision buffer. General autonomous code generation is not enabled.

## Reproduce the evidence

Requires Node **24.13.0** and npm. This sequence makes no model calls, signs no transactions and starts no server.

```sh
git clone https://github.com/sproutagentai/mevhood.git
cd mevhood
npm ci
npm run verify
npm run mevy -- verify --file evidence/integration-2026-10-21.json
```

The bundle is a dated **integration sample**, not a performance trial. Expected result: `verified: true`, `researchGate: HOLD`. Missing gas/infrastructure cost and insufficient forward data are explicit. No zero is substituted for an unknown expense.

To independently re-read and re-quote the saved block from the public RPC:

```sh
npm run mevy -- audit-source --file evidence/integration-2026-10-21.json
```

Source audit needs archive-capable RPC access. A provider outage is a failed source check, not zero activity. An offline replay proves internal consistency; source audit separately checks saved onchain data.

Contract checks require [Foundry](https://getfoundry.sh/) **v1.8.5**:

```sh
forge test -vv
FOUNDRY_PROFILE=fork forge test -vvv
```

The second command reads a pinned Robinhood Chain fork. It uses the real WETH and router contracts, tests that a losing route reverts atomically, and does not broadcast a transaction.

## How a version earns review

1. Freeze baseline, candidate, evaluator source, costs and acceptance rules before new observations.
2. Collect the same block-pinned quotes for both policies. Preserve gaps, errors and conflicting reads.
3. Compare after explicit costs, for at least **seven days** and **1,000 observations**, with a maximum **300-second gap**.
4. Export the complete ledger, policies, source/data/result digests and limitations. Replay independently.
5. Mevy proposes a bounded change with block evidence and a failure hypothesis. A person reviews it; a fresh experiment starts after all training data.

Even a passing research report says `ELIGIBLE_FOR_REVIEW`. `livePromotion` remains `DISABLED`. Paper quotes do not capture inclusion, competition, failed attempts or private orderflow, and they are not realized trading profit.

## Current evidence

- [Dated integration bundle](evidence/integration-2026-10-21.json): real chain data, 12 two-pool quotes, zero paper trades, replayable `HOLD`.
- [Verification record](docs/verification.md): exact local checks, fork scope and remaining gates.
- [Source and economic boundaries](docs/architecture.md), [claims ledger](docs/claims.md), [implementation decisions](implementation-notes.html).
- CI reproduces type checks, state/economic tests, agent compilation, offline evidence replay and contract tests. A green build does not establish alpha.

The [operator guide](docs/runbook.md#review-a-proposal-and-freeze-its-successor) covers verified sample import, proposal approval, fresh experiment lineage and unsigned onchain preparation. Prepared calldata is not a public deployment. The LLM still needs an authorized provider/runtime; compilation and handoff tests do not establish a useful live model cycle.

No token, payout pool or vault is created by this repository. Do not send assets to an example or old executor address expecting this code to control it.
