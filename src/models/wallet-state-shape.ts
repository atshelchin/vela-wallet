/**
 * The wallet context's SHAPE — every part of `@/models/wallet-state` that is
 * the same on every platform: the state type, the action vocabulary, the pure
 * reducer, the React context, `useWallet()` and `shortAddress()`.
 *
 * Split out of `wallet-state.ts` in the platform-pair days: the provider is
 * driven by the Rust `session` machine
 * (`rust/crates/vela-core/src/app/session.rs`) instead of the reducer + two
 * effects, and the pair's `.web` half could NEVER
 * value-import its own base file (Metro resolves that specifier back to itself
 * and the module recurses at init, taking the whole app down; learned in 016).
 * Both platform variants import this neutral module instead, so there is
 * exactly ONE `WalletContext` object in any bundle and `useWallet()` is
 * literally the same function on both.
 *
 * Nothing here touches storage, the network or the wasm — it is the pure half,
 * and the jest suite (`__tests__/models/wallet-state.test.ts`) still reaches it
 * through `@/models/wallet-state`'s re-export.
 */
import { createContext, useContext, type Dispatch } from 'react';
import type { Account } from './types';

// MARK: - State Shape

export interface WalletState {
  hasWallet: boolean;
  address: string;
  isConnectedToBrowser: boolean;
  accounts: Account[];
  activeAccountIndex: number;
  /** True until storage has been read on startup. */
  isLoading: boolean;
}

export const INITIAL_STATE: WalletState = {
  hasWallet: false,
  address: '',
  isConnectedToBrowser: false,
  accounts: [],
  activeAccountIndex: 0,
  isLoading: true,
};

// MARK: - Actions

export type WalletAction =
  | { type: 'SET_WALLET'; accounts: Account[]; activeIndex?: number }
  | { type: 'ADD_ACCOUNT'; account: Account }
  | { type: 'SWITCH_ACCOUNT'; index: number }
  | { type: 'SET_CONNECTED'; connected: boolean }
  | { type: 'LOADED_EMPTY' }
  | { type: 'LOGOUT' };

export function walletReducer(state: WalletState, action: WalletAction): WalletState {
  switch (action.type) {
    case 'SET_WALLET': {
      const idx = action.activeIndex ?? 0;
      const account = action.accounts[idx];
      return {
        ...state,
        hasWallet: action.accounts.length > 0,
        accounts: action.accounts,
        activeAccountIndex: idx,
        address: account?.address ?? '',
        isLoading: false,
      };
    }
    case 'ADD_ACCOUNT': {
      const accounts = [...state.accounts, action.account];
      const idx = accounts.length - 1;
      return {
        ...state,
        hasWallet: true,
        accounts,
        activeAccountIndex: idx,
        address: action.account.address,
        isLoading: false,
      };
    }
    case 'SWITCH_ACCOUNT': {
      const account = state.accounts[action.index];
      if (!account) return state;
      return {
        ...state,
        activeAccountIndex: action.index,
        address: account.address,
      };
    }
    case 'SET_CONNECTED':
      return { ...state, isConnectedToBrowser: action.connected };
    case 'LOADED_EMPTY':
      return { ...state, isLoading: false };
    case 'LOGOUT':
      return { ...INITIAL_STATE, isLoading: false };
    default:
      return state;
  }
}

// MARK: - Context

export interface WalletContextValue {
  state: WalletState;
  dispatch: Dispatch<WalletAction>;
  activeAccount: Account | undefined;
}

export const WalletContext = createContext<WalletContextValue>({
  state: INITIAL_STATE,
  dispatch: () => {},
  activeAccount: undefined,
});

export function useWallet(): WalletContextValue {
  return useContext(WalletContext);
}

// MARK: - Utility

/** Shorten an address to "0x1234...abcd". */
export function shortAddress(address: string): string {
  if (address.length <= 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
