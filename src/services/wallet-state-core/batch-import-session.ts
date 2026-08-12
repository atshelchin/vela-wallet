/**
 * The `batch_import` core session — NATIVE entry point, and deliberately
 * unavailable.
 *
 * React Native runs on Hermes, which has no WebAssembly, so the payroll
 * importer cannot execute its Rust machine on iOS or Android. The mobile app
 * keeps the TypeScript controller (`use-batch-import.ts`) and never imports
 * this module at runtime.
 *
 * It exists so the platform pair resolves: `tsc` has no `moduleSuffixes`
 * configured, so it type-checks `.web.ts` files but resolves *their* imports
 * to the base `.ts` variant. Same shape as `session.ts`.
 */

import type { EffectLoop } from '@/services/crux/effect-loop';
import type { BatchImportEvent } from './generated/BatchImportEvent';
import type { BatchSessionOptions } from './batch-import-types';

export type BatchImportSession = EffectLoop<BatchImportEvent>;

const UNAVAILABLE =
  'batch-import core is web-only: this runtime has no WebAssembly. Native uses the TypeScript controller.';

export function createBatchImportSession(_options: BatchSessionOptions): BatchImportSession {
  throw new Error(UNAVAILABLE);
}
