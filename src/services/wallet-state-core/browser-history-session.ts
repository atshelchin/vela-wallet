/**
 * Constructs the `browser_history` core and wires it to the web shell — WEB
 * entry (spec 017, `rust/crates/vela-core/src/app/browser_history.rs`).
 *
 * Importing `@/services/vela-core` first is load-bearing: its web entry runs
 * `initSync` at import time, so the wasm is
 * initialised before the core is constructed here.
 */

import '@/services/vela-core';
import { BrowserHistoryCore } from '../../../rust/pkg-web/vela_core.js';

import { createJsonWasmShell } from '@/services/crux/json-wasm-shell';
import type { EffectLoop } from '@/services/crux/effect-loop';

import {
  browserHistoryOperationFailure,
  executeBrowserHistoryOperation,
} from './browser-history-executor';
import type { BhistEvent } from './generated/BhistEvent';
import type { BhistShellResult } from './generated/BhistShellResult';
import type { BhistView } from './generated/BhistView';
import type { BhistEffect, BrowserHistorySessionOptions } from './browser-history-types';

export type BrowserHistorySession = EffectLoop<BhistEvent>;

export function createBrowserHistorySession(
  options: BrowserHistorySessionOptions,
): BrowserHistorySession {
  return createJsonWasmShell<BhistView, BhistEvent, BhistEffect, BhistShellResult>(
    new BrowserHistoryCore(),
    {
      onView: options.onView,
      execute: executeBrowserHistoryOperation,
      toFailure: browserHistoryOperationFailure,
      onError: options.onError,
    },
  );
}
