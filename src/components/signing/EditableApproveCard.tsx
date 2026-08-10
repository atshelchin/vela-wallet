/**
 * EditableApproveCard — the founder mandate made tangible.
 *
 * Replaces the passive "Unlimited ⚠" banner with an active control: the user
 * picks a FINITE spending cap (or revokes). There is intentionally no "Unlimited"
 * preset, and for an unbounded incoming request the confirm button stays disabled
 * until the user makes a finite choice (reported as a non-null `choice`).
 *
 * When the wallet's token balance is known, a one-tap "Balance" preset offers a
 * finite cap at that balance (issue #86): enough to let a swap proceed — a dApp
 * like Uniswap that requests an unlimited approve still gets a workable allowance
 * — but never more than the user holds, and always below the never-unlimited cap.
 * That is a bounded cap, NOT the forbidden "unlimited" grant.
 *
 * PURE RENDER. It holds no state and derives no verdict: the mode, the typed
 * text, the error and the choice all arrive in `editor`, decided by the
 * approval guard (`rust/crates/vela-core/src/app/approval_guard.rs` on web,
 * `hooks/use-approval-guard.ts` on native). Which chips exist, whether a
 * grant-all is preselected (it never is), and whether a custom amount is
 * accepted are that machine's calls — this file only renders them and hands
 * back taps.
 *
 * The one thing that stays here is the WORDS: the error is a semantic key, the
 * number is localized here, and the editor's canonical '.' decimal is swapped
 * for the locale's mark on the way in / out (the guard's contract).
 */
import React from 'react';
import { View, Text, Pressable, TextInput } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ShieldCheck, Pencil } from 'lucide-react-native';
import { scaleFont, color, text, inter, space, radius, createStyles } from '@/constants/theme';
import { TokenLogo } from '@/components/TokenLogo';
import { type DetectedApproval, formatTokenAmount } from '@/services/approval-guard';
import type {
  ApprovalEditorMode, ApprovalEditorState,
} from '@/hooks/approval-guard-controller-types';
import { useLocalePrefs, numberSeparators, inputSeparators, parseLocaleNumber } from '@/services/locale-format';
import { useDisplayCurrency } from '@/hooks/use-display-currency';

interface Props {
  approval: DetectedApproval;
  symbol: string;
  decimals: number;
  decimalsVerified: boolean;
  /** Per-chain logo URLs (checksummed first, lowercase fallback). */
  logoUrls?: string[];
  /** Resolved spender name or short address, for the plain-language line. */
  spenderLabel: string;
  /** Token USD price for the ≈$ line (omit to hide it). */
  usdPrice?: number;
  /** The guard's derivation for THIS card — mode, text, error, choice. */
  editor: ApprovalEditorState;
  onPreset: (mode: ApprovalEditorMode) => void;
  /** Canonical text (dot decimal); the card localizes on the way in and out. */
  onCustomText: (text: string) => void;
  onGrant: () => void;
  onRevoke: () => void;
}

export function EditableApproveCard(props: Props) {
  if (props.approval.isBooleanGrant) return <BooleanGrantCard {...props} />;
  return <AmountCard {...props} />;
}

// ---------------------------------------------------------------------------
// Amount-bearing approvals (ERC-20 approve / increaseAllowance / ERC-2612 /
// Permit2 single). Decrease is rendered read-only-safe.
// ---------------------------------------------------------------------------

