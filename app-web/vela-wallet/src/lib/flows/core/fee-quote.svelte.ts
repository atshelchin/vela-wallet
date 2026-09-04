/**
 * The fee quote — ONE live `fee_policy` session per fee-showing surface.
 *
 * Ported from src/hooks/use-fee-quote.ts @ f9bcb278 (a React hook there, a
 * plain reactive class here — the refs become fields, the state becomes runes;
 * every rule and every comment below is the Expo file's).
 *
 * That "one session" is the whole point. `fee_policy` is built around a
 * session — asset selection, the TTL, the option amounts, `confirm_fee_ready` —
 * and FOUR earlier integration attempts were pulled because they drove it as a
 * one-shot promise while the fee card went on patching estimates in
 * TypeScript. The shell and the core each decided part of one number, and
 * every review found the next place they disagreed. So: everything on a
 * surface that asks about the fee asks THIS session, and the number it settles
 * on is the number displayed, gated and signed.
 *
 * What the shell owns is I/O and arithmetic-free bookkeeping: which account is
 * deployed, which passkey builds its initCode, and the promise plumbing that
 * lets the `send` core's `estimate_fee` operation be answered by a live
 * machine instead of a one-shot call.
 */
import { loadCore } from '$lib/core/client';
import type { FeeCall } from '$lib/core/generated/FeeCall';
import type { FeeEstimateView } from '$lib/core/generated/FeeEstimateView';
import type { FeeFailure } from '$lib/core/generated/FeeFailure';
import type { FeeView } from '$lib/core/generated/FeeView';
import { accountIsDeployed, type TransactionFeeEstimate } from '$lib/services/safe-transaction';
import { createFeeSession, type FeeSession } from './fee-session';
import { resolveFee } from './send-estimates';

/** Both flows quote at `fast`; the tier vocabulary survives because the multiplier table is math. */
const TIER = 'fast' as const;

/** The machine's own initial view, mirrored until the session commits its first. */
export const IDLE_FEE_VIEW: FeeView = {
	busy: false,
	failed: null,
	fee: null,
	stale: false,
	fee_token: null,
	options: [],
	confirm_fee_ready: false
};

export interface FeeQuoteRequest {
	chainId: number;
	account: string;
	/**
	 * The REAL calls being priced, WITHOUT the fee leg — the core appends that
	 * itself, to the recipient its own quote named, so what is simulated is
	 * what is submitted. An empty list asks for a transfer-sized preview.
	 */
	calls: FeeCall[];
	/** `null` = native. A quote PARAMETER: it changes the operation being priced. */
	feeToken: string | null;
	/**
	 * The passkey public key that builds the initCode for an undeployed Safe.
	 * Carried on the REQUEST rather than held by the session, so the key that
	 * builds the initCode belongs to the operation being priced.
	 */
	publicKeyHex: string | undefined;
}

/**
 * How a quote request ended.
 *
 * `context_unavailable` is not a verdict about a fee — it says the shell could
 * not obtain an input the question requires (an indeterminate `eth_getCode`),
 * so the core was never asked. Guessing a deployment status is the one thing
 * that must not happen here: guessing "deployed" ships an op with empty
 * initCode for a fresh account, guessing "undeployed" attaches initCode to a
 * live one, and both are rejected at submit.
 *
 * `abandoned` is the surface moving on under an in-flight request.
 */
export type FeeQuoteOutcome =
	| { kind: 'ok'; estimate: FeeEstimateView }
	| { kind: 'failed'; failure: FeeFailure }
	| { kind: 'context_unavailable' }
	| { kind: 'abandoned' };

/**
 * Which sessions have had `start` called. The shared effect loop draws a real
 * distinction: `start` commits the initial view before dispatching, `dispatch`
 * does not. Calling `start` twice would republish a stale view over a live one.
 */
const started = new WeakSet<FeeSession>();

export class FeeQuote {
	/** The session's view, masked to idle while a superseded question is live. */
	view = $state<FeeView>(IDLE_FEE_VIEW);
	/**
	 * Covers the account-context read too, so no surface renders "estimate
	 * failed" in the frame between deciding to quote and the machine starting.
	 */
	pending = $state(false);
	/** Distinguishes an idle machine from a failed one — both project `fee: null`. */
	asked = $state(false);

	#session: FeeSession | null = null;
	#raw: FeeView = IDLE_FEE_VIEW;
	#latest: FeeView = IDLE_FEE_VIEW;
	/**
	 * The last request never reached the core, so the core's view answers a
	 * DIFFERENT question and must not be published as this one's. Without this
	 * the surface renders the previous request's quote — on a signing sheet
	 * that is "displayed = signed" broken in the most direct way available.
	 */
	#contextLost = $state(false);
	/** The key the LIVE request carries, read when the core asks for a simulation. */
	#publicKey: string | undefined = undefined;
	/** At most one caller awaits settlement: a new request supersedes the last inside the core. */
	#settle: ((outcome: FeeQuoteOutcome) => void) | null = null;
	/** Guards the await inside `requestQuote`: a slower deployment read must not dispatch. */
	#seq = 0;
	#lastRequest: FeeQuoteRequest | null = null;
	#neverReachedCore = false;
	/**
	 * True only while a `quote_requested` dispatch is on the stack. `start`
	 * commits the core's PRISTINE view first — `busy: false, fee: null` — which
	 * is indistinguishable from "the run finished with nothing"; settling on it
	 * resolved every first request as abandoned, which the `send` core reads as
	 * a refused estimate and never advances to confirm.
	 */
	#dispatching = false;

