# Proposal: per-call endpoint chain verification on the read path

Status: **proposed** (needs review). Bundler path already done in
`fix(rpc-pool): verify endpoint chain before handing it to the bundler`.

## Why

The WalletPair Ethereum protocol requires (normative MUST):

> Before an endpoint answers any read call, the implementation MUST confirm that
> a live `eth_chainId` query to that endpoint returns the selected chain; this
> probe result MAY be cached per endpoint and chain, but the cache SHOULD NOT
> exceed a few minutes… A liveness check that discards the returned chain does
> not satisfy this requirement.

`rpc-pool.ts` builds a per-chain endpoint pool from a registry
(`ethereum-data`, treated as untrusted) plus built-ins. A poisoned/misconfigured
registry entry — a valid node that actually serves a **different** chain — would
be admitted to chain `X`'s pool and answer `eth_getBalance` / `eth_call` /
`eth_getTransactionReceipt` with **wrong-chain** state that the dApp trusts.

`pickFastestRpcUrl` (bundler X-Rpc-Url) is now chain-verified. The direct
`poolRpcCall` read path is **not** yet.

## Design

Reuse the existing `probeRpcChainId(url)` and cache the result per endpoint.

```ts
// Per-endpoint cache of the chain a URL was last observed to serve.
const verifiedChainCache = new Map<string, { chainId: number; ts: number }>();
const VERIFY_TTL_MS = POOL_REFRESH_MS; // 10 min (spec: "a few minutes")

type ChainCheck = 'ok' | 'mismatch' | 'unverifiable';

async function ensureEndpointServesChain(url: string, chainId: number): Promise<ChainCheck> {
  const cached = verifiedChainCache.get(url);
  if (cached && Date.now() - cached.ts < VERIFY_TTL_MS) {
    return cached.chainId === chainId ? 'ok' : 'mismatch';
  }
  const reported = await probeRpcChainId(url, PING_TIMEOUT_MS);
  if (reported === null) return 'unverifiable';           // unreachable — fail over, do NOT ban
  verifiedChainCache.set(url, { chainId: reported, ts: Date.now() });
  return reported === chainId ? 'ok' : 'mismatch';
}
```

In `poolRpcCall`'s endpoint loop, verify **before** `tryEndpoint`:

```ts
for (const ep of endpoints) {
  const check = await ensureEndpointServesChain(ep.url, chainId);
  if (check === 'mismatch') {                              // wrong chain = config error → ban
    ep.banned = true; recordFailure(ep); tempBan(ep.url);
    console.warn(`[RPC] ${method} → ${shorten(ep.url)} WRONG CHAIN → banned`);
    continue;
  }
  if (check === 'unverifiable') {                          // probe unreachable → try next, no ban
    recordFailure(ep);
    continue;
  }
  // ...existing tryEndpoint + ban/failover logic unchanged...
}
```

Warm the cache from `pickFastestRpcUrl` (which already probes `eth_chainId`) so a
recent bundler ping avoids a second probe. Clear `verifiedChainCache` in
`invalidateAllPools()` and `refreshPool()` (config change → re-verify).

## Blast radius

- **Tests (~20+ files)** drive `poolRpcCall` with `global.fetch` mocked, mostly
  via blanket `mockResolvedValue(...)`. An added `eth_chainId` probe would be
  consumed by that mock and its (block-number-shaped) result misread as a wrong
  chain → endpoint banned → failures. Each such test needs the probe mocked to
  return the correct chain first (a small `mockChainId(chainId)` helper +
  `mockResolvedValueOnce` before the read, mirroring the change made to the
  canonical `walletpair-extension` `rpc-proxy.test.ts` /
  `background-logic.test.ts`). Affected files include (non-exhaustive):
  `rpc-pool.test.ts`, `rpc-pool-ratelimit.test.ts`, `token-reads.test.ts`,
  `wallet-api-*.test.ts`, `isdeployed-getcode-failure.test.ts`,
  `tx-simulation-assets.test.ts`, `token-metadata.test.ts`.
- **Production**: one extra round-trip per endpoint per `VERIFY_TTL_MS` (cache
  hit otherwise). Cold reads pay probe + call; steady-state reads are cached.

## Rollout

1. Land `ensureEndpointServesChain` + cache + loop integration behind the change.
2. Add a shared `mockChainId` helper and update the affected suites.
3. Add a focused test: a pool endpoint that reports the wrong chain is banned and
   the read fails over (mirror the canonical extension's wrong-chain test).
4. Verify no steady-state latency regression (cache hit path).

Alternative considered: verify at **pool build** (`ensurePool`) so the pool only
holds chain-matched endpoints and the hot path stays probe-free. Smaller
steady-state cost, but does not strictly satisfy "before any read call" if an
endpoint's served chain changes after admission, and still needs pool-init test
updates.
