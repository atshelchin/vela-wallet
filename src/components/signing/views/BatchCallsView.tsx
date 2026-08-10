/**
 * Batch View (EIP-5792 wallet_sendCalls) — per-call breakdown with an editable
 * spending cap on every approval leg.
 *
 * Presentation only. Which legs need an editor, which still block confirm,
 * which still grant broad access, whether any leg burns a token by sending it
 * to its own contract, and every leg editor's choice are the approval guard's
 * calls (`hooks/use-approval-guard*`); this file renders them.
 */
import React from 'react';
import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { color } from '@/constants/theme';
import { formatTokenAmount as formatRawTokenAmount } from '@/services/approval-guard';
import type {
  ApprovalBatchState, ApprovalEditorMode,
} from '@/hooks/approval-guard-controller-types';
import { type ClearSignResult } from '@/services/clear-signing';
import { shortAddr, tokenLogoURLsByAddress } from '@/models/types';
import { knownContract } from '@/services/local-descriptors';
import { useLocalePrefs, numberSeparators } from '@/services/locale-format';
import {
  displayTokenSymbol, TOKEN_SYMBOL_PLACEHOLDER,
} from '@/services/wallet-state-core/clear-batch';
import { ShieldAlert } from 'lucide-react-native';
import { styles, riskColors, SigningChainContext, localizeIntent } from '../signing-core';
import { EditableApproveCard } from '../EditableApproveCard';
import { IntentHeader } from '../IntentHeader';
import { WarningBanner } from '../WarningBanner';

/** One resolved leg of an EIP-5792 batch (wallet_sendCalls). */
export interface BatchItem {
  to: string;
  clearSign: ClearSignResult | null;
}

/** First meaningful amount/recipient line for a batch leg. */
function batchSummary(it: BatchItem): string | undefined {
  const f = it.clearSign?.fields.find(
    (x) => x.role === 'send-amount' || x.role === 'receive-amount' || x.format === 'tokenAmount' || x.format === 'amount',
  );
  return f?.value;
}

export function BatchCallsView({
  items, batch, requestId, onLegPreset, onLegCustomText, onLegGrant, onLegRevoke,
}: {
  /** The descriptor pipeline's per-leg resolution, in leg order. */
  items: BatchItem[];
  /** The guard's per-leg verdicts + editors, in the same order. */
  batch: ApprovalBatchState;
  /** Remounts each leg's editor when the request changes (no stale cap state). */
  requestId: string;
  onLegPreset: (index: number, mode: ApprovalEditorMode) => void;
  onLegCustomText: (index: number, text: string) => void;
  onLegGrant: (index: number) => void;
  onLegRevoke: (index: number) => void;
}) {
  const { t } = useTranslation();
  const chainId = React.useContext(SigningChainContext);
  useLocalePrefs();
  const sep = numberSeparators();

  return (
    <View>
      <IntentHeader intent={t('componentsUi.signing.batchIntent')} color={color.fg.base} variant="eyebrow" />
      <Text style={styles.batchSub}>{t('componentsUi.signing.batchSubtitle', { count: items.length })}</Text>

      {items.map((it, i) => {
        const leg = batch.legs[i];
        const ap = leg?.approval ?? null;
        // Localize the descriptor's English intent ("Approve" → "授权"); fall back to
        // the approve verb or a generic "contract call".
        const title = it.clearSign?.intent
          ? localizeIntent(it.clearSign.intent)
          : (ap ? t('componentsUi.signingApprove.verbApprove') : t('componentsUi.signing.batchCall'));

        const meta = leg?.meta;
        const spenderName = ap ? (it.clearSign?.contractName ?? knownContract(ap.spender)?.name ?? shortAddr(ap.spender)) : undefined;

        // Only an UNBOUNDED / grant-all approve needs the inline cap editor (to force a
        // finite amount). A bounded approve is already capped, so — like a send or a
        // plain call — it's a consistent compact row, not a big open editor.
        if (leg?.needsEditor && ap && leg.editor) {
          const logoUrls = ap.tokenAddress ? tokenLogoURLsByAddress(chainId, ap.tokenAddress) : undefined;
          return (
            <View key={`${requestId}-${i}`} style={styles.batchEditLeg}>
              <View style={styles.batchEditHead}>
                <View style={styles.batchNum}><Text style={styles.batchNumText}>{i + 1}</Text></View>
                <Text style={styles.batchEditTitle} numberOfLines={1}>{title}</Text>
              </View>
              <EditableApproveCard
                approval={ap}
                // The card has room for a placeholder while the metadata read is
                // in flight — a compact row (below) does not.
                symbol={meta?.symbol ?? TOKEN_SYMBOL_PLACEHOLDER}
                decimals={meta?.decimals ?? 18}
                decimalsVerified={meta?.verified ?? false}
                logoUrls={logoUrls}
                spenderLabel={spenderName ?? shortAddr(ap.spender)}
                editor={leg.editor}
                onPreset={(mode) => onLegPreset(i, mode)}
                onCustomText={(value) => onLegCustomText(i, value)}
                onGrant={() => onLegGrant(i)}
                onRevoke={() => onLegRevoke(i)}
              />
            </View>
          );
        }

        // Every other leg → one consistent compact row: number · verb · amount ·
        // counterparty (spender for an approve, recipient for a send).
        const danger = leg?.grantsBroad ?? false;
        // The symbol is APPENDED, never interpolated into a fixed slot: both
        // guard controllers answer with a placeholder symbol ('…') while the
        // metadata read is in flight and when it failed outright, and an already
        // capped leg reading "Spending cap · 500 …" claims the exact amount is
        // elided. A trailing `.trim()` cannot remove it — an ellipsis is not
        // whitespace — so the row omits the suffix instead.
        const symbol = displayTokenSymbol(meta);
        const detail = ap && ap.tokenAddress
          ? `${t('componentsUi.signingApprove.spendingCap')} · ${formatRawTokenAmount(ap.amountRaw ?? 0n, meta?.decimals ?? 18, 6, sep)}${symbol ? ` ${symbol}` : ''}`.trim()
          : batchSummary(it);
        const counterparty = ap ? spenderName : (it.to ? shortAddr(it.to) : '—');
        return (
          <View key={i} style={[styles.batchRow, danger && styles.batchRowDanger]}>
            <View style={styles.batchNum}><Text style={styles.batchNumText}>{i + 1}</Text></View>
            <View style={styles.batchInfo}>
              <Text style={styles.batchTitle} numberOfLines={1}>{title}</Text>
              {!!detail && <Text style={styles.batchDetail} numberOfLines={1}>{detail}</Text>}
              {!!counterparty && <Text style={styles.batchAddr} numberOfLines={1}>{counterparty}</Text>}
            </View>
            {danger && <ShieldAlert size={14} color={riskColors().danger} strokeWidth={2} />}
          </View>
        );
      })}

      {batch.anyToOwnToken && (
        <WarningBanner severity="danger" text={t('componentsUi.signing.tokenToContractWarning')} />
      )}
      {batch.anyUncapped && (
        <WarningBanner severity="danger" text={t('componentsUi.signing.unlimitedWarning')} />
      )}
    </View>
  );
}
