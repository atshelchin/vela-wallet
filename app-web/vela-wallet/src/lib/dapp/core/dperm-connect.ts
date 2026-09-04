/**
 * The request window's approve half — and the CORE's answer (spec 027 T330).
 *
 * Ported from src/services/wallet-state-core/dperm-connect.ts @ 52ad8fa9, which
 * exists because the shell had drifted from the core that owns this:
 * `consent_approved` authors `WriteGrant` + `SaveConnectionRecord` + `Respond`,
 * and the shell was performing the first and the third. The missing one is not
 * cosmetic — without it a dApp connected through this window leaves NO
 * "Connected to <app>" row anywhere: no trail, and no way for the person to see
 * or revisit a connection they made.
 *
 * So the shell does not author the approve. It seeds the core with the facts it
 * observed and reads the operations back as the verdict — "the operation IS the
 * answer" — on a throwaway core, constructed and freed inside one call:
 *
 * ```text
 *   accounts_updated ─► account_switched ─► chain_changed   (facts, no ops)
 *        └─► provider_request ─► read_grant ─┐
 *                                            └─► consent sheet OPEN for this origin
 *        └─► consent_approved ─► write_grant + save_connection_record + respond
 * ```
 *
 * Two things this deliberately does NOT do:
 *
 * **It does not re-decide whether to connect.** `decide_popup_request` already
 * said `consent`; this replays the same inputs to reach the sheet the core
 * itself opens, and if the core does not end up with a sheet open for exactly
 * this origin it refuses to author anything (fail closed) rather than mint a
 * grant the machine never sanctioned.
 *
 * **It does not execute the page events.** `consent_approved` also emits
 * `accountsChanged` / `chainChanged`, which exist for a live document. This
 * window answers ONE request and closes — the `Respond` IS the accounts
 * announcement — so those two operations are read and dropped here, on purpose,
 * in one place.
 *
 * **`loadCore()` must have resolved before this is called** (026's rule: no
 * kernel call at import time).
 */

import { DappPermissionsCore } from '$lib/core/client';

import type { DpermEvent } from '$lib/core/generated/DpermEvent';
import type { DpermOperation } from '$lib/core/generated/DpermOperation';
import type { DpermShellResult } from '$lib/core/generated/DpermShellResult';
import type { DpermView } from '$lib/core/generated/DpermView';
import type {
	PopupConnectPlan,
	PopupConnectQuestion,
	PopupConnectRecord,
	PopupSettlement
} from './dperm-connect-types';

interface DispatchResult {
	view: DpermView;
	effects: { id: number; operation: DpermOperation }[];
}

/**
 * The operations the core authors for one approved connection.
 *
 * Throws when the core does not sanction the connection (see the module note).
 * Every throw is recoverable at the call site: nothing has been persisted and
 * nothing has been sent to the dApp yet, so the window can put the person back on
 * the consent card with Connect and Cancel both still working.
 */
export function planPopupConnect(question: PopupConnectQuestion): PopupConnectPlan {
	const core = new DappPermissionsCore();
	try {
		const dispatch = (event: DpermEvent): DispatchResult =>
			JSON.parse(core.dispatch(JSON.stringify(event))) as DispatchResult;
		const resolve = (effectId: number, result: DpermShellResult): DispatchResult =>
			JSON.parse(core.resolve_effect(BigInt(effectId), JSON.stringify(result))) as DispatchResult;

		// The facts, in the order the core documents them: the full address set
		// before anything judges a grant against it, the active account, then the
		// chain this popup session is for. None of the three asks for an operation
		// on a model with no connected origin.
		dispatch({ type: 'accounts_updated', addresses: question.currentAddresses });
		dispatch({ type: 'account_switched', address: question.activeAddress, now_ms: question.nowMs });
		dispatch({ type: 'chain_changed', chain_id: question.chainId });

		// The request itself. The core parks it on a grant read; answer every read
		// it asks for with the value the shell already has in hand.
		const queue = dispatch({
			type: 'provider_request',
			id: question.requestId,
			method: question.method,
			// The connect methods take no params, and this core never
			// interprets them anyway — it forwards them verbatim on the signing path,
			// which a connect never takes.
			params_json: '[]',
			origin: question.origin,
			is_main_frame: true
		}).effects;

		while (queue.length > 0) {
			const { id, operation } = queue.shift()!;
			// `remove_grant` is the core physically cleaning up a grant whose account
			// left the wallet. Harmless to skip here: the write below replaces that
			// key outright, and the popup's read already treated it as no grant.
			if (operation.type !== 'read_grant') continue;
			queue.push(
				...resolve(id, {
					type: 'grant_read',
					origin: operation.origin,
					grant: question.storedGrant
				}).effects
			);
		}

		const view = JSON.parse(core.view()) as DpermView;
		if (view.consent?.origin !== question.origin) {
			// The core did not open a consent sheet for this origin — it answered the
			// request, refused it, or was asked about something else. Authoring a
			// grant on top of that would be the shell overruling the machine.
			throw new Error('dapp_permissions opened no consent for this origin');
		}

		let grant: PopupConnectPlan['grant'] | null = null;
		let record: PopupConnectRecord | null = null;
		let respond: PopupConnectPlan['respond'] | null = null;
		for (const { operation } of dispatch({ type: 'consent_approved', now_ms: question.nowMs })
			.effects) {
			switch (operation.type) {
				case 'write_grant':
					grant = operation.grant;
					break;
				case 'save_connection_record':
					record = {
						address: operation.address,
						chainId: operation.chain_id,
						origin: operation.origin
					};
					break;
				case 'respond':
					// Addressed to this request or to nothing: a payload aimed at another
					// id is not this window's answer.
					if (operation.id === question.requestId) respond = operation.payload;
					break;
				default:
					// `emit_event` — no document to push into. See the module note.
					break;
			}
		}
		if (!grant || !record || !respond) {
			throw new Error('dapp_permissions authored an incomplete connection');
		}
		return { grant, record, respond };
	} finally {
		core.free();
	}
}

/**
 * How the core settles a request still pending when the window goes away.
 *
 * Asked rather than restated: `browser_closed` names the code and the reason in
 * `SettleForwarded`, and 4900-not-4001 is the entire reason that operation
 * carries a code at all.
 */
export function popupCloseSettlement(): PopupSettlement {
	const core = new DappPermissionsCore();
	try {
		const closed = JSON.parse(
			core.dispatch(JSON.stringify({ type: 'browser_closed' } satisfies DpermEvent))
		) as DispatchResult;
		for (const { operation } of closed.effects) {
			if (operation.type === 'settle_forwarded') {
				return { code: operation.code, reason: operation.reason };
			}
		}
		// Unreachable: `browser_closed` always names a settlement.
		throw new Error('dapp_permissions named no settlement for a closed window');
	} finally {
		core.free();
	}
}
