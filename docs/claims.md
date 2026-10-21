# Claims and evidence

| Claim | Release status | How to check |
|---|---|---|
| Real Robinhood Chain / Uniswap quotes | VERIFIED integration snapshot + archive re-quote | evidence file + audit-source; Blockmachine re-quote passed21Oct2026 |
| Frozen policies, durable storage, deterministic replay | VERIFIED locally | npm test; verify bundle |
| Exact proposal approval and successor lineage | VERIFIED locally | evolution tests, import/prepare-next/freeze-next |
| Unsigned creation/registry calldata and public-anchor checks | BUILT / local tests | registry tests; compiled artifact comparison; no public deployment receipt |
| Candidate improves profit | NOT ESTABLISHED | No seven-day trial; integration sample is HOLD |
| Local contract invariants | VERIFIED locally | forge test |
| Contract deployed / funded / signed trades | NOT DONE | No deployment address or receipts |
| eve typed agent and two restricted tools | BUILT | npm run build:agent |
| Direct OpenAI batch analysis with bounded draft output | VERIFIED one genuine response | GPT-6.1 Sol analysed all 40 rows/480 quotes; actual response/usage/source-bound plan published; NO_CHANGE |
| Provider invoice / useful autonomous improvement cycle | UNVERIFIED | Token-based charge estimate only; no improved candidate or recurring paid runtime established |
| Preliminary bounded VPS collection | STARTED / source gap preserved | 24-hour authorization, fixed stop deadline; not a completed forward trial |
| Upgrade of the old funded MEVHOOD engine | NOT CLAIMED | Independent implementation; no private-engine access |
| Token-holder distribution / vault | NOT IMPLEMENTED HERE | Separate product and contracts |

The dated sample proves connectivity, negative/no-op decisions and reproducible computation. It does not establish profitability, a statistically sound strategy improvement, public commitment timing, or autonomous self-improvement in production. A hash is an integrity receipt, not a proof that the underlying economic claim is true.

Official deployment source: [Uniswap v3 on Robinhood Chain](https://developers.uniswap.org/docs/protocols/v3/deployments/v3-robinhood-chain-deployments). Runtime: [eve](https://github.com/vercel/eve). Addresses are verified at read time rather than assumed to match another chain.
