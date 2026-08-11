/**
 * The RPC recovery banner's save step — WEB, decided by the `network_admin`
 * core (spec 017, `rust/crates/vela-core/src/app/network_admin.rs`).
 *
 * Two things were wrong with doing this in the component, and routing the write
 * through the core's existing override path fixes both at once:
 *
 * 1. **The gate was the shell's, and it was the wrong gate.** The component
 *    probed the pasted URL itself and refused the save when the probe came back
 *    `null`. `null` is not "this endpoint is wrong", it is "we could not tell" —
 *    a CORS rejection, a timeout, a captive portal. The core's rule
 *    (`network_admin::resolve_override_save`) refuses only a CONFIRMED mismatch
 *    and saves everything else, which is the discipline the compatibility
 *    checker already follows: an unreachable chain gets a Retry, never a
 *    condemnation. The old behaviour was worst exactly where this screen is
 *    reached from — the user is here BECAUSE the default endpoint is dead, and
 *    a replacement that cannot be probed from a browser tab (very common on web)
 *    was refused, leaving them pinned to the broken endpoint with no way out.
 *
 * 2. **It was a second writer to `vela.networkConfig`.** `saveNetworkConfig`
 *    from here wrote behind the core's back: `override_cards` never saw the new
 *    URL, so the Settings card kept showing — and could re-save — the old one.
 *    Now there is one writer, and the banner and the Settings editor are two
 *    views of the same ledger.
 *
 * Nothing here decides anything. It hands the core the URL and reports the
 * verdict the core reached, and the "still deciding" state is the core's own
 * `rpc_save_deferred` — read from the view, never a flag this module keeps. That
 * matters: a latch owned here would need its own reset, and a save that is owed
 * to a probe still in flight has more than one way to conclude.
 */

import type { NetNetworkRow } from '@/services/wallet-state-core/generated/NetNetworkRow';
import type { NetView } from '@/services/wallet-state-core/generated/NetView';
import {
  dispatchNetworkAdmin,
  ensureNetworkAdmin,
  networkAdminView,
  subscribeNetworkAdmin,
} from '@/services/wallet-state-core/network-admin-resident.web';

import type { RpcFixOutcome } from './rpc-fix-types';

export type { RpcFixOutcome };

function rowFor(view: NetView, chainId: number): NetNetworkRow | undefined {
  return view.networks.find((row) => row.chain_id === chainId);
}

/**
 * The verdict a row carries, or `null` while the core is still deciding.
 *
 * Pure, and the only place the three-way read of a row happens. Call it ONLY
 * after the blur has been dispatched: before that a row reads exactly like a
 * completed save (nothing deferred, no mismatch), which is the one way this
 * could answer too early.
 */
export function rpcFixVerdict(row: NetNetworkRow | undefined): RpcFixOutcome | null {
  // The chain has no card — `override_expanded` refused it (unknown chain, or
  // the store had not loaded). Nothing was dispatched at it, so nothing saved.
  if (!row || row.rpc_health === null) return { kind: 'failed' };
  // A blur is owed to a chain-id probe that has not answered. Not a verdict yet.
  if (row.rpc_save_deferred) return null;
  if (row.rpc_chain_mismatch !== null) {
    return {
      kind: 'wrong-chain',
      expected: row.rpc_chain_mismatch.expected_chain_id,
      actual: row.rpc_chain_mismatch.reported_chain_id,
    };
  }
  return { kind: 'saved' };
}

/** Resolve on the first view satisfying `ready` (checking the current one first). */
function whenView<T>(ready: (view: NetView) => T | null): Promise<T> {
  const immediate = ready(networkAdminView());
  if (immediate !== null) return Promise.resolve(immediate);
  return new Promise<T>((resolve) => {
    const unsubscribe = subscribeNetworkAdmin((view) => {
      const answer = ready(view);
      if (answer === null) return;
      unsubscribe();
      resolve(answer);
    });
  });
}

export async function saveRpcFix(chainId: number, url: string): Promise<RpcFixOutcome> {
  try {
    ensureNetworkAdmin();
    // The core drops override writes until the four stores are read — mutating a
    // ledger that is not yet the ledger would fabricate state. `read_store`
    // always answers (its failure variant reads as "nothing configured"), so
    // this settles either way.
    await whenView((view) => (view.loaded ? true : null));

    // Seed the card if the Settings editor has not already; a card that exists
    // keeps its drafts, which is what makes this the same single ledger.
    dispatchNetworkAdmin({ type: 'override_expanded', chain_id: chainId });
    if (rowFor(networkAdminView(), chainId)?.rpc_health == null) return { kind: 'failed' };

    dispatchNetworkAdmin({
      type: 'override_field_edited',
      chain_id: chainId,
      field: 'rpc',
      value: url,
    });
    // Every dispatch above committed a view synchronously, so from here the row
    // is describing THIS save.
    dispatchNetworkAdmin({ type: 'override_blurred', chain_id: chainId });

    return await whenView((view) => rpcFixVerdict(rowFor(view, chainId)));
  } catch {
    return { kind: 'failed' };
  }
}
