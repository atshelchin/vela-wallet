/**
 * The web-popup entry's permission verdict — NATIVE entry point, and
 * deliberately unavailable.
 *
 * Hermes has no WebAssembly, and the popup entry (`web-request.tsx`) is a web
 * surface: it needs `window.opener` and a `MessageChannel` port, neither of
 * which exists on iOS or Android, so the screen bails out before it could ever
 * ask this question. The module exists so the platform pair resolves (`tsc`
 * resolves a `.web.ts` file's imports to the base `.ts` variant).
 */

import type { PopupRequestQuestion, PopupVerdict } from './dperm-types';

export function decidePopupRequest(_question: PopupRequestQuestion): PopupVerdict {
  throw new Error(
    'wallet-state-core is web-only: this runtime has no WebAssembly. The popup entry is a web surface.',
  );
}
