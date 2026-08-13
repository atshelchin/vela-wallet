/**
 * Manual custom-token management — WEB, driven by the portable Rust state
 * machine (spec 017, `rust/crates/vela-core/src/app/manage_tokens.rs`).
 *
 * This file owns no rules. It builds one core session per mounted panel,
 * forwards keystrokes/taps as events, and renders whatever the core projects.
 * The dedupe key, the `!name || !symbol` admission gate, the fresh
 * read-before-write and the cache-invalidation decision are decided (and
 * tested) in Rust.
 *
 * Two things stay here because they are shell concerns:
 *
 * - the **network registry snapshot**: `getAllNetworksSync()` is the shell's
 *   (defaults + custom networks), so it rides on `detect_requested` rather
 *   than being reachable from the core;
 * - the **alerts**: `not_found` and `save_error` are one-shot alert flags in
 *   the view, so this fires `showAlert` on their rising edge only. The copy is
 *   byte-identical to the panel's.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getAllNetworksSync } from '@/models/network';
import { useWallet } from '@/models/wallet-state';
import { showAlert } from '@/services/platform';
import { createManageTokensSession } from '@/services/wallet-state-core/manage-tokens-session';
import type { MtokNetwork } from '@/services/wallet-state-core/generated/MtokNetwork';
import type { MtokView } from '@/services/wallet-state-core/generated/MtokView';

import type { ManageTokensController } from './manage-tokens-controller-types';

const EMPTY: MtokView = {
  input_address: '',
  address_valid: false,
  detecting: false,
  found: [],
  saving: false,
  custom_tokens: [],
  not_found: false,
  save_error: false,
};

/**
 * The registry as the core's `u32` chain id can carry it. Wire
 * representability only — a row that cannot be serialised would make the
 * `detect_requested` dispatch throw and the button do nothing at all.
 */
function networkSnapshot(): MtokNetwork[] {
  const out: MtokNetwork[] = [];
  for (const network of getAllNetworksSync()) {
    if (!Number.isInteger(network.chainId) || network.chainId < 0 || network.chainId > 4_294_967_295) {
      continue;
    }
    out.push({ chain_id: network.chainId, name: network.displayName });
  }
  return out;
}

export function useManageTokens(onChanged?: () => void): ManageTokensController {
  const { t } = useTranslation();
  const { state } = useWallet();
  const [view, setView] = useState<MtokView>(EMPTY);
  const session = useRef<ReturnType<typeof createManageTokensSession> | null>(null);

  // Read through refs so the session outlives an account switch or a new
  // `onChanged` identity — rebuilding it would wipe the form mid-flow.
  const account = useRef(state.address);
  account.current = state.address;
  const changed = useRef(onChanged);
  changed.current = onChanged;

  useEffect(() => {
    const loop = createManageTokensSession({
      account: () => account.current,
      onInvalidated: () => changed.current?.(),
      onView: setView,
      onError: (error) => console.error('[manage-tokens] core fault:', error),
    });
    session.current = loop;
    loop.start({ type: 'start' });
    // Also covers React 19 StrictMode's development double-mount: the first
    // core is freed before the second is built.
    return () => {
      loop.dispose();
      session.current = null;
    };
  }, []);

  // One-shot alerts, on the rising edge. The core clears each flag on the next
  // input or probe, which re-arms the edge exactly as re-tapping does today.
  const alerted = useRef({ notFound: false, saveError: false });
  useEffect(() => {
    if (view.not_found && !alerted.current.notFound) {
      showAlert(t('addToken.notFoundTitle'), t('addToken.notFoundMessage'));
    }
    alerted.current.notFound = view.not_found;
  }, [view.not_found, t]);
  useEffect(() => {
    if (view.save_error && !alerted.current.saveError) {
      showAlert(t('addToken.errorTitle'), t('addToken.errorSaveToken'));
    }
    alerted.current.saveError = view.save_error;
  }, [view.save_error, t]);

  const setAddress = useCallback((value: string) => {
    session.current?.dispatch({ type: 'address_input', s: value });
  }, []);

  const detect = useCallback(() => {
    session.current?.dispatch({ type: 'detect_requested', networks: networkSnapshot() });
  }, []);

  const save = useCallback((chainId: number) => {
    session.current?.dispatch({ type: 'save_requested', chain_id: chainId });
  }, []);

  const remove = useCallback((id: string) => {
    session.current?.dispatch({ type: 'delete_requested', id });
  }, []);

  const found = useMemo(
    () =>
      view.found.map((card) => ({
        chainId: card.chain_id,
        networkName: card.network_name,
        name: card.name,
        symbol: card.symbol,
        decimals: card.decimals,
        added: card.added,
      })),
    [view.found],
  );

  const customTokens = useMemo(
    () =>
      view.custom_tokens.map((token) => ({
        id: token.id,
        chainId: token.chain_id,
        contractAddress: token.contract_address,
        symbol: token.symbol,
        name: token.name,
        decimals: token.decimals,
        networkName: token.network_name,
      })),
    [view.custom_tokens],
  );

  return {
    address: view.input_address,
    setAddress,
    addressValid: view.address_valid,
    detecting: view.detecting,
    detect,
    found,
    saving: view.saving,
    save,
    customTokens,
    remove,
  };
}
