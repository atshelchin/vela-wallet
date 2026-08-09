/**
 * The simulation preview's asymmetric-trust judgment — NATIVE.
 *
 * Lifted verbatim out of `tx-simulation.ts:218-286` (`trustedReceiveSet` +
 * `enrichDeltas`) so the decision has a platform seam: native keeps this
 * TypeScript, web answers the same question from the `token_trust` core
 * (`sim-trust.web.ts`, spec 017 group G7). Nothing about the rule changed —
 * the same reads, the same order, the same fallbacks, so an iOS/Android
 * preview renders byte-identically to before the split.
 */

import { nativeSymbol } from '@/models/network';
import { fetchChainTokens } from '@/services/chain-tokens';
import { resolveTokenMetadata, type TokenMetadata } from '@/services/token-metadata';
import { knownToken } from '@/services/tokens';
import { getCachedHeldTokens } from '@/services/wallet-api';
import type { AssetDelta } from '@/services/sim-assets';
import type { AssetChange } from '@/services/tx-simulation';

/** Native coins use 18 decimals on every Vela-supported chain. */
const NATIVE_DECIMALS = 18;

/**
 * Per-chain set of token addresses we trust enough to render a *received*
 * amount with confidence:
 *   - the chain's canonical stablecoins + wrapped native (ethereum-data
 *     registry, cached), and
 *   - tokens the user already holds on this chain (read from the token cache).
 * The curated `knownToken` list is consulted separately at decision time.
 * Best-effort — an empty set (registry cold, no holdings) means every received
 * token falls back to unverified, which is the safe direction.
 */
async function trustedReceiveSet(from: string, chainId: number): Promise<Set<string>> {
  const set = new Set<string>();
  try {
    const data = await fetchChainTokens(chainId);
    for (const s of data?.stables ?? []) {
      if (s?.contract) set.add(s.contract.toLowerCase());
    }
    if (data?.wrappedNativeToken) set.add(data.wrappedNativeToken.toLowerCase());
  } catch {
    /* registry unreachable → rely on holdings + knownToken only */
  }
  for (const addr of getCachedHeldTokens(from, chainId)) set.add(addr);
  return set;
}

/**
 * Attach display metadata to raw deltas. Native uses the chain's symbol; ERC-20
 * symbol/decimals are resolved on-chain (batched, cached). Best-effort: a lookup
 * failure never throws.
 *
 * Trust, not just availability: simulation logs are unauthenticated, so a
 * hostile contract can emit a fake `Transfer(_, you, big)` from its own address
 * and even answer `symbol()`/`decimals()` to spoof a gain (a green
 * "+1,000,000 USDC" you never received). An *outflow* can't be understated this
 * way — the real token emits its own log — so sent amounts render whenever
 * metadata resolved. A *received* amount is only rendered with confidence when
 * the token is in the chain's trusted set; otherwise it falls back to the
 * `unverified` treatment (direction + caution, no attacker-controlled amount).
 */
export async function enrichDeltas(
  deltas: AssetDelta[],
  chainId: number,
  from: string,
): Promise<AssetChange[]> {
  const erc20Addrs = deltas
    .filter((d) => d.kind === 'erc20' && d.token)
    .map((d) => d.token as string);

  let meta = new Map<string, TokenMetadata>();
  let trusted = new Set<string>();
  if (erc20Addrs.length > 0) {
    const hasReceive = deltas.some((d) => d.kind === 'erc20' && d.delta > 0n);
    [meta, trusted] = await Promise.all([
      resolveTokenMetadata(chainId, erc20Addrs).catch(() => new Map<string, TokenMetadata>()),
      hasReceive ? trustedReceiveSet(from, chainId) : Promise.resolve(new Set<string>()),
    ]);
  }

  return deltas.map((d): AssetChange => {
    if (d.kind === 'native') {
      return { kind: 'native', delta: d.delta, symbol: nativeSymbol(chainId), decimals: NATIVE_DECIMALS };
    }
    const m = d.token ? meta.get(d.token) : undefined;
    const received = d.delta > 0n;
    // A received token is trustworthy if it's a curated known token, a chain
    // stable/wrapped, or one the user already holds.
    const isTrusted = !!d.token && (trusted.has(d.token) || !!knownToken(d.token));
    const trustworthy = !!m && (!received || isTrusted);
    return trustworthy
      ? { kind: 'erc20', token: d.token, delta: d.delta, symbol: m!.symbol, decimals: m!.decimals }
      : { kind: 'erc20', token: d.token, delta: d.delta, unverified: true };
  });
}
