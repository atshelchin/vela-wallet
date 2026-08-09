/**
 * The one `session` core the web app has — WEB only, and APP-RESIDENT.
 *
 * Every other core in this repo lives for a screen (the Bridge is freed on
 * unmount). This one is the first exception the 016 inventory called out: the
 * wallet session is the account truth source every money flow sits on, it is
 * read synchronously from dozens of components through `useWallet()`, and its
 * boot restore must run ONCE per process — not once per mount. So the core is a
 * module-level singleton, the `use-display-currency.web.ts` /
 * `network-admin-resident.web.ts` pattern, and `Boot` is dispatched exactly
 * once (the core makes a second `Boot` inert anyway).
 *
 * Two properties this module owes its consumers:
 *
 * - **A first frame identical to today's.** `INITIAL_VIEW` mirrors the core's
 *   own pristine projection, which is `INITIAL_STATE` field for field, so a
 *   component that renders before the first committed view sees exactly what it
 *   has always seen: loading, no wallet, empty address.
 * - **Reference stability.** The effect loop commits a view after every
 *   dispatch AND every effect resolution, so a run of best-effort writes would
 *   otherwise hand out a fresh (but equal) view object each time — and
 *   `useWallet()` consumers key effects off `state.accounts` identity. Equal
 *   views are dropped here, so the object only changes when the session
 *   actually did; and the account list is projected once and re-used until the
 *   accounts THEMSELVES change, so switching the active account no longer
 *   invalidates every `[state.accounts]` dependency the way a fresh JSON parse
 *   would. (Under the reducer, `SWITCH_ACCOUNT` kept the same array.)
 *
 * Imported by explicit `.web` specifier on every side: `tsc` resolves a
 * `.web.ts` file's own imports to the base `.ts` variant, so a bare specifier
 * would type-check against a native module that does not exist.
 */

import { createWalletSession } from './session-session.web';
import { toStoredAccount } from './session-executor.web';
import type { SessionEvent } from './generated/SessionEvent';
import type { SessionView } from './generated/SessionView';
import type { StoredAccount } from '@/models/types';

/** The machine's own initial projection — mirrored until the first view lands. */
const INITIAL_VIEW: SessionView = {
  loading: true,
  has_wallet: false,
  address: '',
  active_index: 0,
  accounts: [],
  allowed_route: 'loading',
  sign_out: null,
};

let current: SessionView = INITIAL_VIEW;
/** Structural key of `current`, so an unchanged view never re-renders the app. */
let currentKey = JSON.stringify(INITIAL_VIEW);
/**
 * The account list in the shape the wallet context holds, rebuilt only when the
 * rows change — see "Reference stability" above. The rows arrive in original
 * order carrying their original index (invariant ⑦), so this array's position
 * IS `SessionAccountRow.index`.
 */
let currentAccounts: StoredAccount[] = [];
let currentAccountsKey = '[]';
const listeners = new Set<(view: SessionView) => void>();
let session: ReturnType<typeof createWalletSession> | null = null;

export function ensureWalletSession() {
  if (!session) {
    session = createWalletSession({
      onView: (view: SessionView) => {
        const key = JSON.stringify(view);
        if (key === currentKey) return;
        currentKey = key;
        const accountsKey = JSON.stringify(view.accounts);
        if (accountsKey !== currentAccountsKey) {
          currentAccountsKey = accountsKey;
          currentAccounts = view.accounts.map((row) => toStoredAccount(row.account));
        }
        current = view;
        listeners.forEach((listener) => listener(view));
      },
      onError: (error) => console.error('[session] core fault:', error),
    });
    // The startup restore, once per process. `start` also commits the core's
    // pristine view first, which is the frame `INITIAL_VIEW` already mirrors.
    session.start({ type: 'boot' });
  }
  return session;
}

export function dispatchWalletSession(event: SessionEvent): void {
  ensureWalletSession().dispatch(event);
}

/** The latest committed view. Synchronous — that is the whole point. */
export function walletSessionView(): SessionView {
  return current;
}

/**
 * The latest account list, projected into the shape the wallet context holds.
 * Reference-stable across views that did not change the accounts.
 */
export function walletSessionAccounts(): StoredAccount[] {
  return currentAccounts;
}

/** Subscribe to every committed view. Returns the unsubscribe. */
export function subscribeWalletSession(listener: (view: SessionView) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
