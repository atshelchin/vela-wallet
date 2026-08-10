/**
 * Approval View — the editable, never-unlimited spending-cap surface.
 *
 * Presentation only. The detection, the allowance/balance reads, the editor's
 * choice derivation and the increaseAllowance resulting total are the approval
 * guard's (`hooks/use-approval-guard*`); this file arranges them into words.
 */
import React from 'react';
import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { color } from '@/constants/theme';
import {
  type DetectedApproval,
  formatTokenAmount as formatRawTokenAmount,
} from '@/services/approval-guard';
import type {
  ApprovalEditorMode, ApprovalEditorState, ApprovalIncreaseTotal, ApprovalTokenMeta,
} from '@/hooks/approval-guard-controller-types';
import { type ClearSignResult } from '@/services/clear-signing';
import { knownContract } from '@/services/local-descriptors';
import { useLocalePrefs, numberSeparators } from '@/services/locale-format';
import { shortAddr, tokenLogoURLsByAddress } from '@/models/types';
import { styles } from '../signing-core';
import { IntentHeader } from '../IntentHeader';
import { EditableApproveCard } from '../EditableApproveCard';
import { WarningBanner } from '../WarningBanner';
import { SummaryLine } from '../SummaryLine';

export function ApprovalView({
  approval, meta, editor, increaseTotal, expired, chainId, clearSign, requestId,
  onPreset, onCustomText, onGrant, onRevoke,
}: {
  approval: DetectedApproval;
  meta: ApprovalTokenMeta;
  editor: ApprovalEditorState | null;
  /** The resulting-total row for an increaseAllowance, once the read settled. */
  increaseTotal: ApprovalIncreaseTotal | null;
  expired: boolean;
  chainId: number;
  clearSign: ClearSignResult | null;
  requestId: string;
  onPreset: (mode: ApprovalEditorMode) => void;
  onCustomText: (text: string) => void;
  onGrant: () => void;
  onRevoke: () => void;
}) {
  const { t } = useTranslation();
  const isNft = approval.kind === 'setApprovalForAll';

  const verb = approval.isReducing
    ? t('componentsUi.signingApprove.verbRevoke')
    : isNft && approval.isUnbounded
      ? t('componentsUi.signingApprove.verbApproveAll')
      : t('componentsUi.signingApprove.verbApprove');
  // Headline hue = meaning: green revoke, red only for a real-danger unbounded
  // grant, ink for a routine bounded approve (amber is reserved for the slider).
  const verbColor = approval.isReducing
    ? color.success.base
    : approval.isUnbounded
      ? color.error.base
      : color.fg.base;

  useLocalePrefs();
  const sep = numberSeparators();
  const symbol = meta.symbol;
  const decimals = meta.decimals;
  // The resulting-total row prints an EMPTY symbol while metadata is still in
  // flight, exactly as `meta?.symbol ?? ''` did — never a placeholder ellipsis
  // inside a sum.
  const sym = meta.loading ? '' : symbol;
  const logoUrls = approval.tokenAddress
    ? tokenLogoURLsByAddress(chainId, approval.tokenAddress)
    : undefined;

  // Amount in the user's number format — computed ONCE so the summary text and the
  // SummaryLine `emphasize` substring stay identical (verbatim match bolds it).
  const approveAmount = `${formatRawTokenAmount(approval.amountRaw ?? 0n, decimals, 6, sep)} ${symbol}`;
  // Plain-language one-liner — what this approval actually lets the spender do.
  const spenderName = clearSign?.contractName ?? knownContract(approval.spender)?.name ?? shortAddr(approval.spender);
  const summary = approval.isReducing
    ? t('componentsUi.signing.summaryRevoke', { spender: spenderName, token: symbol })
    : isNft && approval.isUnbounded
      ? t('componentsUi.signing.summaryApproveNft', { operator: spenderName })
      : approval.isUnbounded
        ? t('componentsUi.signing.summaryApproveUnlimited', { spender: spenderName, token: symbol })
        : t('componentsUi.signing.summaryApprove', { spender: spenderName, amount: approveAmount });
  // Neutral by default; only an unbounded grant warms the sentence to red.
  const summaryTone = approval.isUnbounded && !approval.isReducing ? 'danger' : 'neutral';

  return (
    <View>
      {/* The verb is always a small kicker — the summary + cap card are the
          headline. A dangerous unbounded grant (red) or a safe revoke (green)
          keeps its hue, but not a giant size that fights the summary for focus. */}
      <IntentHeader
        intent={verb}
        color={verbColor}
        variant="eyebrow"
        colorEyebrow={approval.isUnbounded || approval.isReducing}
      />

      <SummaryLine
        text={summary}
        tone={summaryTone}
        emphasize={[spenderName, approveAmount, symbol]}
      />

      {editor && (
        <EditableApproveCard
          key={requestId}
          approval={approval}
          symbol={symbol}
          decimals={decimals}
          decimalsVerified={meta.verified}
          logoUrls={logoUrls}
          spenderLabel={spenderName}
          editor={editor}
          onPreset={onPreset}
          onCustomText={onCustomText}
          onGrant={onGrant}
          onRevoke={onRevoke}
        />
      )}

      {/* increaseAllowance: the chosen value is an INCREMENT — surface the
          resulting total so "increase by 100" can't read as "cap at 100". When the
          current allowance couldn't be read, still say the increment ADDS to it. */}
      {increaseTotal && (
        <View style={styles.allowanceTotalRow}>
          <Text style={styles.allowanceTotalLabel}>{t('componentsUi.signingApprove.resultingTotal')}</Text>
          {increaseTotal.current !== null ? (
            <Text style={styles.allowanceTotalValue}>
              {`${formatRawTokenAmount(increaseTotal.current, decimals, 6, sep)} + ${formatRawTokenAmount(increaseTotal.increment, decimals, 6, sep)} = ${formatRawTokenAmount(increaseTotal.total ?? 0n, decimals, 6, sep)} ${sym}`}
            </Text>
          ) : increaseTotal.total !== null ? (
            // Revoke zeroes the allowance outright — the increment math no
            // longer applies, so the resulting total is simply 0.
            <Text style={styles.allowanceTotalValue}>{`0 ${sym}`}</Text>
          ) : (
            <Text style={styles.allowanceTotalUnknown}>
              {t('componentsUi.signingApprove.resultingTotalUnknown', { amount: `${formatRawTokenAmount(increaseTotal.increment, decimals, 6, sep)} ${sym}` })}
            </Text>
          )}
        </View>
      )}

      {/* No standalone spender/operator/collection rows: the spender is already
          named in the summary + the cap card, and every raw address (spender,
          operator, collection contract) lives one tap away under 技术细节. Boxed
          identity rows here would just repeat what's already stated in plain words. */}

      {expired && (
        <WarningBanner severity="caution" text={t('componentsUi.signingApprove.expired')} />
      )}
    </View>
  );
}