function AmountCard({
  approval, symbol, decimals, decimalsVerified, logoUrls, spenderLabel, usdPrice,
  editor, onPreset, onCustomText,
}: Props) {
  const { t } = useTranslation();
  useLocalePrefs();
  const sep = numberSeparators();
  // Editable input uses the locale decimal mark (no grouping) so it reads the same
  // as the display value — "47,284177", not the canonical "47.284177".
  const inSep = inputSeparators();
  const dc = useDisplayCurrency();
  const isReducing = approval.kind === 'decreaseAllowance';

  const mode = editor.mode ?? 'custom';
  const choice = editor.choice;
  const displayRaw = editor.displayAmountRaw;
  const errorText = editor.error === 'invalid-amount'
    ? t('componentsUi.signingApprove.invalidAmount')
    : editor.error === 'unlimited-disabled'
      ? t('componentsUi.signingApprove.unlimitedDisabled')
      : null;
  // The guard stores canonical text; the field shows the locale's decimal mark.
  const customText = inSep.decimal === '.'
    ? editor.customText
    : editor.customText.split('.').join(inSep.decimal);

  const accent = isReducing ? color.success.base : color.accent.base;
  const usd = displayRaw != null && usdPrice ? (Number(displayRaw) / 10 ** decimals) * usdPrice : null;

  return (
    <View style={[styles.card, isReducing && styles.cardSafe]}>
      {/* Token header */}
      <View style={styles.header}>
        <TokenLogo symbol={symbol} logoUrls={logoUrls} size={28} />
        <Text style={styles.symbol}>{symbol}</Text>
        <Text style={styles.capLabel}>
          {isReducing ? t('componentsUi.signingApprove.reduceBy') : t('componentsUi.signingApprove.spendingCap')}
        </Text>
      </View>

      {/* The value — display or live custom input. The token symbol lives in the
          header (and the summary line), so the number stands alone here. */}
      {mode === 'custom' ? (
        <View style={styles.inputRow}>
          <TextInput
            style={[styles.amountInput, { color: errorText ? color.error.base : color.fg.base }]}
            value={customText}
            onChangeText={(value) => onCustomText(parseLocaleNumber(value))}
            keyboardType="decimal-pad"
            inputMode="decimal"
            placeholder="0"
            placeholderTextColor={color.fg.subtle}
            autoFocus={!editor.requestedFinite}
            selectionColor={accent}
          />
        </View>
      ) : (
        <Pressable style={styles.valueRow} onPress={() => onPreset('custom')}>
          <Text style={[styles.amountValue, mode === 'revoke' && { color: color.success.base }]} numberOfLines={1}>
            {mode === 'revoke' ? t('componentsUi.signingApprove.revokeValue') : `${formatTokenAmount(displayRaw ?? 0n, decimals, 6, sep)} ${symbol}`}
          </Text>
          {mode !== 'revoke' && <Pencil size={15} color={color.fg.subtle} strokeWidth={2} />}
        </Pressable>
      )}

      {usd != null && mode !== 'revoke' && !errorText && (
        <Text style={styles.usd}>≈ {dc.fmt(usd)}</Text>
      )}

      {/* Presets */}
      <View style={styles.presets}>
        {editor.requestedFinite && (
          <PresetChip
            label={t('componentsUi.signingApprove.requested')}
            active={mode === 'requested'}
            onPress={() => onPreset('requested')}
          />
        )}
        {editor.hasBalanceCap && (
          <PresetChip
            label={t('componentsUi.signingApprove.balanceCap', { defaultValue: 'Balance' })}
            active={mode === 'balance'}
            onPress={() => onPreset('balance')}
          />
        )}
        <PresetChip
          label={t('componentsUi.signingApprove.custom')}
          active={mode === 'custom'}
          onPress={() => onPreset('custom')}
        />
        <PresetChip
          label={t('componentsUi.signingApprove.revoke')}
          active={mode === 'revoke'}
          tone="safe"
          onPress={() => onPreset('revoke')}
        />
      </View>

      {/* Inline error */}
      {errorText && (
        <View style={styles.errorRow}>
          <AlertTriangle size={13} color={color.error.base} strokeWidth={2} />
          <Text style={styles.errorText}>{errorText}</Text>
        </View>
      )}

      {/* Plain-language summary */}
      {!errorText && (
        <Text style={styles.summary}>
          {mode === 'revoke'
            ? t('componentsUi.signingApprove.revokeSummary', { spender: spenderLabel })
            : choice?.type === 'amount'
              ? t('componentsUi.signingApprove.capSummary', { spender: spenderLabel, amount: `${formatTokenAmount(choice.amountRaw, decimals, 6, sep)} ${symbol}` })
              : t('componentsUi.signingApprove.choosePrompt')}
        </Text>
      )}

      {!decimalsVerified && (
        <Text style={styles.unverified}>{t('componentsUi.signingApprove.decimalsUnverified')}</Text>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Boolean grants (setApprovalForAll / DAI permit). No amount — grant or revoke.
// ---------------------------------------------------------------------------

function BooleanGrantCard({ approval, spenderLabel, editor, onGrant, onRevoke }: Props) {
  const { t } = useTranslation();
  // The guard preselects NOTHING for a grant-all (the deliberate tap is the
  // consent) and preselects revoke when the request is already a revoke.
  const selected = editor.mode === 'grant' ? 'grant' : editor.mode === 'revoke' ? 'revoke' : null;

  const isNft = approval.kind === 'setApprovalForAll';

  return (
    <View style={[styles.card, styles.cardDanger]}>
      <View style={styles.header}>
        <AlertTriangle size={18} color={color.error.base} strokeWidth={2} />
        <Text style={[styles.symbol, { color: color.error.base }]}>
          {isNft ? t('componentsUi.signingApprove.allNfts') : t('componentsUi.signingApprove.fullBalance')}
        </Text>
      </View>

      <Text style={styles.booleanWarn}>
        {isNft
          ? t('componentsUi.signingApprove.setApprovalAllWarn', { operator: spenderLabel })
          : t('componentsUi.signingApprove.daiWarn', { spender: spenderLabel })}
      </Text>

      <Pressable
        style={[styles.boolBtn, styles.boolRevoke, selected === 'revoke' && styles.boolRevokeActive]}
        onPress={onRevoke}
      >
        <ShieldCheck size={16} color={color.success.base} strokeWidth={2} />
        <Text style={[styles.boolBtnText, { color: color.success.base }]}>{t('componentsUi.signingApprove.revokeAccess')}</Text>
      </Pressable>

      <Pressable
        style={[styles.boolBtn, styles.boolGrant, selected === 'grant' && styles.boolGrantActive]}
        onPress={onGrant}
      >
        <Text style={[styles.boolBtnText, { color: selected === 'grant' ? color.error.base : color.fg.muted }]}>
          {t('componentsUi.signingApprove.grantAllAnyway')}
        </Text>
      </Pressable>

      {selected === null && (
        <Text style={styles.summary}>{t('componentsUi.signingApprove.chooseAction')}</Text>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Preset chip
// ---------------------------------------------------------------------------

function PresetChip({ label, active, onPress, tone }: {
  label: string; active: boolean; onPress: () => void; tone?: 'safe';
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        active && (tone === 'safe' ? styles.chipActiveSafe : styles.chipActive),
      ]}
    >
      <Text style={[
        styles.chipText,
        active && (tone === 'safe' ? styles.chipTextActiveSafe : styles.chipTextActive),
      ]}>{label}</Text>
    </Pressable>
  );
}

const styles = createStyles(() => ({
  // De-containered (Wise / the mock): a routine bounded approve sits OPEN, aligned
  // to the sheet edge — no tinted box competing for attention. Only the genuinely
  // dangerous unbounded grant (cardDanger) gets a contained red alarm box.
  card: {
    paddingVertical: space.md,
    gap: space.md,
  },
  cardSafe: {},
  cardDanger: {
    backgroundColor: color.error.soft,
    borderWidth: 1, borderColor: color.error.base + '40',
    borderRadius: radius['2xl'],
    padding: space['2xl'],
    marginVertical: space.sm,
  },

  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  symbol: { fontSize: text.base, ...inter.bold, color: color.fg.base },
  capLabel: {
    marginLeft: 'auto', fontSize: scaleFont(10), ...inter.semibold, color: color.fg.subtle,
    textTransform: 'uppercase', letterSpacing: 0.4,
  },

  valueRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  amountValue: { fontSize: text['3xl'], ...inter.bold, color: color.fg.base, letterSpacing: -0.5, flexShrink: 1 },
  inputRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  amountInput: {
    // minWidth:0 lets the flex input shrink below its intrinsic content width;
    // without it a long value overflows and horizontally scrolls the whole sheet,
    // clipping the detail rows (被授权方/代币) on the left edge.
    flex: 1, minWidth: 0, fontSize: text['3xl'], ...inter.bold, letterSpacing: -0.5, padding: 0,
  },
  usd: { fontSize: text.sm, ...inter.medium, color: color.fg.muted, marginTop: -space.xs },

  presets: { flexDirection: 'row', gap: space.sm, marginTop: space.xs },
  chip: {
    paddingHorizontal: space.lg, paddingVertical: space.sm, borderRadius: radius.full,
    backgroundColor: color.bg.raised, borderWidth: 1, borderColor: color.border.base,
  },
  chipActive: { backgroundColor: color.fg.base, borderColor: color.fg.base },
  chipActiveSafe: { backgroundColor: color.success.base, borderColor: color.success.base },
  chipText: { fontSize: text.sm, ...inter.semibold, color: color.fg.muted },
  chipTextActive: { color: color.fg.inverse },
  chipTextActiveSafe: { color: color.fg.inverse },

  errorRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  errorText: { fontSize: text.sm, ...inter.medium, color: color.error.base, flex: 1 },
  summary: { fontSize: text.sm, ...inter.regular, color: color.fg.muted, lineHeight: 18 },
  unverified: { fontSize: text.xs, ...inter.regular, color: color.warning.base },

  // Restraint: red heading (the "All NFTs" symbol) carries the alarm; the body reads
  // in ink so the card isn't a wall of red (matches the eth_sign danger card).
  booleanWarn: { fontSize: text.sm, ...inter.medium, color: color.fg.base, lineHeight: 19 },
  boolBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm,
    paddingVertical: space.lg, borderRadius: radius.lg, borderWidth: 1,
  },
  boolRevoke: { backgroundColor: color.success.soft, borderColor: color.success.base + '40' },
  boolRevokeActive: { borderColor: color.success.base, borderWidth: 2 },
  boolGrant: { backgroundColor: color.bg.raised, borderColor: color.border.base },
  boolGrantActive: { borderColor: color.error.base, borderWidth: 2, backgroundColor: color.error.soft },
  boolBtnText: { fontSize: text.base, ...inter.semibold },
}));
