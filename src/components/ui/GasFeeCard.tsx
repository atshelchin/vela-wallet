/**
 * Gas fee display + fee-asset selector — WEB.
 *
 * The native twin (`GasFeeCard.tsx`) loads its own fee-asset options, derives
 * each row's cost with `calculateInBandFeeAmount` / `tempoReimbursement`, runs
 * the balance<fee gate, auto-defaults to the first affordable asset and calls
 * `estimateTransactionFee` twice. This file does none of that. Every one of
 * those judgements is `fee_policy`'s (`rust/crates/vela-core/src/app/fee_policy.rs`),
 * projected into `FeeView`, and this component turns that view into pixels.
 *
 * That is the whole fix. The four earlier attempts at this integration left the
 * card patching estimates locally while the core also decided them, so one
 * number had two writers and every review found the next place they disagreed
 * (`specs/017-crux-wallet-state-complete/integration-plan.md`). There is now
 * nothing here that could disagree: no arithmetic on money, no gate, no default.
 *
 * What stays in the shell, on purpose:
 *   - number and fiat FORMATTING (locale separators, the display currency)
 *   - expand / collapse, and the auto-reveal when a choice exists
 *   - the token LOGOS: `FeeOptionView` carries no `logo_urls`, and
 *     `nativeLogoURLs` / `tokenLogoURLsByAddress` are `(chain, address)` master
 *     data — the same category as the chain registry, which the core also
 *     deliberately does not hold.
 *   - the WORDS. The core reports semantic `FeeFailure` variants; every one of
 *     them renders the single existing "estimate failed" string, byte-identical
 *     to native, because e2e locates this row by its visible text.
 */

import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { ChevronDown, ChevronUp, RefreshCw } from 'lucide-react-native';
import { color, createStyles, inter, space, text } from '@/constants/theme';
import { useDisplayCurrency } from '@/hooks/use-display-currency';
import { nativeLogoURLs, tokenLogoURLsByAddress } from '@/models/types';
import { useLocalePrefs, numberSeparators, formatNumber } from '@/services/locale-format';
import type { FeeSelectorRow, GasFeeCardProps } from '@/hooks/fee-card-types';
import type { FeeOptionView } from '@/services/wallet-state-core/generated/FeeOptionView';
import { FeeTokenSelector } from './FeeTokenSelector';

// ---------------------------------------------------------------------------
// Helpers — formatting only
// ---------------------------------------------------------------------------

/** Token fee amount in the user's number format. Byte-identical to the native twin. */
function formatFeeAmount(units: number, sep: { group: string; decimal: string; indian?: boolean }): string {
  if (units === 0) return '0';
  if (units < 0.0001) return `< 0${sep.decimal}0001`;
  return formatNumber(units, { maximumFractionDigits: 4 });
}

/** A base-unit decimal string as a display number. `null`/malformed → null, never NaN. */
function toUnits(base: string | null | undefined, decimals: number): number | null {
  if (base == null) return null;
  const value = Number(base);
  return Number.isFinite(value) ? value / 10 ** decimals : null;
}

function toSelectorRow(chainId: number, option: FeeOptionView): FeeSelectorRow {
  return {
    symbol: option.symbol,
    contract: option.contract,
    decimals: option.decimals,
    balance: (() => {
      try {
        return BigInt(option.balance);
      } catch {
        return 0n;
      }
    })(),
    logoUrls: option.contract === null
      ? nativeLogoURLs(chainId, option.symbol)
      : tokenLogoURLsByAddress(chainId, option.contract),
    amount: (() => {
      if (option.amount == null) return null;
      try {
        return BigInt(option.amount);
      } catch {
        return null;
      }
    })(),
    insufficient: option.insufficient,
  };
}

// ---------------------------------------------------------------------------
// Component
//
// `GasFeeCardProps` is declared once in `@/hooks/fee-card-types` and
// implemented twice. This twin reads `controller` and nothing else: the core
// owns the estimate, the selection, the busy flag and the re-quote, and the
// parent reads them from the same session this card renders — so there is no
// `onFeeUpdate` to fire and no `feeEstimate` prop to trust.
// ---------------------------------------------------------------------------

