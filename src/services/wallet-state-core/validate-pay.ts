/**
 * `/pay` query validation — NATIVE entry point, and deliberately unavailable.
 *
 * Hermes has no WebAssembly; the native `/pay` path keeps its TypeScript
 * parse in `use-pay-request.ts` and never imports this module at runtime. It
 * exists so the platform pair resolves (`tsc` resolves `.web.ts` imports to
 * the base `.ts`).
 */

import type { PayRequest } from './generated/PayRequest';
import type { RawPayQuery } from './types';

export function validatePayQuery(_query: RawPayQuery): PayRequest | null {
  throw new Error(
    'wallet-state-core is web-only: this runtime has no WebAssembly. Native uses the TypeScript controllers.',
  );
}
