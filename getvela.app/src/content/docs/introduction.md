---
title: Introduction
description: What Vela is, who it's for, and the ideas behind a self-custodial smart wallet with no seed phrase.
---

# Introduction

Vela is a **self-custodial smart wallet** for EVM networks. You own your keys, but
there's no seed phrase to write down — you sign with a passkey, using your face or
fingerprint.

This documentation covers how to get started, create a wallet, move tokens, and
understand the security model behind it.

## The short version

- **Self-custodial.** Your funds are controlled by a key only you can use. Vela
  (the company) cannot move, freeze, or recover your money.
- **No seed phrase.** Your signing key is a passkey in your device's secure
  hardware. There is no twelve-word phrase to lose or have phished.
- **A Safe smart account.** Each wallet is a [Safe](https://github.com/safe-fndn/safe-smart-account)
  smart contract operated with ERC-4337 account abstraction — which is what lets
  you sign with a passkey and read every transaction before you approve it.
- **12 networks, one address.** Ethereum, BNB Chain, Polygon, Arbitrum, Optimism,
  Base, Avalanche, Gnosis, Unichain, Tempo, Monad, and World Chain — plus custom
  networks — all at the same address.
- **Readable signing.** Transactions are decoded into human-readable intent
  (ERC-7730) where a descriptor exists; otherwise Vela falls back to best-effort
  decoding and shows a warning. Calls it can't decode are flagged, not hidden.
- **Open source.** The wallet and all its services are
  [public on GitHub](https://github.com/mondaylabsltd/vela-wallet) so anyone can
  audit exactly what they do.
- **Alpha software.** Vela works and holds real funds, but it hasn't had years
  of production hardening. Start with small amounts. The
  [alpha post](/blog/vela-is-in-alpha) explains what that means.

## Who it's for

Vela is built for people who want real self-custody without the footgun of seed
phrase management — and for people who've been burned by it before. If you can
unlock your phone, you can use Vela.

## Where to go next

- [Install Vela](/docs/install) — it runs in your browser, no download needed.
- [Create your wallet](/docs/create-wallet) — your first wallet in about a minute.
- [How passkeys work](/docs/passkeys) — the security model, explained plainly.
- [Whitepaper](/docs/whitepaper) — the full architecture and trust model.

If you're more interested in the *why* than the *how*, the [blog](/blog) tells the
story of how Vela is being built.
