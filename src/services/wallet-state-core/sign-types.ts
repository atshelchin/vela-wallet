/**
 * Platform-neutral types for the `sign_request` core (spec 017, group G11).
 *
 * Standalone for the reason `session-types.ts` states: the retired native stub needed these declarations without
 * the web service graph behind them. The stub is gone; the split stays
 * because the vocabulary has importers of its own and keeps the wasm graph
 * out of anything that must not load it.
 * One module per machine also keeps parallel integration waves off each other's
 * files.
 */

import type { SignErrorKind } from './generated/SignErrorKind';
import type { SignErrorNotice } from './generated/SignErrorNotice';
import type { SignOperation } from './generated/SignOperation';
import type { SignView } from './generated/SignView';
import type { SessionOptions } from './types';
import type { DAppTransport } from '@/services/dapp-transport';
import type { AssetSimResult } from '@/services/tx-simulation';

/** One request from the core, carrying the id it will be answered by. */
export type SignEffect = { id: number; operation: SignOperation };

/**
 * The live objects and re-entry points the core deliberately never holds.
 *
 * The core speaks `transport_id` and nothing else about transports (F2: a
 * response goes to the transport that OWNS the request, never a shared ref);
 * the shell keeps the id → instance table. `opSubmitted` is the one mid-flight
 * re-entry: the bundler accepting an op is a fact the core must hear BEFORE
 * `SignAndSubmit` resolves, so the durable record can precede anything the dApp
 * can poll (§4).
 */
export interface SignShellPorts {
  /** The transport that owns a request. `null` when it is already gone. */
  transportFor(transportId: string): DAppTransport | null;
  /** `onSubmitted(hash)` — dispatches `Event::OpSubmitted` mid-`SignAndSubmit`. */
  opSubmitted(id: string, userOpHash: string): void;
  /**
   * The sign-time simulation the last approve carried. Deliberately NOT core
   * state: `assetChanges` is a presentation blob the record stores for the
   * Connections-panel replay, and the core would only be forwarding it.
   */
  assetSim(): AssetSimResult | null | undefined;
  /**
   * §12.1.6 — switch the active account to the granted one.
   *
   * `index` is a position in the list this machine was given, and it is
   * consumed in the SESSION's domain, where an out-of-range index is a silent
   * whole no-op. The implementation must therefore feed from the session's own
   * rows and VERIFY the switch landed before it resolves: resolving is what
   * opens the approval surface, and resolving on a switch that did not happen
   * is a signature from an account the origin was never granted.
   *
   * It no longer waits for React. The signer the core hands to `SignAndSubmit`
   * and `CheckBundlerFunding` comes from the core's own
   * `accounts`/`active_index` (§12.1.6 step 2), so there is nothing left on the
   * sign path for a React commit to be ahead of.
   */
  switchActiveAccount(index: number): Promise<void>;
}

export type SignRequestSessionOptions = SessionOptions<SignView> & {
  ports: SignShellPorts;
};

/**
 * The words for the core's semantic error vocabulary — the core owns the code
 * and the kind, the shell owns the copy (that is the stated contract on
 * `SignErrorKind`). Every string here is the one the TypeScript provider
 * produced for the same situation, so neither the dApp's `message` nor the
 * sheet's error card changes wording.
 *
 * Pure and dependency-free so both the executor (which puts it on the wire)
 * and the provider (which renders it) can read it, on either platform.
 */
export function signErrorMessage(notice: SignErrorNotice): string {
  const detail = notice.detail ?? undefined;
  switch (notice.kind) {
    case 'user_rejected':
      return 'User rejected';
    case 'wallet_switched_chains':
      return 'Cancelled: the wallet switched chains';
    case 'unsupported_chain':
      // `assertChainSupported`'s wording minus the id, which the core does not
      // carry on the refusal (it refuses before any UI, so nothing displays it).
      return 'Unsupported chain. Add this network in wallet settings.';
    case 'unauthorized_account':
      return 'The requested account is no longer authorized';
    case 'invalid_params':
      // The chain-switch refusal carries no detail; the approve-path ones do.
      if (detail === undefined) return 'Invalid params: missing chainId';
      return detail === 'no calls provided' ? 'No calls provided' : 'Invalid params';
    case 'unsupported_capability':
      return `Unsupported non-optional capabilities: ${detail ?? ''}`;
    case 'unlimited_approval':
      return `Blocked: this would grant an unlimited approval (${detail ?? ''}). Set a finite amount and try again.`;
    case 'funding_cancelled':
      return 'Gas account funding cancelled';
    case 'stale_fee_quote':
      return 'The quoted fee expired. Review the request again.';
    case 'submit_failed':
    default:
      return detail ?? 'Signing failed';
  }
}

/** Narrowing helper kept beside the words it belongs to. */
export type SignErrorKindName = SignErrorKind;
