/**
 * Constructs the `balance_dashboard` core and wires it to the web shell — WEB
 * entry (spec 017, `rust/crates/vela-core/src/app/balance_dashboard.rs`).
 *
 * Importing `@/services/vela-core` first is load-bearing: its web entry runs
 * `initSync` on the fetched module at import time, so the wasm is initialised
 * before the core is constructed here.
 *
 * `balance-session.ts` is the native counterpart and throws.
 */

import '@/services/vela-core';
import { BalanceDashboardCore } from '../../../rust/pkg-web/vela_core.js';

import { createJsonWasmShell } from '@/services/crux/json-wasm-shell';
import type { EffectLoop } from '@/services/crux/effect-loop';

import { createBalanceExecutor } from '@/services/wallet-state-core/balance-executor';
import type { BalanceEvent } from './generated/BalanceEvent';
import type { BalanceShellResult } from './generated/BalanceShellResult';
import type { BalanceView } from './generated/BalanceView';
import type { BalanceEffect, BalanceSessionOptions } from './balance-types';

export type BalanceSession = EffectLoop<BalanceEvent>;

export function createBalanceSession(options: BalanceSessionOptions): BalanceSession {
  const executor = createBalanceExecutor(options.stream);
  return createJsonWasmShell<BalanceView, BalanceEvent, BalanceEffect, BalanceShellResult>(
    new BalanceDashboardCore(),
    {
      onView: options.onView,
      execute: (effect, signal) => executor.execute(effect, signal),
      toFailure: (effect, error) => executor.toFailure(effect, error),
      onError: options.onError,
    },
  );
}
