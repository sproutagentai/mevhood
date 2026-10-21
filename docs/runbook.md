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

The researcher now uses direct OpenAI access. Keep `OPENAI_API_KEY` in ignored `.env.llm.local`, readable only by its owner, and never paste the value into chat, source, a proposal or a GitHub issue. The research CLI and approved interactive launcher explicitly load this file. Builds and tests do not make paid requests. Model use still needs a specific budget and runtime authorization.

For the complete archived preliminary snapshot, prepare the request without calling a model:

```sh
npm run research:llm -- --file evidence/preliminary-vps-2026-10-21.json --source-audit evidence/history-source-audit-2026-10-21.json --budget-usd 1
```

The preflight verifies the original bundle and every archive receipt, includes all40 observations and480 quotes, and prints a hash-bound plan and conservative request reserve. It refuses a budget below that reserve and refuses oversized contexts rather than silently sampling. It starts no server, collector or model request.

Only after approval of the actual request and its budget, use a new private output directory and add execution:

```sh
npm run research:llm -- --file evidence/preliminary-vps-2026-10-21.json --source-audit evidence/history-source-audit-2026-10-21.json --budget-usd 1 --output data/llm-review-001 --execute
```

This sends one Responses API request to OpenAI, with no tools or automatic client retries. It saves the exact context, instructions, plan, returned response ID/model/usage and validated analysis. An existing run directory prevents a repeated attempt. A failed request retains its reserved/unknown cost and requires operator review before any further spend. The application reserve uses conservative token/price assumptions; it is not a provider-enforced billing cap. Recheck the dated pricing basis before later reuse.

The result is either `NO_CHANGE` or one bounded `PROPOSE_TEST` draft with real source blocks. Fabricated citations, rename-only changes, multiple changed economic fields and incomplete model output fail validation. `analysis.json` stays `AWAITING_HUMAN_REVIEW`; no database proposal, successor freeze or strategy is automatically approved. To adopt a proposal, inspect its evidence and use the existing approval-gated proposal/successor workflow below. Token-based USD cost is an estimate, not an invoice or a reconciled WETH cost; the original experiment is never rewritten.

After an approved local runtime launch, `npm run dev` starts eve. Ask Mevy to inspect an existing experiment by ID and propose one testable change. Only two tools are available. The reader returns full-history totals and explicit pages of original quotes; `nextOffset` permits inspection beyond the old last20-row window. A proposal save prompts for approval, is capped at three per experiment and records session/configured-model provenance. Model usage/actual billed cost must be reconciled independently before freezing a subsequent paid experiment.

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


## Archive RPC and historical quote audit

