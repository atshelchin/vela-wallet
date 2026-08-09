/**
 * The one `network_admin` session the web app has — WEB only.
 *
 * The machine is the app-lifetime mirror of four AsyncStorage keys, and it has
 * two entry points that must share a ledger: the Settings surfaces
 * (`use-network-admin.web.ts`) and the EIP-681 scan recovery
 * (`services/add-network.web.ts`). A session per surface would be two mirrors of
 * the same keys, free to drift — and the duplicate-chain gate that the core now
 * owns for BOTH callers would be reading the wrong ledger. Hence a module-level
 * singleton, the `use-display-currency.web.ts` pattern.
 *
 * Imported by explicit `.web` specifier on both sides: `tsc` resolves a
 * `.web.ts` file's own imports to the base `.ts` variant, so a bare specifier
 * here would type-check against a native module that does not exist.
 */

import { subscribeNetworks } from '@/models/network';

import { createNetworkAdminSession } from './network-admin-session.web';
import type { NetEvent } from './generated/NetEvent';
import type { NetView } from './generated/NetView';

/** The machine's own initial projection — mirrored until the first view lands. */
const EMPTY_VIEW: NetView = {
  loaded: false,
  networks: [],
  wizard: {
    phase: 'idle',
    query: '',
    custom_rpc: '',
    suggestions: [],
    chain_info: null,
    compat: null,
    error: null,
    can_add: false,
  },
  endpoints: [],
  providers: [],
  last_added_chain_id: null,
};

let current: NetView = EMPTY_VIEW;
const listeners = new Set<(view: NetView) => void>();
let session: ReturnType<typeof createNetworkAdminSession> | null = null;

export function ensureNetworkAdmin() {
  if (!session) {
    session = createNetworkAdminSession({
      onView: (view: NetView) => {
        current = view;
        listeners.forEach((listener) => listener(view));
      },
      onError: (error) => console.error('[network-admin] core fault:', error),
    });
    // Hydrate from the four stores. `Started` is idempotent — it re-reads.
    session.start({ type: 'started' });
    // The Add-Token panel's "Add network" tab still writes `vela.customNetworks`
    // through the TypeScript service on web (it belongs to the manage_tokens
    // surface, not this one). Re-hydrating whenever the network set changes keeps
    // this core's ledger from ever overwriting a record it never saw. Our own
    // writes notify through here too — a redundant read, never a write, so it
    // cannot loop.
    subscribeNetworks(() => {
      session?.dispatch({ type: 'started' });
    });
  }
  return session;
}

export function dispatchNetworkAdmin(event: NetEvent): void {
  ensureNetworkAdmin().dispatch(event);
}

/** The latest committed view. */
export function networkAdminView(): NetView {
  return current;
}

/** Subscribe to every committed view. Returns the unsubscribe. */
export function subscribeNetworkAdmin(listener: (view: NetView) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
