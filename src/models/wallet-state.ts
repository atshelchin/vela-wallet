/**
 * Wallet state management using React Context — NATIVE.
 * Matches iOS WalletState.swift.
 *
 * The shape (state type, actions, reducer, context, `useWallet`,
 * `shortAddress`) lives in `wallet-state-shape.ts` and is re-exported here, so
 * every existing `@/models/wallet-state` import is unchanged. What is
 * platform-specific is exactly the provider: this one runs the reducer plus its
 * two effects (startup restore + index persistence); on web
 * (`wallet-state.web.ts`) the same three values come out of the Rust `session`
 * machine instead. Native behaviour below is byte-for-byte what it was.
 */
import { computeAddress } from '@/services/vela-core';
import React, { useReducer, useEffect } from 'react';
import { loadAccounts, saveAccount, loadActiveAccountIndex, saveActiveAccountIndex } from '@/services/storage';
import {
  INITIAL_STATE,
  WalletContext,
  walletReducer,
} from './wallet-state-shape';

export {
  INITIAL_STATE,
  WalletContext,
  walletReducer,
  useWallet,
  shortAddress,
} from './wallet-state-shape';
export type { WalletState, WalletAction, WalletContextValue } from './wallet-state-shape';

// MARK: - Provider Component

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(walletReducer, INITIAL_STATE);
  const activeAccount = state.accounts[state.activeAccountIndex];

  // Restore wallet state from storage on mount, fixing any bad addresses
  useEffect(() => {
    Promise.all([loadAccounts(), loadActiveAccountIndex()])
      .then(async ([accounts, savedIndex]) => {
        if (accounts.length > 0) {
          // Migrate: fix accounts that have credentialId as address
          for (const acct of accounts) {
            if (!acct.publicKeyHex) continue;
            try {
              const correct = computeAddress(acct.publicKeyHex);
              if (acct.address !== correct) {
                console.log(`[wallet] Migrating address for ${acct.name}: ${acct.address.slice(0, 10)} → ${correct.slice(0, 10)}`);
                acct.address = correct;
                await saveAccount(acct);
              }
            } catch (err) {
              console.error(`[wallet] Address migration failed for ${acct.name}:`, err);
              // Keep existing address rather than corrupting storage
            }
          }
          // Clamp saved index to valid range
          const activeIndex = savedIndex < accounts.length ? savedIndex : 0;
          dispatch({ type: 'SET_WALLET', accounts, activeIndex });
        } else {
          dispatch({ type: 'LOADED_EMPTY' });
        }
      })
      .catch(() => {
        dispatch({ type: 'LOADED_EMPTY' });
      });
  }, []);

  // Persist active account index whenever it changes
  useEffect(() => {
    if (!state.isLoading && state.hasWallet) {
      saveActiveAccountIndex(state.activeAccountIndex);
    }
  }, [state.activeAccountIndex, state.isLoading, state.hasWallet]);

  const value = React.useMemo(
    () => ({ state, dispatch, activeAccount }),
    [state, activeAccount],
  );

  return React.createElement(WalletContext.Provider, { value }, children);
}
