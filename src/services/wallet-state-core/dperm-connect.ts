/**
 * The web popup's approve half — NATIVE entry point, and deliberately
 * unavailable.
 *
 * Same story as `dperm-popup.ts`: Hermes has no WebAssembly, and the popup
 * entry (`web-request.tsx`) is a web surface — it needs `window.opener` and a
 * `MessageChannel` port, so on iOS/Android the screen never accepts a peer and
 * therefore never reaches either function below. The module exists so the
 * platform pair resolves (`tsc` resolves a `.web.ts` file's imports to the base
 * `.ts` variant).
 *
 * These throw rather than restate the rules: a native-shaped copy of "the grant
 * is pinned to the active address, an audit row is written, a closed window
 * settles 4900" is exactly the second source of truth this wiring exists to
 * delete. The in-app browser's native path reaches the same core through
 * `browser.tsx`.
 */

import type {
  PopupConnectPlan,
  PopupConnectQuestion,
  PopupSettlement,
} from './dperm-connect-types';

const UNAVAILABLE =
  'wallet-state-core is web-only: this runtime has no WebAssembly. The popup entry is a web surface.';

export function planPopupConnect(_question: PopupConnectQuestion): PopupConnectPlan {
  throw new Error(UNAVAILABLE);
}

export function popupCloseSettlement(): PopupSettlement {
  throw new Error(UNAVAILABLE);
}
