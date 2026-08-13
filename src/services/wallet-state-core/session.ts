/**
 * Constructs wallet-state cores and wires them to the web shell — WEB entry.
 *
 * Importing `@/services/vela-core` first is load-bearing: its web entry runs
 * `initSync` on the base64-embedded module at import time, so the wasm is
 * initialised before any core is constructed here. (Metro resolves that
 * facade to `index.web.ts` in this bundle.)
 *
 * `session.ts` is the native counterpart and throws: Hermes has no
 * WebAssembly, so the mobile app keeps its TypeScript controllers.
 */

import '@/services/vela-core';
import {
  DisplayCurrencyCore,
  PaymentRequestCore,
  ReceiveWatchCore,
} from '../../../rust/pkg-web/vela_core.js';

import { createJsonWasmShell } from '@/services/crux/json-wasm-shell';
import type { EffectLoop } from '@/services/crux/effect-loop';

import {
  createReceiveWatchExecutor,
  currencyOperationFailure,
  executeCurrencyOperation,
  executePaymentRequestOperation,
  paymentRequestOperationFailure,
  receiveWatchOperationFailure,
} from './executors';
import type { CurrencyEvent } from './generated/CurrencyEvent';
import type { CurrencyShellResult } from './generated/CurrencyShellResult';
import type { CurrencyView } from './generated/CurrencyView';
import type { PaymentRequestEvent } from './generated/PaymentRequestEvent';
import type { PaymentRequestShellResult } from './generated/PaymentRequestShellResult';
import type { PaymentRequestView } from './generated/PaymentRequestView';
import type { ReceiveWatchEvent } from './generated/ReceiveWatchEvent';
import type { ReceiveWatchShellResult } from './generated/ReceiveWatchShellResult';
import type { ReceiveWatchView } from './generated/ReceiveWatchView';
import type {
  CurrencyEffect,
  CurrencySessionOptions,
  PaymentRequestEffect,
  PaymentRequestSessionOptions,
  ReceiveWatchEffect,
  ReceiveWatchSessionOptions,
} from './types';

export type CurrencySession = EffectLoop<CurrencyEvent>;
export type ReceiveWatchSession = EffectLoop<ReceiveWatchEvent>;
export type PaymentRequestSession = EffectLoop<PaymentRequestEvent>;

export function createDisplayCurrencySession(options: CurrencySessionOptions): CurrencySession {
  return createJsonWasmShell<CurrencyView, CurrencyEvent, CurrencyEffect, CurrencyShellResult>(
    new DisplayCurrencyCore(),
    {
      onView: options.onView,
      execute: executeCurrencyOperation,
      toFailure: currencyOperationFailure,
      onError: options.onError,
    },
  );
}

export function createReceiveWatchSession(
  options: ReceiveWatchSessionOptions,
): ReceiveWatchSession {
  return createJsonWasmShell<
    ReceiveWatchView,
    ReceiveWatchEvent,
    ReceiveWatchEffect,
    ReceiveWatchShellResult
  >(new ReceiveWatchCore(), {
    onView: options.onView,
    execute: createReceiveWatchExecutor(options.address),
    toFailure: receiveWatchOperationFailure,
    onError: options.onError,
  });
}

export function createPaymentRequestSession(
  options: PaymentRequestSessionOptions,
): PaymentRequestSession {
  return createJsonWasmShell<
    PaymentRequestView,
    PaymentRequestEvent,
    PaymentRequestEffect,
    PaymentRequestShellResult
  >(new PaymentRequestCore(), {
    onView: options.onView,
    execute: executePaymentRequestOperation,
    toFailure: paymentRequestOperationFailure,
    onError: options.onError,
  });
}