export function GasFeeCard({
  controller, nativeSymbol: sym, nativeUsdPrice, safeAddress, chainId,
}: GasFeeCardProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  // Region format: fiat in the chosen display currency (€/¥/…) + the number
  // format's grouping/decimal marks, matching the amounts everywhere else.
  const dc = useDisplayCurrency();
  useLocalePrefs();
  const sep = numberSeparators();

  const view = controller?.view;
  const options = view?.options ?? [];
  const fee = view?.fee ?? null;
  // `pending` widens `view.busy` over the account-context read that precedes
  // the dispatch, so the first frame reads "estimating", never "failed".
  const busy = (view?.busy ?? false) || (controller?.pending ?? false);

  // As soon as the machine reports there is a choice, reveal it instead of
  // leaving it hidden behind the compact gas row. Reset only for a different
  // account/chain, so a user can still collapse it while reviewing the same
  // transaction. Pure UI memory — the native twin does exactly this.
  const didRevealOptionsRef = useRef(false);
  useEffect(() => {
    didRevealOptionsRef.current = false;
    setExpanded(false);
  }, [chainId, safeAddress]);
  useEffect(() => {
    if (!didRevealOptionsRef.current && options.length > 1) {
      didRevealOptionsRef.current = true;
      setExpanded(true);
    }
  }, [options.length]);

  const selected = options.find((option) => option.selected) ?? null;
  const erc20Fee = fee?.fee_asset.type === 'erc20' ? fee.fee_asset : null;

  // The displayed amount AND the unit it is in, from ONE source.
  //
  // Written as a single choice rather than two `??` chains on purpose. The
  // obvious shape — units falling through to the next source while the symbol
  // falls through independently — can pair digits from one asset with the label
  // of another the moment a source supplies a symbol but no amount. That is the
  // money-unit defect this branch spent six rounds on
  // (`money.rs`: an amount carries the unit it is in). An asset that cannot be
  // priced therefore reports NO amount; it never borrows one.
  const denom: { units: number | null; symbol: string; usdPrice: number | null } =
    selected
      ? {
          units: toUnits(selected.amount, selected.decimals),
          symbol: selected.symbol,
          usdPrice: selected.usd_price == null ? null : Number(selected.usd_price),
        }
      : erc20Fee
        ? {
            units: toUnits(erc20Fee.amount, erc20Fee.decimals),
            symbol: erc20Fee.symbol ?? `${erc20Fee.token.slice(0, 6)}…`,
            usdPrice: null,
          }
        : { units: fee ? toUnits(fee.total_wei, 18) : null, symbol: sym, usdPrice: nativeUsdPrice };

  const feeUnits = denom.units;
  const feeSym = denom.symbol;

  // DISPLAY ONLY, and the native twin says the same thing at the same place:
  // `feeUsd` never leaves this component — it decides `showFiat` and one
  // formatted string. The number that is quoted, signed and reimbursed is
  // `feeUnits` in `feeSym`, which is token-denominated. The middle arm below is
  // a rendering convenience for an unpriced fee asset (the whitelist is
  // stablecoins, so ≈1:1), not a rate: nothing derived from it may enter a
  // conversion, a gate or a submit.
  const feeUsd = feeUnits === null
    ? null
    : denom.usdPrice !== null && Number.isFinite(denom.usdPrice)
      ? feeUnits * denom.usdPrice
      : erc20Fee ? feeUnits : null;
  // Show fiat only when it renders as a meaningful non-zero (2 dp) — below that
  // the token amount is the honest primary.
  const showFiat = feeUsd !== null && feeUsd >= 0.005;

  /** There is a quote AND it can be stated in a unit. Anything less is not a fee. */
  const quoteShown = fee !== null && feeUnits !== null;
  // Estimation finished with no result — a dead-end unless we offer a retry.
  // `asked` is what separates that from a machine nobody has asked yet: both
  // project `fee: null`, and only the surface knows which it is looking at.
  const failed = (controller?.asked ?? false) && !busy && (view?.failed != null || !quoteShown);
  // Only offer the expand affordance when there is actually a choice to make.
  const selectable = options.length > 1;

  const refresh = () => controller?.requote();

  return (
    <>
      {/* Collapsed toggle row — tap to expand the fee-asset picker, or to retry
          when estimation failed */}
      <Pressable
        onPress={failed ? refresh : selectable ? () => setExpanded(!expanded) : undefined}
        style={styles.toggleRow}
      >
        <View style={styles.toggleLabelCol}>
          <Text style={styles.toggleLabel}>{t('componentsUi.gas.estFee')}</Text>
          {selectable && quoteShown && (
            <Text style={styles.toggleLabelSub}>{t('componentsUi.gas.paidWith', { symbol: feeSym })}</Text>
          )}
        </View>
        <View style={styles.toggleRight}>
          <View style={styles.toggleValues}>
            {/* Token-first: the precise amount from the selected quote leads; the quote-supplied
                USD price produces the quiet approximation below. */}
            <Text style={[styles.toggleValue, failed && styles.toggleValueFailed]}>
              {/* An amount is shown only when there IS one in a stated unit. A
                  quote whose selected asset cannot be priced reads as the
                  failure it is, rather than as `~0` of something. */}
              {quoteShown
                ? `~${formatFeeAmount(feeUnits, sep)} ${feeSym}`
                : busy
                  ? t('componentsUi.gas.estimating')
                  : t('componentsUi.gas.estimateFailed')}
            </Text>
            {!failed && quoteShown && showFiat && feeUsd !== null && (
              <Text style={styles.toggleSub}>≈ {dc.fmt(feeUsd)}</Text>
            )}
          </View>
          {failed ? (
            <RefreshCw size={16} color={color.warning.base} strokeWidth={2} />
          ) : (
            <>
              {quoteShown && (
                <Pressable onPress={refresh} hitSlop={8} style={styles.refreshBtn}>
                  {busy ? (
                    <ActivityIndicator size={14} color={color.fg.muted} />
                  ) : (
                    <RefreshCw size={14} color={color.fg.muted} strokeWidth={2} />
                  )}
                </Pressable>
              )}
              {selectable && quoteShown && !busy ? (
                expanded
                  ? <ChevronUp size={16} color={color.fg.subtle} strokeWidth={2} />
                  : <ChevronDown size={16} color={color.fg.subtle} strokeWidth={2} />
              ) : null}
            </>
          )}
        </View>
      </Pressable>

      {/* Expanded fee-asset picker — one row per asset (native + held stables),
          each with its balance + cost. Shared with the native twin. */}
      {expanded && selectable && quoteShown && (
        <FeeTokenSelector
          rows={options.map((option) => toSelectorRow(chainId, option))}
          selected={view?.fee_token ?? null}
          onSelect={(contract) => controller?.selectAsset(contract)}
          busy={busy}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Styles — byte-identical to the native twin's; the two render one design
// ---------------------------------------------------------------------------

const styles = createStyles(() => ({
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: space.lg,
    // No horizontal inset — the fee row shares the sheet's left edge with the
    // eyebrow / hero / summary / 技术细节 (they were 4px apart).
    marginBottom: space.sm,
  },
  toggleLabelCol: {
    gap: 2,
  },
  toggleLabel: {
    fontSize: text.sm,
    ...inter.medium,
    color: color.fg.muted,
  },
  toggleLabelSub: {
    fontSize: text.xs,
    ...inter.regular,
    color: color.fg.subtle,
  },
  toggleRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  toggleValues: {
    alignItems: 'flex-end' as const,
  },
  toggleValue: {
    fontSize: text.sm,
    ...inter.semibold,
    color: color.fg.base,
  },
  toggleValueFailed: {
    color: color.warning.base,
  },
  toggleSub: {
    fontSize: text.xs,
    ...inter.regular,
    color: color.fg.subtle,
  },
  refreshBtn: {
    padding: space.xs,
  },
}));
