/**
 * The only place the wallet-state cores touch the outside world.
 *
 * Each operation a core declares maps to exactly one existing service call —
 * storage keys, the rate-source chain, the token fetch, timers, haptics. No
 * branching on business meaning here: if this file ever grows an `if` that
 * decides what happens next, that decision belongs in the Rust machine.
 *
 * Failure contract (shared effect loop): nothing rejects. Every rejection is
 * converted into the result variant that operation answers with, so the core
 * keeps ownership of classification.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';

import { resolveRate } from '@/services/currency';
import { hapticSuccess, isAppActive } from '@/services/platform';
import { fetchTokens } from '@/services/wallet-api';
import { tokenBalanceDouble, tokenChainId, tokenId } from '@/models/types';

import type { CurrencyOperation } from './generated/CurrencyOperation';
import type { CurrencyShellResult } from './generated/CurrencyShellResult';
import type { PaymentRequestShellResult } from './generated/PaymentRequestShellResult';
import type { ReceiveWatchShellResult } from './generated/ReceiveWatchShellResult';
import type { TokenSnapshot } from './generated/TokenSnapshot';
import type {
  CurrencyEffect,
  PaymentRequestEffect,
  ReceiveWatchEffect,
} from './types';

// ---------------------------------------------------------------------------
// display_currency
// ---------------------------------------------------------------------------

/** Same key `services/currency.ts` owns today — the value format is unchanged. */
const CURRENCY_KEY = 'vela.displayCurrency';

/**
 * The device region's currency candidate — the primary locale only, exactly
 * as `seedFromDeviceLocale` reads it (scanning secondary keyboard/language
 * entries would mis-seed multilingual users). The core re-validates the ISO
 * shape; this just reports what the platform says.
 */
function deviceCurrencyCode(): string | null {
  for (const locale of Localization.getLocales()) {
    const code = locale.currencyCode?.toUpperCase();
    if (!code) continue; // web / regionless entries
    return code;
  }
  return null;
}

export async function executeCurrencyOperation(
  effect: CurrencyEffect,
): Promise<CurrencyShellResult> {
  const operation = effect.operation;
  switch (operation.type) {
    case 'read_stored_code': {
      const code = await AsyncStorage.getItem(CURRENCY_KEY);
      return { type: 'stored_code', code: code ?? null };
    }
    case 'write_stored_code':
      await AsyncStorage.setItem(CURRENCY_KEY, operation.code);
      return { type: 'code_written' };
    case 'read_device_currency':
      return { type: 'device_currency', code: deviceCurrencyCode() };
    case 'resolve_rate': {
      // The existing source chain (Chainlink → FX endpoint), null = cannot
      // price right now. The strict/fallback split lives in the core.
      const rate = await resolveRate(operation.code);
      return { type: 'rate_resolved', code: operation.code, rate };
    }
  }
}

export function currencyOperationFailure(
  effect: CurrencyEffect,
  _error: unknown,
): CurrencyShellResult {
  switch (effect.operation.type) {
    case 'read_stored_code':
      // An unreadable preference means "the user never chose" (today's catch).
      return { type: 'stored_code', code: null };
    case 'write_stored_code':
      // Best-effort, as `setCurrency` swallows storage errors today.
      return { type: 'code_written' };
    case 'read_device_currency':
      return { type: 'device_currency', code: null };
    case 'resolve_rate':
      return { type: 'rate_resolved', code: effect.operation.code, rate: null };
  }
}

// ---------------------------------------------------------------------------
// receive_watch
// ---------------------------------------------------------------------------

function toSnapshot(token: import('@/models/types').APIToken): TokenSnapshot {
  return {
    id: tokenId(token),
    symbol: token.symbol,
    chain_id: tokenChainId(token),
    balance: tokenBalanceDouble(token),
    price_usd: token.priceUsd ?? null,
  };
}

export function createReceiveWatchExecutor(address: string) {
  return async function execute(
    effect: ReceiveWatchEffect,
    signal: AbortSignal,
  ): Promise<ReceiveWatchShellResult> {
    const operation = effect.operation;
    switch (operation.type) {
      case 'fetch_tokens': {
        // Activity is checked BEFORE fetching, exactly as today's
        // `checkDeposit` early-return.
        if (!isAppActive()) return { type: 'inactive' };
        const tokens = await fetchTokens(address, { forceRefresh: true });
        return {
          type: 'tokens_fetched',
          tokens: tokens.map(toSnapshot),
          now_ms: Date.now(),
        };
      }
      case 'wait':
        await new Promise<void>((resolve) => {
          const id = setTimeout(resolve, operation.ms);
          signal.addEventListener('abort', () => clearTimeout(id), { once: true });
        });
        return { type: 'waited', now_ms: Date.now() };
      case 'signal_deposit':
        hapticSuccess();
        return { type: 'signalled' };
    }
  };
}

export function receiveWatchOperationFailure(
  effect: ReceiveWatchEffect,
  _error: unknown,
): ReceiveWatchShellResult {
  switch (effect.operation.type) {
    case 'fetch_tokens':
      return { type: 'fetch_failed', now_ms: Date.now() };
    case 'wait':
      return { type: 'waited', now_ms: Date.now() };
    case 'signal_deposit':
      return { type: 'signalled' };
  }
}

// ---------------------------------------------------------------------------
// payment_request
// ---------------------------------------------------------------------------

/** Same per-account key the Receive screen owns today. */
const warnedStorageKey = (account: string) => `vela.receiveWarned.${account}`;

export async function executePaymentRequestOperation(
  effect: PaymentRequestEffect,
): Promise<PaymentRequestShellResult> {
  const operation = effect.operation;
  switch (operation.type) {
    case 'read_ack': {
      const value = await AsyncStorage.getItem(warnedStorageKey(operation.account));
      return { type: 'ack_flag', acknowledged: value === '1' };
    }
    case 'write_ack':
      await AsyncStorage.setItem(warnedStorageKey(operation.account), '1');
      return { type: 'ack_written' };
  }
}

export function paymentRequestOperationFailure(
  effect: PaymentRequestEffect,
  _error: unknown,
): PaymentRequestShellResult {
  switch (effect.operation.type) {
    case 'read_ack':
      // An unreadable flag shows the gate — never skips the warning.
      return { type: 'ack_flag', acknowledged: false };
    case 'write_ack':
      return { type: 'ack_written' };
  }
}
