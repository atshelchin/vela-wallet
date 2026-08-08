---
title: Audits & known issues
description: Every on-chain contract Vela depends on, who audited it, whether the audited version matches what is actually deployed, and what is not audited at all.
---

"Audited" is a claim about a specific version of specific code, so this page
does not wave at the word — it cites the exact reports, the exact deployment
addresses, and the diffs between audited and deployed versions. It also lists
what is _not_ audited, because that list is just as load-bearing as the first
one.

Last reviewed: August 2026. If you find an error here, tell us and we'll fix
it.

## The funds path

Four contract layers can touch your money. All four are third-party contracts
with published audits, and in each case the deployed address is the official
canonical deployment.

### Safe v1.4.1 — the account itself

Your wallet is a [Safe](https://github.com/safe-global/safe-smart-account)
proxy: SafeL2 singleton, proxy factory, compatibility fallback handler, and
MultiSend for batching.

[Ackee Blockchain audited Safe v1.4.0](https://github.com/safe-global/safe-smart-account/blob/main/docs/audit_1_4_0.md)
(final report March 2023): 11 findings, none critical or high. The v1.4.1 we
deploy differs from the audited v1.4.0 by a single-line ERC-4337
compatibility fix ([PR #572](https://github.com/safe-global/safe-smart-account/pull/572)).
MultiSend's logic is unchanged since the [G0 Group-audited v1.3.0](https://github.com/safe-global/safe-smart-account/tree/main/docs).
All addresses match the canonical deployments in
[safe-deployments](https://github.com/safe-global/safe-deployments), and the
contracts sit inside the [Safe Foundation bug bounty](https://docs.safefoundation.org/security/bug-bounty)
(up to $1,000,000 for critical findings).

One thing an audit does not cover: the 2025 Bybit incident. That attack
compromised the build pipeline of Safe's official web frontend, not the
contracts — the
[official forensic conclusion](https://safefoundation.org/blog/safe-ecosystem-foundation-statement)
found no vulnerability in the Safe smart contracts. We read it as a lesson
about the web and operations layer, which is the layer you should scrutinize
us on too.

### Safe4337Module v0.3.0 — the ERC-4337 adapter

Deployed at `0x75cf11467937ce3F2f357CE24ffc3DBF8fD5c226`, the canonical
v0.3.0 address (Sourcify exact match — the on-chain bytecode is the audited
code). [Audited by Ackee Blockchain](https://github.com/safe-global/safe-modules/blob/main/modules/4337/docs/v0.3.0/audit.md)
(final report March 2024) with no unresolved findings above informational
level. The v0.3.0 + EntryPoint v0.7 + Safe ≥1.4.1 combination we use is
exactly the configuration the audit and the release notes describe.

The module's history includes one disclosed issue: v0.1.0 (2023) did not sign
`initCode` and `paymasterAndData`, a gas-griefing vector. It was
[fixed in v0.2.0](https://safefoundation.org/blog/strengthening-security-addressing-the-incident-of-the-canonical-4337-module)
and v0.1.0 never left the testnets. We use v0.3.0, which inherits the fix.

### SafeWebAuthnSharedSigner v0.2.1 — the passkey signer

Deployed at `0x94a4F6affBd8975951142c3999aEAB7ecee555c2`, the canonical
v0.2.1 address (same on every chain via the Safe singleton factory).

What "shared" means — and does not mean: the _contract deployment_ is shared,
the way the Safe singleton is shared. Your key is not. Each Safe calls
`configure()` by delegatecall and stores its own P-256 public key in its own
storage. One signer instance represents exactly one passkey per Safe, and
nobody else's Safe can use yours.

Version matters here. The v0.2.0 audit
[explicitly stated](https://github.com/safe-global/safe-modules/blob/main/modules/passkey/docs/v0.2.0/audit.md)
that the shared signer was not in scope — the contract didn't exist yet. The
audits that cover what we deploy are the v0.2.1 ones: a
[Hats Finance audit competition](https://github.com/safe-global/safe-modules/blob/main/modules/passkey/docs/v0.2.1/audit-competition-report-hats.md)
(June–July 2024: zero high, zero medium, three low findings — all fixed) plus
a [Certora review of the release commit](https://github.com/safe-global/safe-modules/blob/main/modules/passkey/docs/v0.2.1/audit.md)
with no new findings. No contract-level vulnerability has been disclosed
since release; the passkey contracts are in scope of the Safe Foundation
bounty.

Safe's own documentation recommends pairing passkey ownership with a recovery
path rather than treating one credential as the only key to the account. How
Vela handles this is documented in [Recovery & sign-in](/docs/recovery).

On-chain P-256 verification uses the RIP-7212 precompile directly, with no
Solidity fallback verifier. Before enabling any network, the app probes the
precompile with a real signature and refuses the network if verification
fails. Two honest caveats: the original RIP-7212 spec has edge-case flaws
that [EIP-7951](https://eips.ethereum.org/EIPS/eip-7951) was written to fix
(they do not affect well-formed WebAuthn signatures), and a probe cannot
catch every way a chain's implementation might diverge in unusual execution
contexts.

### EntryPoint v0.7 — the ERC-4337 entry point

Deployed at `0x0000000071727De22E5E9d8BAf0edAc6f37da032`, the
[canonical v0.7.0 deployment](https://github.com/eth-infinitism/account-abstraction/releases/tag/v0.7.0).
[Audited by OpenZeppelin](https://www.openzeppelin.com/news/erc-4337-account-abstraction-incremental-audit)
(commissioned by the Ethereum Foundation, January 2024): zero critical, zero
high, five medium findings, all resolved — and the audited commit is the
deployed release. EntryPoint v0.7.0 is in scope of the Ethereum Foundation's
[ERC-4337 bug bounty](https://docs.erc4337.io/community/bug-bounty) (up to
$250,000).

## Known issues we are watching

### The EntryPoint griefing vector

In February 2026, security researchers at Trust Security
[disclosed](https://erc4337.substack.com/p/improving-useroperation-execution)
a griefing and censorship vector affecting every EntryPoint before v0.9,
including the v0.7 we use. An attacker who intercepts a signed UserOperation
before it is mined can execute it inside a call frame the attacker controls
and force the inner execution to revert — the operation fails, but gas is
still charged. The Ethereum Foundation paid the researchers a $50,000 bounty
for the find; it classified the issue as a censorship/griefing vector, not a
fund-theft vector, and it has never been exploited.

What it can do: waste a fee and delay a transaction. What it cannot do: steal
funds or forge a signature. Vela's exposure is narrow because UserOperations
go straight to a relay rather than through a public mempool, so there is
little opportunity to intercept one — and the worst case is bounded by the
fee you already agreed to. The fix exists only in EntryPoint v0.9
(November 2025); v0.7 itself cannot be patched. We expect to migrate as the
surrounding stack — in particular Safe's 4337 module line — adds v0.9
support, and we will note it here when that happens.

## What is not audited

- **Vela's own contracts.** Two small contracts we wrote ourselves, deployed
  on Gnosis: the
  [passkey public-key index](https://github.com/atshelchin/webauthnp256-publickey-index.biubiu.tools)
  (an append-only registry that helps your devices find your public key) and
  its batch helper. They are unaudited. By construction they hold no funds,
  have no owner, and cannot be upgraded — they are a discovery layer, not an
  authorization layer. Spending power always comes from the passkey
  configured inside your Safe. The worst realistic failure is griefing
  (someone squatting an index entry), which can make recovery less convenient
  but cannot move money. A gas-settlement splitter contract from an earlier
  fee design is no longer part of the transaction flow.
- **Multicall3.** Its own README
  [says plainly](https://github.com/mds1/multicall3): "This contract is
  unaudited." We use it exactly the way its authors describe as safe —
  batched read-only calls for balances, token metadata and price quotes. Vela
  never grants it approvals and it never holds funds. The worst case of a bug
  is an incorrect read.
- **The CREATE2 deployer.** The
  [Arachnid deterministic deployment proxy](https://github.com/Arachnid/deterministic-deployment-proxy)
  is the ecosystem-standard stateless deployer; it has no formal audit. Our
  network checks fail closed if it is missing or altered on a chain.
- **Tempo and pathUSD.** Tempo, one of our twelve built-in networks, has no
  native coin; gas there settles in the pathUSD stablecoin. As of August
  2026, neither Tempo's core protocol nor pathUSD has a published security
  audit or a bug bounty, and an independent
  [DefiLlama collateral assessment](https://artifacts.llama.fi/md-exports/pathusd-collateral-assessment-april2026-1776332825042.md)
  (April 2026) rated pathUSD high-risk. This is chain-level risk that no
  wallet can mitigate: funds you hold on Tempo, and gas settlement there,
  inherit it. Treat Tempo as the newest and least-proven chain on the list
  and size your balances accordingly. We will update this section as audits
  are published.
- **Vela itself.** Our app and backend services have not had a third-party
  audit. That is the single biggest caveat on this page, we state it in the
  site header, and the honest details are in
  [Vela is in alpha](/blog/vela-is-in-alpha). Start with small amounts. Read
  the code.

## Check it yourself

Every address above is a canonical public deployment you can verify against
the official registries — [safe-deployments](https://github.com/safe-global/safe-deployments),
[safe-modules-deployments](https://github.com/safe-global/safe-modules-deployments)
and the [EntryPoint release notes](https://github.com/eth-infinitism/account-abstraction/releases/tag/v0.7.0):

| Contract                            | Address                                      |
| ----------------------------------- | -------------------------------------------- |
| SafeL2 singleton v1.4.1             | `0x29fcB43b46531BcA003ddC8FCB67FFE91900C762` |
| SafeProxyFactory v1.4.1             | `0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67` |
| CompatibilityFallbackHandler v1.4.1 | `0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99` |
| MultiSend v1.4.1                    | `0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526` |
| SafeModuleSetup v0.3.0              | `0x2dd68b007B46fBe91B9A7c3EDa5A7a1063cB5b47` |
| Safe4337Module v0.3.0               | `0x75cf11467937ce3F2f357CE24ffc3DBF8fD5c226` |
| SafeWebAuthnSharedSigner v0.2.1     | `0x94a4F6affBd8975951142c3999aEAB7ecee555c2` |
| EntryPoint v0.7                     | `0x0000000071727De22E5E9d8BAf0edAc6f37da032` |
| Multicall3                          | `0xcA11bde05977b3631167028862bE2a173976CA11` |
| Passkey public-key index (Gnosis)   | `0xdd93420BD49baaBdFF4A363DdD300622Ae87E9c3` |
