/**
 * The only place the `fee_policy` core touches the outside world.
 *
 * Six operations, six existing service calls. No branching on business
 * meaning: every rule that used to live in `GasFeeCard`, `useSendController`
 * and `estimateTransactionFee` — the bundler-quote acceptance, the gas-price
 * fallback, the ×1.5 padding, the 1 KiB calldata cliff, the in-band pricing,
 * the balance<fee gate — is in `rust/crates/vela-core/src/app/fee_policy.rs`.
 * If this file ever grows an `if` that decides what a fee IS, that decision
 * belongs in the machine.
 *
 * The readers deliberately stop at the wire (`fetchRawGasSignals`,
 * `fetchRawBundlerQuote` in `safe-transaction.ts`) rather than reusing
 * `getGasPrices` / `getBundlerGasQuote`: those two already apply the rules the
 * core also holds, and feeding the core their output would apply each rule
 * twice with neither side owning it.
 *
 * Failure contract (shared effect loop): nothing rejects. Every rejection is
 * converted by `feeOperationFailure` into the result variant that operation
 * answers with, so classification stays in the core.
 */

import { fetchBundlerAccountInfo, fetchInBandGasQuotes } from '@/services/bundler-service';
import {
  fetchRawBundlerQuote,
  fetchRawGasSignals,
  simulateUserOpGas,
} from '@/services/safe-transaction';

import type { FeeAssetQuote } from './generated/FeeAssetQuote';
import type { FeeShellResult } from './generated/FeeShellResult';
import type { FeeEffect, FeeSessionOptions } from './fee-types';
import { decimalToHex } from './send-types';

/**
 * One `vela_getInBandGasQuote` row onto the wire, UNFILTERED.
 *
 * `use-inband-fee-tokens.ts` dropped zero-balance stables here ("they cannot
 * pay the fee"). That is a picker rule and the core holds it now
 * (`picker_rows`), so this must hand over every row the bundler published —
 * filtering here would hide rows the core is entitled to reason about, and the
 * two filters would drift the moment either changed.
 */
function toWireQuote(quote: {
  recipient: string;
  asset: 'native' | 'erc20';
  feeToken: string | null;
  balance: bigint;
  decimals: number;
  symbol: string;
  usdBalance: string;
  usdPrice: string | null;
}): FeeAssetQuote {
  return {
    recipient: quote.recipient,
    asset: quote.asset,
    fee_token: quote.feeToken,
    balance: quote.balance.toString(),
    decimals: quote.decimals,
    symbol: quote.symbol,
    usd_balance: quote.usdBalance,
    usd_price: quote.usdPrice,
  };
}

export function createFeeExecutor(options: FeeSessionOptions) {
  return async (effect: FeeEffect, signal: AbortSignal): Promise<FeeShellResult> => {
    const operation = effect.operation;
    switch (operation.type) {
      case 'fetch_gas_price': {
        const signals = await fetchRawGasSignals(operation.chain_id, operation.want_tip);
        return {
          type: 'gas_price',
          eth_gas_price: signals.ethGasPrice,
          base_fee: signals.baseFee,
          priority_fee: signals.priorityFee,
        };
      }

      case 'fetch_bundler_quote': {
        const quote = await fetchRawBundlerQuote(operation.chain_id, operation.tier);
        return {
          type: 'bundler_quote',
          quote: quote
            ? {
                max_fee_per_gas: quote.maxFeePerGas,
                network_fee_per_gas: quote.networkFeePerGas,
                relayer_fee_per_gas: quote.relayerFeePerGas,
              }
            : null,
        };
      }

      case 'fetch_in_band_quotes': {
        // Keeps its own 8s cache and in-flight coalescing — the inventory
        // prescribes that those stay in the shell, and they are what makes a
        // chip switch free.
        const quotes = await fetchInBandGasQuotes(operation.chain_id, operation.account);
        return {
          type: 'in_band_quotes',
          quotes: quotes ? quotes.map(toWireQuote) : null,
        };
      }

      case 'fetch_fee_recipient': {
        const info = await fetchBundlerAccountInfo(operation.chain_id, operation.account);
        // Which field the bundler published is a fact; `settlementRecipient`
        // wins when present because only the reimbursement leg follows it
        // (`safe-transaction.ts:538`). An old bundler publishes neither and the
        // core reads that as "no recipient".
        return {
          type: 'fee_recipient',
          recipient: info?.settlementRecipient ?? info?.depositAddress ?? null,
        };
      }

      case 'estimate_user_op_gas': {
        // The core already appended the fee leg to these calls, so what is
        // simulated is byte-identical to what is submitted. The shell only
        // encodes: `FeeCall.value` is a decimal base-unit string on the wire and
        // the MultiSend builder reads hex.
        const outcome = await simulateUserOpGas({
          chainId: operation.chain_id,
          account: operation.account,
          deployed: operation.deployed,
          calls: operation.calls.map((call) => ({
            to: call.to,
            value: decimalToHex(call.value),
            data: call.data,
          })),
          publicKeyHex: options.publicKeyHex(),
        });
        if (outcome.kind === 'estimated') {
          return {
            type: 'user_op_gas',
            outcome: {
              type: 'estimated',
              verification_gas_limit: outcome.verificationGasLimit.toString(),
              call_gas_limit: outcome.callGasLimit.toString(),
              pre_verification_gas: outcome.preVerificationGas.toString(),
            },
          };
        }
        return {
          type: 'user_op_gas',
          outcome: outcome.kind === 'context_unavailable'
            ? { type: 'context_unavailable' }
            : { type: 'simulation_failed' },
        };
      }

      case 'start_ttl': {
        // Staleness is advisory — the core only lights a refresh affordance
        // with it. A cancelled timer belongs to a superseded quote, and the
        // shared effect loop's contract for that is to REJECT while the signal
        // is aborted: the loop then answers nothing at all. Resolving
        // `ttl_elapsed` here would report an elapsed timer that never elapsed —
        // harmless today only because the core happens to ignore it outside
        // `Quoted`, which is not a property to depend on.
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, operation.ms);
          signal.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new Error('ttl cancelled'));
          }, { once: true });
        });
        return { type: 'ttl_elapsed' };
      }
    }
  };
}

/**
 * A thrown operation as the result variant it answers with.
 *
 * Every arm here is the same sentence: "the read did not happen." None of them
 * decides what that means for the fee — `resolve_gas_price` turns an absent
 * `eth_gasPrice` into the 5-gwei default, `accept_bundler_quote` turns an absent
 * quote into the local fallback, and `missing_quote_failure` turns absent
 * in-band rows into `fee_token_unavailable` or `quote_unavailable` depending on
 * whether the user picked an asset.
 */
export function feeOperationFailure(effect: FeeEffect, _error: unknown): FeeShellResult {
  const operation = effect.operation;
  switch (operation.type) {
    case 'fetch_gas_price':
      return { type: 'gas_price', eth_gas_price: null, base_fee: null, priority_fee: null };
    case 'fetch_bundler_quote':
      return { type: 'bundler_quote', quote: null };
    case 'fetch_in_band_quotes':
      return { type: 'in_band_quotes', quotes: null };
    case 'fetch_fee_recipient':
      return { type: 'fee_recipient', recipient: null };
    case 'estimate_user_op_gas':
      // `simulateUserOpGas` already classifies its own two failure modes and
      // does not reject; reaching here means the encode itself threw, which is
      // the shell failing to build a truthful op.
      return { type: 'user_op_gas', outcome: { type: 'context_unavailable' } };
    case 'start_ttl':
      return { type: 'ttl_elapsed' };
  }
}
