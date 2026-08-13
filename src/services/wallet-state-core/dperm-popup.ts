/**
 * The web-popup entry's permission verdict — WEB, the `dapp_permissions` core
 * asked one pure question.
 *
 * `popup_request` requests no shell operation (the popup owns its own grant
 * I/O, its own window and its own transport), so no effect loop is needed:
 * construct a core, dispatch once, read the typed verdict, free it — the
 * `validate-pay.ts` pattern.
 *
 * Why this exists at all: `decide_popup_request` was authored, tested and
 * exported, and executed nowhere. A rule that LOOKS like the source of truth
 * while the shell quietly re-implements it is worse than no rule, because the
 * next edit lands on the copy nobody runs. The three fund-safety rules the
 * popup enforces — a never-connected origin gets no address (4100), the sign is
 * pinned to the GRANT's address rather than the active account, a request
 * pinning any other address is refused rather than silently re-signed — are now
 * stated once, in Rust, and reached from the one surface that has them.
 *
 * The core is NOT app-resident here on purpose: nothing about a one-shot popup
 * window survives it, and a resident core would keep a browser model that this
 * entry never populates.
 */

import '@/services/vela-core';
import { DappPermissionsCore } from '../../../rust/pkg-web/vela_core.js';

import type { DpermView } from './generated/DpermView';
import type { PopupRequestQuestion, PopupVerdict } from './dperm-types';

export { dpermRejectMessage } from './dperm-types';

export function decidePopupRequest(question: PopupRequestQuestion): PopupVerdict {
  const core = new DappPermissionsCore();
  try {
    const result = JSON.parse(
      core.dispatch(
        JSON.stringify({
          type: 'popup_request',
          method: question.method,
          grant: question.grant,
          // `[]` and `null` mean the same "not known yet" to the core, and it
          // is the core that owns the never-log-out-on-a-cold-read rule.
          current_addresses: question.currentAddresses,
          // The TS has always treated the empty string as "no pin".
          pinned_address: question.pinnedAddress ? question.pinnedAddress : null,
        }),
      ),
    ) as { view: DpermView };
    const verdict = result.view.popup;
    if (!verdict) {
      // Unreachable: `popup_request` always publishes a verdict. Fail closed
      // rather than let a caller read this as "allowed".
      throw new Error('dapp_permissions returned no popup verdict');
    }
    return verdict;
  } finally {
    core.free();
  }
}