The default source-audit endpoint is `https://rpc-robinhood.blockmachine.io`. Its [Robinhood guide](https://blockmachine.io/docs/robinhood-rpc) documents keyless archive reads. The original integration block was re-quoted from this endpoint on 21 October 2026 on both the operator machine and VPS; block/code hashes, all 12 route outputs and returned gas matched. An endpoint's advertised archive support is not sufficient on its own.

Override audit routing with `--rpc HTTPS_URL` or ignored `.env.local`:

```sh
MEVY_ARCHIVE_RPC_URL=https://rpc-robinhood.blockmachine.io
```

Precedence is explicit flag, environment, then the verified public default. This only changes audit routing. Frozen evaluator/reader source and existing observations remain unchanged.

For the dated integration sample:

```sh
mkdir -p data
npm run mevy -- audit-source --file evidence/integration-2026-10-21.json --output data/source-audit.json
```

The CLI compares actual historical state at each saved block. It checks chain/block identity, contract-code hashes, pool identities, quotes and gas. `sourceAudit: PASS` with `auditComplete: false` means a bounded range passed. Only a complete receipt says `sourceRequoted: true`. Each invocation handles at most 20 observations; use `--offset 20 --limit 20` for the next range without rewriting the original bundle.

For a complete exported history, with per-block progress and restart support:

```sh
npm run audit:history -- --file data/trial-001.json --output data/trial-001-source-audit --max-seconds 3600
```

The command validates the entire original bundle before source reads, writes one hash-bound receipt per block, and prints progress. Re-run the same command to resume that exact snapshot. A changed bundle, provider identity or receipt is rejected. Use a new output directory for a fresh network audit. Completion requires receipts for every observation; partial runs keep `sourceRequoted: false` and `nextOffset`. The summary retains the research report's verdict.

The published preliminary snapshot contains 40 observations, captured before the original collector's quota failure. To re-check that exact history from scratch:

```sh
npm run mevy -- verify --file evidence/preliminary-vps-2026-10-21.json
npm run audit:history -- --file evidence/preliminary-vps-2026-10-21.json --output data/preliminary-source-audit
```

The first command checks internal integrity offline. The second re-reads historical chain state and takes roughly 40 minutes on the keyless endpoint. It does not start a collector, submit transactions or call a model. Do not reuse someone else's cached receipt directory when you intend a fresh provider check.

The keyless limit published by the provider is 60 RU/min per IP; source-audit commands space requests by at least 1.1 seconds. A typical 12-route block needs about 49 RPC requests. Budget roughly one minute per observation. The separately authorized VPS collector uses a 1-second transport interval and a 60-second snapshot cadence; recent complete snapshots took about 55 seconds. These limits apply to each process, while the allowance is shared across the IP. A full historical audit must not compete with that collector on the same keyless quota. Quota errors and mismatches stop the audit visibly; earlier receipts remain available.

The preliminary VPS collector keeps its original absolute stop deadline. Its earlier main-RPC quota failure and resulting data gap remain in the evidence. Archive verification cannot recover missing observations, establish an onchain commitment, or turn the report into trading profit.

## Unattended research campaign

The prepared runtime uses `ops/mevy-research-auto.service` and an explicit, root-owned campaign configuration. It must not be installed or started as part of package installation, tests or CI. The approved deployment scope is seven days, six-hour research slots, at most $1 in conservative request reservations in any rolling24h and $7 across the campaign. The initial slot is a bootstrap source check; its report is labelled accordingly. Subsequent slots include every newly saved source-paired observation since the previous reserved window. All proposals remain unapproved; no strategy/contract is changed.

The source cadence is120s. Each observation is physically re-quoted before research, with the original per-block capture retained inside the published window audit. Request pacing shares the free archive quota; missing captures block analysis until their free source check recovers. Source failures, unknown fees/costs and gaps stay visible. A six-hour cohort is not a seven-day profitability trial.

GPT-6 Luna is the automatic research model. The official [model page](https://developers.openai.com/api/docs/models/gpt-6-luna) was checked21Oct2026: standard input/output$0.10/$0.50 perMTok, long-context2×input/1.5×output. Preparation reserves$0.22/$0.825 perMTok plus25% using a UTF8byte token bound, maximum600000inputbytes and12000outputtokens. The application enforces its reservations; this is not a provider billing cap or reconciled invoice. No automatic paid retry occurs after a reserved request. Unknown-cost failures keep the full reservation. A valid saved response can be recovered into the public queue after a crash without another model request.

The model service and repository publisher are separate OS users. OpenAI credentials stay in an owner-readable, private environment file; the model user cannot read the dedicated SSH publisher key. GitHub access is limited to the project repository, and the deterministic publisher allows only its evidence files, research index and manifest. It validates the complete source package, plan, model receipt, citations and policy schema, appends files atomically and uses a normal fast-forward push. Publication retries never run inference. A repository write deploy key technically permits repository writes beyond those application path checks; GitHub deploy keys do not expire automatically. At the campaign deadline, the expiry unit stops both services and removes the dedicated private key/API-key copies; the public key registration must be separately removed from GitHub when retiring it.

The journal consumes `evidence/research-index.json`, checking the pinned revision/manifest and fetching only the selected report's four source files. Earlier manual reports stay available. No website rebuild is required for a new compatible indexed report. The initial real provider run, writer grant, enabled services, first publication and expiry timer are recorded separately after deployment; prepared unit files alone do not establish operation.
