/**
 * The RPC recovery banner's save step — NATIVE.
 *
 * Lifted verbatim out of `RpcTroubleBanner.tsx`'s `handleSave`: probe the pasted
 * URL, refuse it if it cannot be reached OR if it names another chain, otherwise
 * write the override (preserving the explorer/bundler the user may have
 * customised in Settings) and flush the chain's pool.
 *
 * It stays verbatim on purpose. Hermes has no WebAssembly, so the `network_admin`
 * core cannot run here (FR-202) and there is no single-writer ledger to route
 * through; changing the gate on this side would change shipped mobile behaviour
 * with nothing to back it. `rpc-fix.web.ts` is the web twin, where the core owns
 * both the gate and the write.
 */

import { getAllNetworksSync } from '@/models/network';
import { probeRpcChainId, refreshPool } from '@/services/rpc-pool';
import { getNetworkConfig, saveNetworkConfig } from '@/services/storage';

import type { RpcFixOutcome } from './rpc-fix-types';

export type { RpcFixOutcome };

export async function saveRpcFix(chainId: number, url: string): Promise<RpcFixOutcome> {
  try {
    // Validate before saving — a recovery flow that cheerfully stores a dead or
    // wrong-chain URL (and reports "saved") is worse than no validation at all.
    const reportedChainId = await probeRpcChainId(url);
    if (reportedChainId === null) return { kind: 'unreachable' };
    if (reportedChainId !== chainId) {
      return { kind: 'wrong-chain', expected: chainId, actual: reportedChainId };
    }
    // Preserve any explorer/bundler the user already customized in Settings:
    // saveNetworkConfig replaces the whole entry by chainId, so falling back to
    // the built-in defaults here would silently clobber those overrides.
    const saved = await getNetworkConfig(chainId);
    const net = getAllNetworksSync().find((n) => n.chainId === chainId);
    await saveNetworkConfig({
      chainId,
      rpcURL: url,
      explorerURL: saved?.explorerURL ?? net?.explorerURL ?? '',
      bundlerURL: saved?.bundlerURL ?? net?.bundlerURL ?? '',
    });
    await refreshPool(chainId);
    return { kind: 'saved' };
  } catch {
    return { kind: 'failed' };
  }
}
