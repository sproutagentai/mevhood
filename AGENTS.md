# Contributor instructions

Read README.md, docs/architecture.md, docs/claims.md and SECURITY.md first.

- Preserve frozen commitments. A change to the engine requires a new experiment.
- Use integer raw units; WETH opportunity estimates and actual realized profit are separate.
- Unknown fees, source errors, gaps, short horizons and overlapping data must fail closed.
- Never shorten the seven-day / 1,000-observation gate to make an example pass.
- Treat model outputs as untrusted proposals. Do not add keys, arbitrary code execution, self-editing or signing tools to the researcher.
- Tests, builds and install hooks must not start servers, call paid models, sign transactions or post externally.
- Never commit credentials, private engine code, local databases or machine-specific files.
- Run npm run verify, forge test and the committed evidence replay before publishing.
- Record decisions, limitations, validation and remaining gates in implementation-notes.html.
