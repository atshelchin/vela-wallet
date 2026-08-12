/**
 * Adding a custom EVM network by chain ID — NATIVE.
 *
 * Factors the ChainInfo → CustomNetwork conversion + persistence shared by the
 * "Add network" tab in AddTokenPanel and the EIP-681 scan recovery flow in
 * SendScreen (when a scanned request names a network Vela doesn't yet support).
 *
 * `add-network.web.ts` is the web twin: there this flow runs through the
 * `network_admin` core, so the scan path and the Settings wizard share ONE
 * duplicate-chain gate (the two TypeScript implementations had diverged — this
 * one never checked). Native behaviour below is unchanged.
 */
import { refreshCustomNetworks } from '@/models/network';
import type { CompatibilityResult } from '@/models/types';
import { chainInfoToCustomNetwork, type AddNetworkResult } from '@/services/add-network-record';
import { fetchChainInfo } from '@/services/chain-registry';
import { checkNetworkCompatibility } from '@/services/network-checker';
import { saveCustomNetwork } from '@/services/storage';

export { chainInfoToCustomNetwork };
export type { AddNetworkResult };

/**
 * Resolve a chain ID against the chain registry, verify ERC-4337 / P256
 * compatibility, and persist it as a custom network. Refreshes the in-memory
 * network cache so synchronous lookups (networkForChainId) see it immediately.
 */
export async function addCustomNetworkByChainId(chainId: number): Promise<AddNetworkResult> {
  const info = await fetchChainInfo(chainId);
  if (!info) return { ok: false, reason: 'not-found' };

  const compat: CompatibilityResult = await checkNetworkCompatibility(info.rpcUrls, chainId);
  if (!compat.compatible) return { ok: false, reason: 'not-compatible', error: compat.error };

  const network = chainInfoToCustomNetwork(info, compat.bestRpcUrl);
  await saveCustomNetwork(network);
  await refreshCustomNetworks();
  return { ok: true, network };
}
