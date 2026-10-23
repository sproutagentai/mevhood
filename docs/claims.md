# Claims and evidence

| Claim | Release status | How to check |
|---|---|---|
| Real Robinhood Chain / Uniswap quotes | VERIFIED integration snapshot + archive re-quote | evidence file + audit-source; Blockmachine re-quote passed21Oct2026 |
| Frozen policies, durable storage, deterministic replay | VERIFIED locally | npm test; verify bundle |
| Exact proposal approval and successor lineage | VERIFIED locally | evolution tests, import/prepare-next/freeze-next |
| Unsigned creation/registry calldata and public-anchor checks | BUILT / local tests | registry tests; compiled artifact comparison; no public deployment receipt |
| Strategy discovery / new route and entry-rule hypotheses | ACTUAL MODEL OUTPUT AND PROSPECTIVE SCREENS PUBLISHED | 14 verified pools; 120 cycles; 480 route/size cells. Published hypotheses, publicly frozen prospective comparisons and failed request diagnostics; discovery-index.json |
| Candidate improves profit | NOT ESTABLISHED | No seven-day trial; integration sample is HOLD |
| Local contract invariants | VERIFIED locally | forge test |
| Contract deployed / funded / signed trades | NOT DONE | No deployment address or receipts |
| eve typed agent and two restricted tools | BUILT | npm run build:agent |
| Direct OpenAI analysis with bounded draft output | VERIFIED manual + three automatic responses | Original 40-row Sol response plus Luna startup/two 179-row reports; source-bound plans, usage and actual responses in research-index.json; all NO_CHANGE |
| Scheduled VPS analysis and evidence publication | RUNNING / discovery and failed-request publications observed | Six-hour slots; campaign ends 28Oct2026 18:21UTC; launch receipt and report index. Future seven-day uptime is unverified |
| Provider invoice / useful strategy improvement | UNVERIFIED | Automatic token estimate $0.0130764 as of 22Oct08:19UTC; no reconciled invoice or improved approved candidate |
| Preliminary VPS collection | Original collector replaced; historical gap preserved | Separate authorized seven-day campaign: 120-second source cadence, rolling $1/day and $7 total reservations. Not a completed forward trial |
| Upgrade of the old funded MEVHOOD engine | NOT CLAIMED | Independent implementation; no private-engine access |
| Token-holder distribution / vault | NOT IMPLEMENTED HERE | Separate product and contracts |

The dated sample proves connectivity, negative/no-op decisions and reproducible computation. It does not establish profitability, a statistically sound strategy improvement, public commitment timing, or autonomous self-improvement in production. A hash is an integrity receipt, not a proof that the underlying economic claim is true.

Official deployment source: [Uniswap v3 on Robinhood Chain](https://developers.uniswap.org/docs/protocols/v3/deployments/v3-robinhood-chain-deployments). Runtime: [eve](https://github.com/vercel/eve). Addresses are verified at read time rather than assumed to match another chain.

Historical size/execution study23Oct: six original positive-gross windows × ten sizes,60successful local router executions,0positive after execution gas. A fresh ten-size fork replay matched amounts/gas. Source/receipts/initial failures are linked in execution-index.json. Hindsight selection, synthetic local funding and excluded costs prohibit a profit or forward-acceptance claim.
