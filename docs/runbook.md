# Operator guide

## Install and inspect

Use Node 24.13.0, npm ci, npm run verify and Foundry v1.8.5 / forge test. Inspect policies/, the architecture and SECURITY.md before collecting. No installation hook starts a process or invokes a provider.

## Freeze a new experiment

Choose a unique ID, update the candidate policy, retain the baseline, and independently establish the training cutoff and all costs. The files are copied into an immutable SQLite record at freeze. Later file edits cannot mutate the frozen record.

```sh
npm run mevy -- freeze trial-001 --training-through 0
```

This performs public chain reads and creates data/mevy.sqlite. The default LLM cost is **unknown** and blocks the gate. For an experiment with no model usage, pass `--llm-cost-wei 0 --llm-cost-note 'No model calls; hand-authored candidate'`. A paid experiment needs a reconciled charge in wei and the invoice/FX allocation basis in that note. Costs cannot be silently changed after freeze; a new experiment is required.

The local freeze is not a publicly timestamped commitment. Once a registry is independently reviewed and deployed, register the experiment digest and begin data collection after that onchain anchor. Do not reuse older observations as forward data. The current release has no automatic signing or registry broadcast command.

## Observe and inspect

One finite observation reads verified pools and all complete two-pool paths at a common block, 64 blocks behind the head. Supply an independently justified extra gas cost (tips/L1 data fee, in wei) and an allocated infrastructure cost (in wei, per observation). Omit them when unknown; missing values remain null.

```sh
npm run mevy -- observe trial-001
npm run mevy -- report trial-001
```

For an explicitly authorized bounded collector:

```sh
npm run collect -- trial-001 --seconds 3600 --interval 60
```

No collector is running as part of this release. It stops on provider errors. SIGINT/SIGTERM releases the single-writer lock after the current read. After a hard crash, confirm the recorded PID is dead before removing the lock. Repeated collection still preserves the seven-day and gap requirements. Arrange hosting, retention, costs and restart monitoring before a continuous trial; a laptop session is not an uptime guarantee.

## Export and verify

```sh
npm run mevy -- export trial-001 --output evidence/trial-001.json
npm run mevy -- verify --file evidence/trial-001.json
npm run mevy -- audit-source --file evidence/trial-001.json
```

Export refuses to overwrite a file. The source audit is bounded to 20 observations; audit longer datasets in reviewed batches instead of assuming a small sample verifies every row. No external log or cost receipt should contain a secret. The engine source hash is intentionally strict: an engine edit invalidates comparisons from a different version. Replay old evidence using its matching Git commit.

## Research with Mevy

To inspect the committed real integration sample locally, import it first:

```sh
npm run mevy -- import --file evidence/integration-2026-10-21.json
```

Import verifies the complete bundle before writing. Repeated identical imports are idempotent. It does not re-read the chain or turn the dated sample into a forward trial. CLI, collector and researcher share `MEVY_DB`; npm CLI/collector commands also read ignored `.env.local`. The checked-in `.env.example` contains no credential.

The eve config compiles without credentials. Actual model use requires separate authorization, a chosen Gateway credential and an explicit budget. Keep credentials in an ignored local .env.local file or the framework's documented login flow; never put them in a proposal or GitHub issue. No key value is provided by this project.

After an approved local runtime launch, `npm run dev` starts eve. Ask Mevy to inspect an existing experiment by ID and propose one testable change. Only two tools are available. A proposal save prompts for approval, is capped at three per experiment and records session/configured-model provenance. Model usage/actual billed cost must be reconciled independently before freezing a subsequent paid experiment.

The configured $0.10 session token-cost limit is not a hard spend cap. The final call can cross it and unreported provider cost does not accrue against it. Do not enable a paid runtime without provider-side limits. The public HTTP surface is not authenticated for hosting; keep it local until deployment authentication is implemented.

## Review a proposal and freeze its successor

After the researcher's approval-gated tool saves a proposal, its hash identifies the exact receipt. A name-only change is rejected. Prepare a review file:

```sh
npm run mevy -- prepare-next PARENT_ID --proposal-hash PROPOSAL_HASH --output data/next-draft.json
```

Review its candidate, original control, unchanged acceptance rules, evidence, parent bundle hash and full training cutoff. To accept exactly that file, invoke:

```sh
npm run mevy -- freeze-next NEW_ID --file data/next-draft.json --approve-draft EXACT_DRAFT_HASH
```

This creates a new immutable experiment; it never promotes a live strategy. Missing inference cost remains null/HOLD. Add `--llm-cost-wei` and `--llm-cost-note` only with an independently reconciled basis. A changed draft, wrong approval hash, new parent observation or a freeze overlapping training is rejected. Review and freeze run under one SQLite writer lock. The original control, acceptance rules and source commitment are carried forward. Lineage is part of the new experiment commitment.

## Deploy and execute

No network deployment or funded canary is authorized by copying these commands. Specify chain 4663, a separately controlled recorder/controller, maximum fee and canary inventory before preparing a deploy. Review constructor addresses against the official Uniswap deployment and independently verify bytecode/source. The controller can withdraw inventory; there is no public depositor system.

Contracts are unaudited. A registry receipt is not a profit oracle. A contract gain excludes gas paid by the signer. A real canary requires exact transaction simulation, receipt reconciliation, actual asset/gas deltas, and a stop/withdraw procedure. No private searcher keys or old executor funds are used by this implementation.

The code can now prepare unsigned creation transactions after the authority address is selected:

```sh
npm run mevy -- deploy-plan registry --owner PUBLIC_ADDRESS --output data/registry-deploy.json
npm run mevy -- deploy-plan executor --owner PUBLIC_ADDRESS --profit-floor-wei REQUIRED_FLOOR --max-amount-wei APPROVED_SIZE --output data/executor-deploy.json
```

Bundled creation bytecode is source-bound; CI independently rebuilds it with the pinned compiler. These commands do not sign, estimate a complete fee, send or fund anything. An executor size above0.02WETH is rejected. Before any authorized wallet submission, simulate with that actual signer, verify chain4663, costs, constructor authority and fixed token/router/factory addresses. Never use an example/test address as the production authority.

After an independently authorized deployment, check its actual creation input/receipt and immutable authority:

```sh
npm run mevy -- check-deployment --file data/registry-deploy.json --tx CREATION_HASH
```

Keep the returned runtime code hash. Before collecting any forward observation, prepare the public freeze against that exact registry/recorder/code identity:

```sh
npm run mevy -- registry-freeze EXP_ID --registry ADDRESS --recorder PUBLIC_ADDRESS --code-hash VERIFIED_RUNTIME_HASH --output data/freeze-tx.json
```

It refuses a retrospective freeze after local observations already exist. Submit separately only after explicit approval, confirm the anchor, then collect after its block/timestamp. Once both the research gate and actual public-anchor duration pass, use `registry-report` with the same flags to prepare result calldata. Data before the real public anchor, an existing result, insufficient post-anchor data, wrong chain/recorder/code, changed commitment or a report at/after the current head fails closed. Call preparation still does not establish an independent audit or L1 finality.
