/**
 * Safari-extension account cache + Universal-Link attestation — WEB, driven by
 * the portable Rust state machine
 * (spec 017, `rust/crates/vela-core/src/app/ext_cache.rs`).
 *
 * This file owns no rules. It reports what the shell can observe — the wallet
 * state, a foreground, a launch URL — and lets the core decide: whether the
 * boot window is still loading (never clear), whether a write or a clear is
 * due, which accounts survive the `{ name, address }` projection, whether a URL
 * is the anchored `getvela.app/sign` Universal Link, and whether the
 * attestation is still inside its 14-day TTL. Every one of those is tested in
 * Rust.
 *
 * On web the whole surface is inert by design: the App Group operations no-op
 * off iOS (`AppGroup.isSupportedSync`), so nothing is written and nothing is
 * rendered. What DOES still run here — the attestation key and the extension
 * sign bus — is exactly what the TypeScript component already ran on every
 * platform, so web behaviour is unchanged.
 */
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import * as Linking from 'expo-linking';

import type { Account } from '@/models/types';
import {
  createExtCacheSession,
  type ExtCacheSession,
} from '@/services/wallet-state-core/ext-cache-session';
import type { Account as CoreAccount } from '@/services/wallet-state-core/generated/Account';
import type { ExtCacheEvent } from '@/services/wallet-state-core/generated/ExtCacheEvent';
import { registerExtCacheEnder } from '@/services/wallet-state-core/session-ext-cache-bridge';

import type { ExtCacheInputs } from './ext-cache-controller-types';

/**
 * The wallet's `Account` in the core's vocabulary. Handed over whole on
 * purpose: invariant ① is structural in Rust (the snapshot's account type IS
 * `{ name, address }`), so pre-trimming here would only hide a regression in
 * the guarantee the core is tested for. `publicKeyHex` lives on `StoredAccount`
 * and never reaches this context, so the key field is empty.
 *
 * Every field is defaulted because `loadAccounts()` is an unvalidated JSON
 * parse of whatever is on disk: a legacy record missing `createdAt` would
 * serialize as an absent key, and serde would reject the whole event as a core
 * fault — silently costing the extension its cache. `|| ''` on the name is also
 * what `buildAccountCache` has always done.
 */
function toCoreAccount(account: Account): CoreAccount {
  return {
    id: account.id ?? '',
    name: account.name || '',
    address: account.address ?? '',
    public_key_hex: '',
    created_at_iso: account.createdAt ?? '',
  };
}

function accountsChanged(input: ExtCacheInputs): ExtCacheEvent {
  return {
    type: 'accounts_changed',
    is_loading: input.isLoading,
    has_wallet: input.hasWallet,
    accounts: input.accounts.map(toCoreAccount),
    active: input.active ? toCoreAccount(input.active) : null,
    // Raw preference string — the core normalizes by strict equality.
    theme: input.theme,
    locale: input.locale,
  };
}

export function useExtCache(input: ExtCacheInputs): void {
  const session = useRef<ExtCacheSession | null>(null);
  const latest = useRef(input);
  latest.current = input;

  // The same primitives the native controller keys its write effect on, so the
  // two platforms report on exactly the same edges.
  const isLoading = input.isLoading;
  const hasWallet = input.hasWallet;
  const address = input.active?.address ?? '';
  const name = input.active?.name ?? '';
  const accounts = input.accounts;
  const theme = input.theme;
  const locale = input.locale;

  // One session for this component's lifetime — it is mounted once, at the
  // root, and outlives every screen. Declared before the reporting effect so
  // that effect (which runs after, on the same mount) always finds it; the
  // core's own first view is diagnostic, so there is nothing to `start`.
  // Disposing on unmount also covers React 19 StrictMode's development
  // double-mount: the first core is freed before the second is built.
  useEffect(() => {
    const loop = createExtCacheSession({
      onView: () => {},
      onError: (error) => console.error('[ext-cache] core fault:', error),
    });
    session.current = loop;
    // The session machine's `ClearExtensionCache` operation lands as this
    // core's `session_ended`. Registered rather than imported so the two cores
    // stay unaware of each other; see `session-ext-cache-bridge.web.ts` for why
    // nothing emits it today.
    registerExtCacheEnder(() => loop.dispatch({ type: 'session_ended' }));
    return () => {
      registerExtCacheEnder(null);
      session.current = null;
      loop.dispose();
    };
  }, []);

  // (a) Report on mount, whenever loading resolves, the account set / active
  //     account changes, OR the theme/language preference changes. The core
  //     rules on which of those means write, clear, or wait.
  useEffect(() => {
    session.current?.dispatch(accountsChanged(latest.current));
  }, [isLoading, hasWallet, address, name, accounts, theme, locale]);

  // (b) Every foreground — §12.1.6: a user who installed the extension while
  //     already logged in must not be left with an empty cache.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (s) => {
      if (s === 'active') session.current?.dispatch({ type: 'foregrounded' });
    });
    return () => subscription.remove();
  }, []);

  // (c) Every launch URL (cold or warm) is forwarded verbatim; the core owns
  //     the anchored `https://getvela.app/sign` match, the rid extraction, the
  //     `ul-selftest` probe exclusion and the attestation refresh — including
  //     driving the extension sign through the same bus the `/sign` scheme
  //     trampoline uses.
  useEffect(() => {
    const onUrl = (url: string | null) => {
      if (!url) return;
      session.current?.dispatch({ type: 'universal_link_opened', url, now_ms: Date.now() });
    };
    Linking.getInitialURL().then(onUrl).catch(() => {});
    const sub = Linking.addEventListener('url', ({ url }) => onUrl(url));
    return () => sub.remove();
  }, []);
}
