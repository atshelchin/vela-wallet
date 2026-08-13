/**
 * Constructs the `ext_cache` core and wires it to the web shell — WEB entry
 * (spec 017, `rust/crates/vela-core/src/app/ext_cache.rs`).
 *
 * Importing `@/services/vela-core` first is load-bearing: its web entry runs
 * `initSync` at import time, so the wasm is
 * initialised before the core is constructed here.
 */

import '@/services/vela-core';
import { ExtCacheCore } from '../../../rust/pkg-web/vela_core.js';

import { createJsonWasmShell } from '@/services/crux/json-wasm-shell';
import type { EffectLoop } from '@/services/crux/effect-loop';

import { executeExtCacheOperation, extCacheOperationFailure } from './ext-cache-executor';
import type { ExtCacheEvent } from './generated/ExtCacheEvent';
import type { ExtCacheShellResult } from './generated/ExtCacheShellResult';
import type { ExtCacheView } from './generated/ExtCacheView';
import type { ExtCacheEffect, ExtCacheSessionOptions } from './ext-cache-types';

export type ExtCacheSession = EffectLoop<ExtCacheEvent>;

export function createExtCacheSession(options: ExtCacheSessionOptions): ExtCacheSession {
  return createJsonWasmShell<ExtCacheView, ExtCacheEvent, ExtCacheEffect, ExtCacheShellResult>(
    new ExtCacheCore(),
    {
      onView: options.onView,
      execute: executeExtCacheOperation,
      toFailure: extCacheOperationFailure,
      onError: options.onError,
    },
  );
}
