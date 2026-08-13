/**
 * The five-way connect-entry classification — WEB, and the CORE's answer.
 *
 * The rule (`walletpair:` URI → remote-inject link → full http(s) URL → bare
 * host → invalid, in that order, because a remote-inject link is itself an
 * https URL) lives in `rust/crates/vela-core/src/app/dapp_session.rs`
 * (`classify_connect_input`, invariant ⑨). It used to live there *and* inline
 * at both entry points: the shell classified, discarded its answer, handed the
 * raw string to the resident, and the core classified a second time. Whichever
 * copy the next edit landed on, the other one kept deciding.
 *
 * So on web the shell stopped deciding. `Event::InputSubmitted` is the only
 * door into the classifier, and the operation it asks for IS the verdict:
 * `PrepareWalletPair` / `ConnectRemoteInject` / `OpenBrowser` / `AlertInvalidLink`,
 * one per branch, each already carrying the parsed, normalized payload the
 * caller needs (the trimmed URI, the four relay fields, the coerced URL).
 * Reading it back off a throwaway core is the `validate-pay.ts` /
 * `dperm-popup.ts` pattern: construct, dispatch once, read the verdict,
 * free.
 *
 * Throwaway is the point — this core is NOT the app's resident session
 * (`dsess-resident.ts`) and must never become it. Nothing here is executed:
 * the returned effects are dropped on the floor and the instance is freed, so
 * classifying a string can neither open a socket nor disturb a live connection.
 * A pristine model makes exactly one shell request for each of the four
 * branches (`disconnect_current` on an empty model asks for nothing and the
 * disconnected → connecting transition arms no timer), and the scan below is
 * written to tolerate extra bookkeeping operations anyway rather than assume
 * position 0.
 *
 * The connect surfaces still perform their own side effects (which tab to
 * show, which alert copy to use, where to navigate) — this module answers WHAT
 * the input is and nothing else.
 */

import '@/services/vela-core';
import { DappSessionCore } from '../../rust/pkg-web/vela_core.js';

import type { RemoteInjectSession } from '@/services/dapp-transport';
import type { DsessOperation } from '@/services/wallet-state-core/generated/DsessOperation';

/**
 * What one connect input turned out to be. Mirrors the core's `DsessInput`
 * (`rust/crates/vela-core/src/app/dapp_session.rs`) one variant for one variant
 * — this module returns the core's own answer mapped into this shape.
 */
export type ConnectEntry =
  /** A WalletPair pairing URI, trimmed exactly as the transports expect it. */
  | { kind: 'walletpair'; uri: string }
  /** A remote-inject connect link, already parsed into its four fields. */
  | { kind: 'remote-inject'; session: RemoteInjectSession }
  /** A web address (full URL or bare host) for the in-app browser, normalized. */
  | { kind: 'browser'; url: string }
  /** Not a pairing link and not a web address. */
  | { kind: 'invalid' };

interface DispatchResult {
  effects: { id: number; operation: DsessOperation }[];
}

export function classifyConnectEntry(raw: string): ConnectEntry {
  const core = new DappSessionCore();
  let effects: { id: number; operation: DsessOperation }[];
  try {
    effects = (JSON.parse(core.dispatch(JSON.stringify({ type: 'input_submitted', raw }))) as DispatchResult).effects;
  } finally {
    core.free();
  }

  for (const { operation } of effects) {
    switch (operation.type) {
      case 'prepare_wallet_pair':
        return { kind: 'walletpair', uri: operation.uri };
      case 'connect_remote_inject':
        return {
          kind: 'remote-inject',
          session: {
            serverUrl: operation.session.server_url,
            sessionId: operation.session.session_id,
            nonce: operation.session.nonce,
            secret: operation.session.secret,
          },
        };
      case 'open_browser':
        return { kind: 'browser', url: operation.url };
      case 'alert_invalid_link':
        return { kind: 'invalid' };
      default:
        // Bookkeeping the classification does not depend on — keep looking.
        break;
    }
  }

  // Unreachable: every `InputSubmitted` branch asks for one of the four above.
  // Fail closed rather than let a caller read silence as a pairing link.
  return { kind: 'invalid' };
}
