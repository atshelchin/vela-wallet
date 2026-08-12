/**
 * The "Add network" tab of `AddTokenPanel` — WEB, driven by the portable Rust
 * state machine (spec 017, `rust/crates/vela-core/src/app/network_admin.rs`).
 *
 * This file owns no rules. Until it existed the panel ran its OWN wizard —
 * `checkNetworkCompatibility` + `saveCustomNetwork` called straight from the
 * component (AddTokenPanel.tsx:87 and :103) — while `network_admin` ran the
 * Settings wizard and the EIP-681 scan path. Two implementations of "may this
 * chain enter the wallet" on the same platform is exactly the failure the
 * inventory names: the panel's copy had no invariant-④ discipline and no shared
 * ledger, so a chain could be added here that the core would have refused.
 *
 * Everything is now the core's: the 300 ms search debounce, the ranking, the
 * duplicate gate, the RPC candidate assembly, the fastest-endpoint race, the
 * eleven-contract + RIP-7212 verdict and the saved record's shape.
 *
 * Two things stay here, both shell concerns:
 *
 * - the **added card**: `AddConfirmed` resets the wizard (that is the modal's
 *   `onAdded(); reset(); onClose();` tail), but the panel is not a modal — it
 *   stays open and shows "Network added" on the card it just saved. The last
 *   resolved chain/verdict is therefore snapshotted here, in component state,
 *   the moment the core reports the save.
 * - the **RPC draft's emptiness**: the core's `custom_rpc` starts empty and the
 *   field renders the resolved URL, so "has the user touched it" is the shell's
 *   to remember — without it, clearing the box would spring the original URL
 *   back into it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import type { CompatibilityResult } from '@/models/types';
import { hapticSuccess } from '@/services/platform';
import {
  dispatchNetworkAdmin as dispatch,
  ensureNetworkAdmin,
  networkAdminView,
  subscribeNetworkAdmin,
} from '@/services/wallet-state-core/network-admin-resident.web';
import type { NetView } from '@/services/wallet-state-core/generated/NetView';

import type {
  AddNetworkTabChainInfo,
  AddNetworkTabController,
  AddNetworkTabError,
} from './add-network-tab-types';
import { toCompatibilityResult } from './use-network-admin.web';

/** What the panel keeps rendering after the core has reset the wizard. */
type Saved = { chainInfo: AddNetworkTabChainInfo; compat: CompatibilityResult };

function toChainInfo(
  wizard: NetView['wizard'],
  rpcDraft: string | null,
): AddNetworkTabChainInfo | null {
  const info = wizard.chain_info;
  if (!info) return null;
  return {
    chainId: info.chain_id,
    name: info.name,
    nativeSymbol: info.native_symbol,
    nativeDecimals: info.native_decimals,
    explorerURL: info.explorer_url,
    rpcURL: rpcDraft ?? info.rpc_url,
  };
}

function toError(wizard: NetView['wizard'], compat: CompatibilityResult | null): AddNetworkTabError | null {
  if (wizard.error) {
    switch (wizard.error.type) {
      case 'already_added':
        return { kind: 'already_added' };
      case 'not_found':
        return { kind: 'chain_not_found' };
      case 'no_rpc_endpoint':
        // The TypeScript panel reached this through the checker, which words it
        // exactly this way; kept byte-for-byte.
        return { kind: 'message', text: 'No valid HTTPS RPC endpoints available' };
      case 'not_compatible':
        // Scan-path only — this controller never drives an `auto` wizard.
        return { kind: 'not_compatible' };
    }
  }
  if (compat && !compat.compatible) return { kind: 'not_compatible', detail: compat.error };
  return null;
}

export function useAddNetworkTab(onChanged?: () => void): AddNetworkTabController {
  const [view, setView] = useState<NetView>(() => networkAdminView());
  // `null` = untouched, so the field shows the resolved URL.
  const [rpcDraft, setRpcDraft] = useState<string | null>(null);
  const [saved, setSaved] = useState<Saved | null>(null);

  const changed = useRef(onChanged);
  changed.current = onChanged;

  useEffect(() => {
    const unsubscribe = subscribeNetworkAdmin(setView);
    ensureNetworkAdmin();
    // The wizard is resident and shared with the Settings modal; the panel opens
    // on a clean form, as its own local state always did.
    dispatch({ type: 'wizard_reset' });
    setView(networkAdminView());
    return unsubscribe;
  }, []);

  const wizard = view.wizard;
  const compat = wizard.compat ? toCompatibilityResult(wizard.compat) : null;

  // The save landed: keep the card the panel was showing, and fire the same
  // haptic + refresh the TypeScript path fired.
  const pending = useRef<Saved | null>(null);
  const lastAdded = useRef<number | null>(view.last_added_chain_id);
  useEffect(() => {
    if (view.last_added_chain_id === lastAdded.current) return;
    lastAdded.current = view.last_added_chain_id;
    if (view.last_added_chain_id === null || !pending.current) return;
    if (pending.current.chainInfo.chainId !== view.last_added_chain_id) return;
    setSaved(pending.current);
    pending.current = null;
    hapticSuccess();
    changed.current?.();
  }, [view.last_added_chain_id]);

  const search = useCallback((text: string) => {
    setRpcDraft(null);
    setSaved(null);
    dispatch({ type: 'search_input', query: text });
  }, []);

  const select = useCallback((chainId: number) => {
    setRpcDraft(null);
    setSaved(null);
    dispatch({ type: 'chain_selected', chain_id: chainId, keep_custom_rpc: false });
  }, []);

  const setRpcURL = useCallback((value: string) => {
    setRpcDraft(value);
    dispatch({ type: 'custom_rpc_edited', value });
  }, []);

  const add = useCallback(() => {
    const info = toChainInfo(networkAdminView().wizard, null);
    const verdict = networkAdminView().wizard.compat;
    if (!info || !verdict) return;
    pending.current = { chainInfo: info, compat: toCompatibilityResult(verdict) };
    dispatch({ type: 'add_confirmed', now_iso: new Date().toISOString() });
  }, []);

  return {
    query: wizard.query,
    // The panel has always shown at most eight rows of the ranked list.
    suggestions: wizard.suggestions.slice(0, 8).map((s) => ({ chainId: s.chain_id, name: s.name })),
    searching: wizard.phase === 'searching',
    loading: wizard.phase === 'resolving' || wizard.phase === 'checking',
    // The core's save is a ledger write followed by a best-effort persist, so
    // there is no window to spin through.
    saving: false,
    error: saved ? null : toError(wizard, compat),
    chainInfo: saved ? saved.chainInfo : toChainInfo(wizard, rpcDraft),
    compat: saved ? saved.compat : compat,
    added: saved !== null,
    search,
    select,
    setRpcURL,
    add,
  };
}
