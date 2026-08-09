/**
 * Adding a custom EVM network by chain ID — WEB, through the `network_admin`
 * core.
 *
 * The point of routing this path through the core is invariant ①: today the
 * Settings wizard refuses a chain that is already added and this path does not —
 * the two TypeScript implementations diverged. The core is the single
 * implementation of that gate, and `AddByChainIdRequested` runs the same
 * resolve → probe → verify → save pipeline the wizard runs, so both entry points
 * agree by construction.
 *
 * Nothing here decides anything: it dispatches one event and translates the
 * view transitions the core produces back into `AddNetworkResult`. The session
 * is the shared resident one, so the ledger this gate reads is the same ledger
 * the Settings modal writes.
 */
import type { CustomNetwork } from '@/models/types';
import { chainInfoToCustomNetwork, type AddNetworkResult } from '@/services/add-network-record';
import { getEthereumDataURL } from '@/services/storage';
import type { NetNetworkRow } from '@/services/wallet-state-core/generated/NetNetworkRow';
import type { NetView } from '@/services/wallet-state-core/generated/NetView';
import {
  dispatchNetworkAdmin,
  ensureNetworkAdmin,
  networkAdminView,
  subscribeNetworkAdmin,
} from '@/services/wallet-state-core/network-admin-resident.web';

export { chainInfoToCustomNetwork };
export type { AddNetworkResult };

/**
 * The core drops every mutation until its stores are read (mutating a ledger
 * that is not the ledger would fabricate state), and a dropped event emits no
 * view — so waiting for `loaded` is what keeps this promise from hanging. The
 * read always concludes: an unreadable store still answers, empty.
 */
function whenLoaded(): Promise<void> {
  ensureNetworkAdmin();
  if (networkAdminView().loaded) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const unsubscribe = subscribeNetworkAdmin((view) => {
      if (!view.loaded) return;
      unsubscribe();
      resolve();
    });
  });
}

function toCustomNetwork(row: NetNetworkRow, addedAt: string): CustomNetwork {
  return {
    id: row.id,
    displayName: row.display_name,
    chainId: row.chain_id,
    // The icon policy the core's `build_custom_network` applied to this record.
    iconLabel: row.native_symbol.slice(0, 4),
    iconColor: '#888888',
    iconBg: '#F0F0F0',
    logoURL: `${getEthereumDataURL()}/chainlogos/eip155-${row.chain_id}.png`,
    isL2: false,
    rpcURL: row.rpc_url,
    explorerURL: row.explorer_url,
    bundlerURL: row.bundler_url,
    nativeSymbol: row.native_symbol,
    addedAt,
  };
}

function savedRow(view: NetView, chainId: number): NetNetworkRow | undefined {
  return view.networks.find((row) => row.chain_id === chainId && row.is_custom);
}

export async function addCustomNetworkByChainId(chainId: number): Promise<AddNetworkResult> {
  await whenLoaded();
  const nowIso = new Date().toISOString();

  return new Promise<AddNetworkResult>((resolve) => {
    const unsubscribe = subscribeNetworkAdmin((view) => {
      const wizard = view.wizard;

      if (wizard.phase === 'error' && wizard.error) {
        unsubscribe();
        switch (wizard.error.type) {
          case 'not_found':
            resolve({ ok: false, reason: 'not-found' });
            return;
          case 'already_added': {
            // The gate this path never had. The chain is present either way, so
            // the caller's "retry now that it exists" is the honest answer; a
            // built-in chain is present too and simply has no custom record.
            const row = savedRow(view, chainId);
            resolve(
              row
                ? { ok: true, network: toCustomNetwork(row, nowIso) }
                : { ok: false, reason: 'not-compatible' },
            );
            return;
          }
          default:
            // `not_compatible`, and `no_rpc_endpoint` which the auto path cannot
            // reach. The core does not project the per-contract verdict on this
            // path, so the caller words the failure itself.
            resolve({ ok: false, reason: 'not-compatible' });
            return;
        }
      }

      // Success: the wizard resets to idle and the record joins the ledger.
      if (wizard.phase === 'idle') {
        const row = savedRow(view, chainId);
        if (row) {
          unsubscribe();
          resolve({ ok: true, network: toCustomNetwork(row, nowIso) });
        }
      }
    });

    dispatchNetworkAdmin({
      type: 'add_by_chain_id_requested',
      chain_id: chainId,
      now_iso: nowIso,
    });
  });
}
