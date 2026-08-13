/**
 * The ChainInfo → CustomNetwork conversion, and the result vocabulary of
 * "add a network by chain id".
 *
 * Split out of `add-network.ts` in the platform-pair days, when its `.web`
 * half (which routes the scan path through the `network_admin` core, so it
 * shares the wizard's duplicate-chain gate) could not import its own base
 * file. The pair is gone; the leaf stays, so `chainInfoToCustomNetwork` is a
 * single implementation with a stable import path.
 */
import type { CustomNetwork } from '@/models/types';
import type { ChainInfo } from '@/services/chain-registry';
import { getBundlerServiceURL } from '@/services/storage';

/** Convert resolved chain metadata + the chosen RPC into a CustomNetwork record. */
export function chainInfoToCustomNetwork(info: ChainInfo, bestRpcUrl?: string | null): CustomNetwork {
  return {
    id: `custom-${info.chainId}`,
    displayName: info.name,
    chainId: info.chainId,
    iconLabel: (info.nativeCurrency?.symbol ?? 'ETH').slice(0, 4),
    iconColor: '#888888',
    iconBg: '#F0F0F0',
    logoURL: info.logoURL ?? '',
    isL2: false,
    rpcURL: bestRpcUrl ?? info.rpcUrl ?? '',
    explorerURL: info.explorerUrl ?? '',
    bundlerURL: `${getBundlerServiceURL()}/${info.chainId}`,
    nativeSymbol: info.nativeCurrency?.symbol ?? 'ETH',
    addedAt: new Date().toISOString(),
  };
}

export type AddNetworkResult =
  | { ok: true; network: CustomNetwork }
  | { ok: false; reason: 'not-found' | 'not-compatible'; error?: string };
