/**
 * Wallet state — WEB, driven by the portable Rust state machine
 * (spec 017, `rust/crates/vela-core/src/app/session.rs`).
 *
 * This file owns no rules. The reducer's six cases, the startup restore with
 * its address migration and index clamp, and the "never persist while loading"
 * guard are all in Rust now; what is left here is a projection of the core's
 * `SessionView` onto the exact `WalletState` shape the app has always read, and
 * a translation of the action vocabulary onto the core's events.
 *
 * The contract this file must not break: `useWallet()` is read SYNCHRONOUSLY by
 * dozens of components (`state.hasWallet`, `state.address`, `activeAccount`),
 * and after a JSON boundary views arrive asynchronously. So:
 *
 * - The session is app-resident (`session-resident.ts`), booted once per
 *   process, and its view is mirrored into local state — the 016
 *   `use-display-currency.ts` pattern.
 * - The first frame is `INITIAL_STATE` field for field, because the core's own
 *   pristine projection is (loading, no wallet, empty address).
 * - The mirrored view object only changes when the session actually changed
 *   (the resident drops equal views), so `state.accounts` / `activeAccount`
 *   keep the reference stability every `useEffect` dependency list assumes.
 *
 * `SET_CONNECTED` stays shell-side: the core declares the browser connection
 * out of scope on purpose (it belongs to the dapp-connection machine), so the
 * flag is local state here — the same nothing it has been, since no live call
 * site dispatches it.
 *
 * Imports of the shape module are deliberate: a `.ts` must NEVER
 * value-import its own base file (Metro resolves it back to itself).
 */
import React, { useCallback, useEffect, useMemo, useState, type Dispatch } from 'react';

import {
  WalletContext,
  type WalletAction,
  type WalletState,
} from './wallet-state-shape';
import {
  dispatchWalletSession,
  ensureWalletSession,
  subscribeWalletSession,
  walletSessionAccounts,
  walletSessionView,
} from '@/services/wallet-state-core/session-resident';
import { toCoreAccount } from '@/services/wallet-state-core/session-executor';
import type { SessionView } from '@/services/wallet-state-core/generated/SessionView';
import type { StoredAccount } from '@/models/types';

export {
  INITIAL_STATE,
  WalletContext,
  walletReducer,
  useWallet,
  shortAddress,
} from './wallet-state-shape';
export type { WalletState, WalletAction, WalletContextValue } from './wallet-state-shape';

/**
 * A non-negative safe integer, or nothing. `SwitchAccount.index` and
 * `CompletionMode::SetWallet.active_index` are `usize` on the wire: a negative
 * would be a serde fault (a core-level error, not a user one), and the TS
 * reducer treated a negative index as the same no-op an out-of-range one is —
 * so it fails closed here instead of crossing.
 */
function wireIndex(index: number): number | null {
  return Number.isSafeInteger(index) && index >= 0 ? index : null;
}

// MARK: - Provider Component

export function WalletProvider({ children }: { children: React.ReactNode }) {
  // View AND its projected accounts in ONE state cell. Reading the projection
  // from the resident during render made it invisible to React Compiler, which
  // cached the first (empty) result while `address` kept updating — an
  // account-less wallet that still showed an address.
  const [snapshot, setSnapshot] = useState<{ view: SessionView; accounts: StoredAccount[] }>(
    () => ({ view: walletSessionView(), accounts: walletSessionAccounts() }),
  );
  const view = snapshot.view;
  // Out of the core's scope by design — see the header note.
  const [isConnectedToBrowser, setConnected] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeWalletSession((nextView, nextAccounts) => {
      setSnapshot({ view: nextView, accounts: nextAccounts });
    });
    // Boots the restore on first mount; inert on every later one (the session
    // outlives this component, and the core makes a second Boot inert too).
    ensureWalletSession();
    // Catch up on anything committed between the initial render and here.
    setSnapshot({ view: walletSessionView(), accounts: walletSessionAccounts() });
    return unsubscribe;
  }, []);

  const dispatch = useCallback<Dispatch<WalletAction>>((action) => {
    switch (action.type) {
      case 'SET_WALLET': {
        // The onboarding hand-off, forwarded whole: `CompletionMode` is the one
        // vocabulary the create_wallet / login machines already speak, and the
        // session core unifies SET_WALLET and ADD_ACCOUNT behind it.
        const active = wireIndex(action.activeIndex ?? 0) ?? 0;
        dispatchWalletSession({
          type: 'account_established',
          mode: {
            type: 'set_wallet',
            accounts: action.accounts.map(toCoreAccount),
            active_index: active,
          },
        });
        return;
      }
      case 'ADD_ACCOUNT':
        dispatchWalletSession({
          type: 'account_established',
          mode: { type: 'add_account', account: toCoreAccount(action.account) },
        });
        return;
      case 'SWITCH_ACCOUNT': {
        const index = wireIndex(action.index);
        // Out of range is a WHOLE no-op in the core too (invariant ①).
        if (index === null) return;
        dispatchWalletSession({ type: 'switch_account', index });
        return;
      }
      case 'SET_CONNECTED':
        setConnected(action.connected);
        return;
      case 'LOADED_EMPTY':
        // The restore outcome is the core's to decide; nothing dispatches this.
        return;
      case 'LOGOUT':
        // Effective only while the confirm dialog the core opened is up, which
        // is exactly where the settings screen calls it from (invariant ⑤ —
        // there is no unwarned logout path). Memory-only, as today.
        dispatchWalletSession({ type: 'sign_out_confirmed' });
        return;
    }
  }, []);

  const state = useMemo<WalletState>(
    () => ({
      hasWallet: view.has_wallet,
      // Derived in the core from `accounts[active_index]`, so it can never
      // disagree with the active account (invariant ①).
      address: view.address,
      isConnectedToBrowser,
      // The rows arrive in original order carrying their original index
      // (invariant ⑦), so position === `row.index` and the switcher's
      // `sortAccountsByBalance` still hands back exactly what SWITCH_ACCOUNT
      // expects after a balance reorder. Reference-stable while the accounts
      // themselves are unchanged, so switching the active account does not
      // invalidate every `[state.accounts]` dependency — the reducer's
      // `SWITCH_ACCOUNT` kept the same array too.
      accounts: snapshot.accounts,
      activeAccountIndex: view.active_index,
      isLoading: view.loading,
    }),
    [view, isConnectedToBrowser],
  );

  const activeAccount = state.accounts[state.activeAccountIndex];

  const value = React.useMemo(
    () => ({ state, dispatch, activeAccount }),
    [state, dispatch, activeAccount],
  );

  return React.createElement(WalletContext.Provider, { value }, children);
}
