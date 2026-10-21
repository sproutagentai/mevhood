# Security boundaries

This is unaudited research software. No contract from this repository has been deployed or funded by this release. Do not send funds to a source address, sample, or an old MEVHOOD executor expecting this code to control it.

The researcher can read an experiment and propose a bounded policy. Its optional default tools and delegation are disabled. It cannot sign, trade, deploy, edit acceptance rules or rewrite the control. Saved proposals require human approval. eve's session cost limit uses reported token cost, can be exceeded by the last call, and is not a provider-enforced spending cap. Missing charges stay unknown.

SQLite transactions, immutable-row triggers, a hash-linked event journal, and evidence digests detect ordinary inconsistencies. A machine owner can rewrite an entire database and all local hashes. Independent public anchoring is required to establish a commitment before new data; a local timestamp alone cannot prove it. The registry establishes ordering after deployment but cannot prove honest source reads or correct profit calculations.

AtomicRoundTrip trusts its immutable token, router, factory and controller addresses. It supports ordinary ERC-20 WETH only; rebasing, taxed, callback-bearing or malicious tokens are not supported. The controller can withdraw all inventory. A key compromise defeats that control. The balance check excludes gas paid outside the contract and does not prevent an otherwise authorized controller from choosing a poor route. It is not a public vault or a token-holder payout contract.

RPC providers can lie, withhold or reorganize data. Reads are pinned to a block and its hash is rechecked. A 64-block lag is an operational buffer, not a proof of L1 finality. Historical replay checks arithmetic; independent RPC re-quoting is a separate source check. Quotes do not model private orderflow, competition, failed attempts, inclusion or realized fills.

Do not publish a hosted eve endpoint without authentication, rate limits, process isolation and private state storage. This release is prepared for a local operator, not an unauthenticated public agent service. Avoid hosting the writable SQLite database on ephemeral serverless storage.

Report a vulnerability privately through the repository owner's GitHub profile contact. Do not include private keys, credentials or exploit live third-party systems in a public issue.