	/** The settled quote in the shape the submit paths sign. */
	get estimate(): TransactionFeeEstimate | null {
		return resolveFee(this.view.fee);
	}

	/** Price this operation. Resolves when the quote settles. */
	async requestQuote(request: FeeQuoteRequest): Promise<FeeQuoteOutcome> {
		const seq = ++this.#seq;
		this.#lastRequest = request;
		this.#publicKey = request.publicKeyHex;
		this.asked = true;
		// Settle the previous caller BEFORE anything else: the dispatch below
		// supersedes its run inside the core, so its promise can never be
		// answered by the machine again.
		this.#resolve({ kind: 'abandoned' });
		this.pending = true;

		// Deployment status decides whether the priced op carries initCode, and
		// `accountIsDeployed` throws rather than answer an indeterminate read.
		let deployed: boolean;
		try {
			deployed = await accountIsDeployed(request.account, request.chainId);
		} catch {
			if (seq === this.#seq) {
				this.#neverReachedCore = true;
				this.#contextLost = true;
				this.#publish();
				this.pending = false;
			}
			return { kind: 'context_unavailable' };
		}
		if (seq !== this.#seq) return { kind: 'abandoned' };
		this.#neverReachedCore = false;
		this.#contextLost = false;
		this.#publish();

		await loadCore();
		if (seq !== this.#seq) return { kind: 'abandoned' };
		const session = this.#ensure();
		return new Promise<FeeQuoteOutcome>((resolve) => {
			this.#settle = resolve;
			const event = {
				type: 'quote_requested' as const,
				chain_id: request.chainId,
				account: request.account,
				deployed,
				public_key_available: this.#publicKey != null,
				tier: TIER,
				calls: request.calls,
				fee_token: request.feeToken
			};
			this.#dispatching = true;
			try {
				if (started.has(session)) session.dispatch(event);
				else {
					started.add(session);
					session.start(event);
				}
			} finally {
				this.#dispatching = false;
			}
			// Judged once, here, against the view the dispatch produced — never
			// against the pristine one `start` publishes on its way in.
			this.#settleFrom(this.#latest);
		});
	}

	/** The person picked a fee coin. */
	selectAsset(token: string | null): void {
		this.#session?.dispatch({ type: 'select_fee_asset', token });
	}

	/** The refresh affordance. */
	requote(): void {
		// The core holds the request context and re-runs its own pipeline —
		// unless the last attempt never reached it, in which case `requote`
		// would be a no-op and the retry affordance a dead button.
		if (this.#neverReachedCore && this.#lastRequest) {
			void this.requestQuote(this.#lastRequest);
			return;
		}
		this.#session?.dispatch({ type: 'requote' });
	}

	/** Leaving the confirm step: drop the asset choice and any stale ERC-20 estimate. */
	leaveConfirm(): void {
		this.#session?.dispatch({ type: 'leave_confirm' });
	}

	/** The form now targets a different chain — every earlier quote is invalid for it. */
	chainChanged(chainId: number): void {
		this.#session?.dispatch({ type: 'chain_changed', chain_id: chainId });
	}

	/**
	 * Leaving the surface. Whatever was in flight is abandoned: leaving a
	 * caller's promise pending forever would wedge the `send` core's effect
	 * loop, which is still waiting for exactly one answer to its `estimate_fee`.
	 */
	dispose(): void {
		this.#resolve({ kind: 'abandoned' });
		this.#session?.dispose();
		this.#session = null;
	}

	#ensure(): FeeSession {
		if (this.#session) return this.#session;
		this.#session = createFeeSession({
			onView: (next) => {
				this.#raw = next;
				this.#latest = next;
				this.#publish();
				if (!this.#dispatching) this.#settleFrom(next);
			},
			onError: (error) => console.error('[fee-policy] core fault:', error),
			publicKeyHex: () => this.#publicKey
		});
		return this.#session;
	}

	/**
	 * One masking point, so no consumer has to remember: a view that answers a
	 * superseded question is not published at all. Every derived value then
	 * falls to "no quote", which is the truth.
	 */
	#publish(): void {
		this.view = this.#contextLost ? IDLE_FEE_VIEW : this.#raw;
	}

	/**
	 * A settled view as the outcome it reports. Which of the three endings it
	 * is comes from the SAME view the surface is rendering, so this can never
	 * report something the screen disagrees with.
	 */
	#settleFrom(view: FeeView): void {
		if (!this.#settle || view.busy) return;
		if (view.fee) this.#resolve({ kind: 'ok', estimate: view.fee });
		else if (view.failed) this.#resolve({ kind: 'failed', failure: view.failed });
		else this.#resolve({ kind: 'abandoned' });
	}

	#resolve(outcome: FeeQuoteOutcome): void {
		const settle = this.#settle;
		this.#settle = null;
		if (settle) {
			this.pending = false;
			settle(outcome);
		}
	}
}
