/**
 * Constructs the `batch_import` core and wires it to the web shell — WEB entry.
 *
 * Importing `@/services/vela-core` first is load-bearing: its web entry owns
 * the module's initialization (the D7 route — fetched in a browser, read from
 * disk in Node, and gated by `coreReady` before the app graph loads), so the
 * wasm is ready before the core is constructed here. (Metro resolves that
 * facade to `index.web.ts` in this bundle.)
 *
 * `batch-import-session.ts` is the native counterpart and throws: Hermes has no
 * WebAssembly, so the mobile app keeps its TypeScript controller.
 */

import '@/services/vela-core';
import { BatchImportCore } from '../../../rust/pkg-web/vela_core.js';

import { createJsonWasmShell } from '@/services/crux/json-wasm-shell';
import type { EffectLoop } from '@/services/crux/effect-loop';

import { batchOperationFailure, executeBatchOperation } from './batch-import-executor.web';
import type { BatchImportEvent } from './generated/BatchImportEvent';
import type { BatchShellResult } from './generated/BatchShellResult';
import type { BatchView } from './generated/BatchView';
import type { BatchEffect, BatchSessionOptions } from './batch-import-types';

export type BatchImportSession = EffectLoop<BatchImportEvent>;

export function createBatchImportSession(options: BatchSessionOptions): BatchImportSession {
  return createJsonWasmShell<BatchView, BatchImportEvent, BatchEffect, BatchShellResult>(
    new BatchImportCore(),
    {
      onView: options.onView,
      execute: executeBatchOperation,
      toFailure: batchOperationFailure,
      onError: options.onError,
    },
  );
}
