/**
 * BatchImportSheet — the payroll batch importer (feature: 表格批量发薪).
 *
 * A user pastes or uploads a table of `(address, amount)` rows; the amount is a
 * fiat figure (the display currency, e.g. CNY) that we convert to a token amount
 * (e.g. USDT) at a shown, editable exchange rate — the exact "priced in RMB, paid
 * in USDT" flow. On apply it hands back `RecipientDraft[]` (token amounts) that
 * SendScreen drops into the existing split editor, so submission is the ordinary
 * single-UserOp `buildSplitCalls → sendBatchCalls` path — nothing new to sign.
 *
 * This file renders; it decides nothing. Every rule — the table interpreter, the
 * rate mirror, the fiat→token conversion, the dedupe, the cap and the balance
 * gate — lives behind `useBatchImport`: the TypeScript controller on native, the
 * Rust `batch_import` machine on web (spec 017). What stays here is shell work:
 * the currency symbol, locale number shaping, haptics, and turning the applied
 * drafts into `RecipientDraft` rows (`makeRecipientId` assigns the row ids).
 *
 * Rate invariant: the rate string in the input IS the applied rate — display and
 * conversion never diverge (the old toFixed(2) mirror showed "0" for sub-cent
 * prices while converting at the true value, and a touch then zeroed every row).
 */
import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput } from 'react-native';
import { useTranslation } from 'react-i18next';
import { X, FileUp, Download, Check, ArrowRight, AlertCircle, ChevronRight } from 'lucide-react-native';
import { AppModal } from '@/components/ui/AppModal';
import { CurrencySheet } from '@/components/ui/CurrencySheet';
import { Divider } from '@/components/ui/DetailRow';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { SegmentedToggle } from '@/components/ui/SegmentedToggle';
import { VelaButton } from '@/components/ui/VelaButton';
import { ContactAvatar } from '@/components/contacts/ContactAvatar';
import { RecipientTypeBadge } from '@/components/contacts/RecipientTypeBadge';
import { color, text, inter, space, radius, font, createStyles } from '@/constants/theme';
import { trimNum, type BatchUnitKey } from '@/hooks/batch-import-controller-types';
import { useBatchImport } from '@/hooks/use-batch-import';
import { type APIToken, shortAddr } from '@/models/types';
import { currencyMeta } from '@/services/currency-catalog';
import { makeRecipientId, type RecipientDraft } from '@/components/send/MultiRecipientEditor';
import { formatTokenAmount, useLocalePrefs, numberSeparators, parseLocaleNumber } from '@/services/locale-format';
import { hapticSuccess, hapticLight } from '@/services/platform';

interface Props {
  visible: boolean;
  onClose: () => void;
  token: APIToken;
  /** Display-currency code + symbol (the default fiat the amounts are read as). */
  currencyCode: string;
  currencySymbol: string;
  onApply: (recipients: RecipientDraft[]) => void;
  maxRecipients: number;
}

export function BatchImportSheet({ visible, onClose, token, currencyCode, currencySymbol, onApply, maxRecipients }: Props) {
  const { t } = useTranslation();
  useLocalePrefs(); // re-render on number-format change
  const [rateInputWidth, setRateInputWidth] = useState(0);
  const [showCurrency, setShowCurrency] = useState(false);

  const batch = useBatchImport({
    visible,
    token,
    currencyCode,
    maxRecipients,
    onApplied: (rows) => {
      const recipients: RecipientDraft[] = rows.map((r) => ({ id: makeRecipientId(), address: r.address, amount: r.amount, name: r.name }));
      hapticSuccess();
      onApply(recipients);
    },
  });

  const unit = batch.unit;
  const fiatCode = batch.fiatCode;
  const priced = batch.priced;
  const fiatSymbol = currencyMeta(fiatCode).symbol || currencySymbol;

  return (
    <AppModal visible={visible} onClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('send.batchTitle', { defaultValue: 'Import recipients' })}</Text>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            testID="batch-close"
            accessibilityRole="button"
            accessibilityLabel={t('send.batchClose', { defaultValue: 'Close' })}
          >
            <X size={22} color={color.fg.base} strokeWidth={2} />
          </Pressable>
        </View>

        <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {/* Amount unit FIRST — it defines what the numbers pasted below mean.
              Fiat works even for an unpriced token — the company can pin its own
              rate (e.g. "1 USDT = 7.2 CNY"), which is the whole payroll point. */}
          <View style={styles.toggleRow}>
            <SegmentedToggle<BatchUnitKey>
              options={[
                { key: 'fiat', label: t('send.batchUnitFiat', { defaultValue: 'In {{code}}', code: fiatCode }), testID: 'batch-unit-fiat' },
                { key: 'token', label: t('send.batchUnitToken', { defaultValue: 'In {{sym}}', sym: token.symbol }), testID: 'batch-unit-token' },
              ]}
              value={unit}
              onChange={batch.setUnit}
            />
          </View>

          {/* Source: paste or file */}
          <TextInput
            testID="batch-paste"
            style={styles.paste}
            value={batch.rawText}
            onChangeText={batch.setRawText}
            placeholder={t('send.batchPastePlaceholder', { defaultValue: '0xabc… , 5000\n0xdef… , 8000' })}
            placeholderTextColor={color.fg.subtle}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
          />
          <View style={styles.sourceRow}>
            <Pressable
              style={styles.sourceBtn}
              onPress={batch.pickFile}
              disabled={batch.busy}
              testID="batch-file"
              accessibilityRole="button"
              accessibilityLabel={t('send.batchImportFile', { defaultValue: 'Import file' })}
              accessibilityState={{ disabled: batch.busy }}
            >
              <FileUp size={16} color={color.fg.muted} strokeWidth={2} />
              <Text style={styles.sourceBtnText}>{batch.busy ? t('send.batchReading', { defaultValue: 'Reading…' }) : t('send.batchImportFile', { defaultValue: 'Import file' })}</Text>
            </Pressable>
            <Pressable
              style={styles.sourceBtn}
              onPress={() => { hapticLight(); batch.saveTemplate(); }}
              accessibilityRole="button"
              accessibilityLabel={t('send.batchTemplate', { defaultValue: 'Get template' })}
            >
              {batch.templateSaved
                ? <Check size={16} color={color.fg.muted} strokeWidth={2} />
                : <Download size={16} color={color.fg.muted} strokeWidth={2} />}
              <Text style={styles.sourceBtnText}>
                {batch.templateSaved ? t('send.batchTemplateSaved', { defaultValue: 'Template saved' }) : t('send.batchTemplate', { defaultValue: 'Get template' })}
              </Text>
            </Pressable>
          </View>
          {batch.fileName && <Text style={styles.fileName}>{batch.fileName}</Text>}

          {/* Settlement currency (same picker as the home balance) + editable rate.
              De-containered: SectionLabel + open rows + hairline, no nested cards. */}
          {unit === 'fiat' && (
            <View>
              <SectionLabel>{t('send.batchRateSection', { defaultValue: 'Rate' })}</SectionLabel>
              <Pressable
                style={styles.currencyRow}
                onPress={() => { hapticLight(); setShowCurrency(true); }}
                testID="batch-currency"
                accessibilityRole="button"
                accessibilityLabel={`${t('send.batchCurrencyLabel', { defaultValue: 'Priced in' })}: ${fiatCode}`}
              >
                <Text style={styles.rowLabel}>{t('send.batchCurrencyLabel', { defaultValue: 'Priced in' })}</Text>
                <View style={styles.currencyValue}>
                  <Text style={styles.currencyCode}>{fiatCode}</Text>
                  <ChevronRight size={16} color={color.fg.muted} strokeWidth={2} />
                </View>
              </Pressable>
              <Divider />
              {/* One continuous sentence: "1 USDT = 7.16 CNY", the editable span
                  underlined; "Auto" (reset) pushed to the row end. A hidden mirror
                  sizes the input to its text so the sentence never breaks apart. */}
              <View style={styles.rateRow}>
                <Text style={styles.rowLabel}>{t('send.batchRateLabel', { defaultValue: '1 {{sym}} =', sym: token.symbol })}</Text>
                <Text
                  style={styles.rateMirror}
                  onLayout={(e) => setRateInputWidth(e.nativeEvent.layout.width)}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                >
                  {(batch.rateInput || '0').replace('.', numberSeparators().decimal)}
                </Text>
                <TextInput
                  testID="batch-rate"
                  style={[styles.rateInput, { width: Math.max(28, rateInputWidth + 6) }]}
                  value={batch.rateInput.replace('.', numberSeparators().decimal)}
                  onChangeText={(v) => batch.setRateText(parseLocaleNumber(v))}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={color.fg.subtle}
                />
                <Text style={styles.rowLabel}>{fiatCode}</Text>
                {batch.rateEdited && (
                  <Pressable
                    onPress={batch.resetRate}
                    hitSlop={{ top: 14, bottom: 14, left: 12, right: 12 }}
                    style={styles.rateResetBtn}
                    accessibilityRole="button"
                    accessibilityLabel={t('send.batchRateReset', { defaultValue: 'Auto' })}
                  >
                    <Text style={styles.rateReset}>{t('send.batchRateReset', { defaultValue: 'Auto' })}</Text>
                  </Pressable>
                )}
              </View>
              {!priced && <Text style={styles.hintText}>{t('send.batchNoPrice', { defaultValue: 'No market price — set your own rate above.' })}</Text>}
              {priced && !batch.rateEdited && batch.rateStatus === 'loading' && (
                <Text style={styles.hintText}>{t('send.batchRateLoading', { defaultValue: 'Fetching rate…' })}</Text>
              )}
              {priced && !batch.rateEdited && batch.rateStatus === 'failed' && (
                <Text style={styles.hintText}>{t('send.batchRateFailed', { defaultValue: 'Rate unavailable — enter one manually.' })}</Text>
              )}
            </View>
          )}

          {/* Preview */}
          {batch.preview.length > 0 && (
            <View style={styles.preview}>
              {batch.preview.map((r, i) => (
                <View key={`${r.address}-${i}`} style={[styles.pRow, !r.ok && styles.pRowBad]} testID={r.ok ? 'batch-row-ok' : 'batch-row-bad'}>
                  {/* Identity card avatar — helps catch a pasted/poisoned address by sight
                      (same avatar-per-address as Send/receipt). */}
                  <ContactAvatar name={r.name ?? ''} address={r.address} size={32} />
                  <View style={styles.pInfo}>
                    <View style={styles.pNameRow}>
                      <Text style={styles.pName} numberOfLines={1}>{r.name || shortAddr(r.address)}</Text>
                      {r.valid ? <RecipientTypeBadge address={r.address} size={12} /> : null}
                    </View>
                    {/* Second line only when it adds information: a status, or the
                        address under a NAME — never the address twice. */}
                    {(!r.valid || r.dup || !!r.name) && (
                      <Text style={styles.pAddr} numberOfLines={1}>
                        {!r.valid ? t('send.batchBadAddress', { defaultValue: 'Invalid address' }) : r.dup ? t('send.batchDup', { defaultValue: 'Duplicate — skipped' }) : shortAddr(r.address)}
                      </Text>
                    )}
                  </View>
                  <View style={styles.pAmt}>
                    {unit === 'fiat' && <Text style={styles.pFiat}>{fiatSymbol}{trimNum(parseFloat(r.rawAmount) || 0)}</Text>}
                    {r.ok ? (
                      <View style={styles.pTokenRow}>
                        <ArrowRight size={11} color={color.fg.subtle} strokeWidth={2} />
                        <Text style={styles.pToken}>{formatTokenAmount(parseFloat(r.tokenAmount))} {token.symbol}</Text>
                      </View>
                    ) : (
                      <Text style={styles.pSkip}>—</Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Both notices can be true at once — never hide one behind the other. */}
          {batch.overCap && (
            <View style={styles.noticeRow}>
              <AlertCircle size={13} color={color.warning.base} strokeWidth={2} />
              <Text style={styles.noticeText}>{t('send.batchOverCap', { defaultValue: 'Only the first {{n}} recipients will be sent.', n: maxRecipients })}</Text>
            </View>
          )}
          {batch.rejected > 0 && (
            <View style={styles.noticeRow}>
              <AlertCircle size={13} color={color.warning.base} strokeWidth={2} />
              <Text style={styles.noticeText}>{t('send.batchRejected', { count: batch.rejected, n: batch.rejected })}</Text>
            </View>
          )}
        </ScrollView>

        {/* Summary + apply. Empty state renders NO totals and a count-free CTA —
            never "Import 0 recipients" over a row of zeros. */}
        <View style={styles.footer}>
          {batch.recipientCount > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>{t('send.recipientCount', { count: batch.recipientCount, n: batch.recipientCount })}</Text>
              <View style={styles.totalRight}>
                <Text style={[styles.totalToken, batch.overBalance && styles.totalOver]}>{batch.totalToken} {token.symbol}</Text>
                {batch.totalFiat != null && <Text style={styles.totalFiat}>≈ {fiatSymbol}{batch.totalFiat} {fiatCode}</Text>}
              </View>
            </View>
          )}
          {batch.overBalance && <Text style={styles.warnText}>{t('send.batchOverBalance', { defaultValue: 'Total exceeds your {{sym}} balance.', sym: token.symbol })}</Text>}
          <View testID="batch-apply">
            <VelaButton
              title={batch.recipientCount > 0
                ? t('send.batchApply', { count: batch.recipientCount, n: batch.recipientCount })
                : t('send.batchApplyEmpty', { defaultValue: 'Import recipients' })}
              onPress={batch.apply}
              disabled={!batch.canApply}
              variant={batch.canApply ? 'accent' : 'secondary'}
              // Disabled = quiet sunken slab (secondary ink), not a washed-out accent.
              style={!batch.canApply ? styles.applyDisabled : undefined}
            />
          </View>
        </View>
      </View>

      {/* Same searchable, provider-driven currency list as the home balance. */}
      <CurrencySheet
        visible={showCurrency}
        selected={fiatCode}
        // Scoped, per-batch "priced in" currency — NOT the app-wide display
        // currency. A distinct title keeps it from reading as the global setting
        // (issue #80: the two pickers looked identical and seemed out of sync).
        title={t('send.batchCurrencyLabel', { defaultValue: 'Priced in' })}
        onSelect={batch.setFiatCode}
        onClose={() => setShowCurrency(false)}
      />
    </AppModal>
  );
}

const styles = createStyles(() => ({
  container: { paddingHorizontal: space['2xl'], paddingTop: space.lg, flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.lg },
  title: { fontSize: text['2xl'], ...inter.bold, color: color.fg.base },
  scroll: { flex: 1 },

  toggleRow: { flexDirection: 'row', marginBottom: space.md },
  paste: {
    minHeight: 84, maxHeight: 140, backgroundColor: color.bg.sunken, borderRadius: radius.xl,
    padding: space.lg, fontSize: text.sm, fontFamily: font.mono, color: color.fg.base,
    textAlignVertical: 'top', outlineStyle: 'none',
  } as any,
  sourceRow: { flexDirection: 'row', gap: space['2xl'], marginTop: space.xs },
  // Plain text-buttons — no card/border boxes (design language: light controls).
  sourceBtn: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44, paddingHorizontal: space.xs },
  sourceBtnText: { fontSize: text.sm, ...inter.semibold, color: color.fg.base },
  fileName: { fontSize: text.xs, ...inter.regular, color: color.fg.muted, marginTop: space.sm, marginLeft: space.xs, fontFamily: font.mono },

  currencyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  rowLabel: { fontSize: text.base, ...inter.medium, color: color.fg.muted },
  currencyValue: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  currencyCode: { fontSize: text.base, ...inter.semibold, color: color.fg.base },

  rateRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44 },
  // Hidden width-mirror for the content-sized rate input; must match rateInput's font.
  rateMirror: { position: 'absolute', opacity: 0, pointerEvents: 'none', fontSize: text.base, ...inter.semibold } as any,
  rateInput: {
    fontSize: text.base, ...inter.semibold, color: color.fg.base, paddingVertical: space.xs,
    borderBottomWidth: 1, borderBottomColor: color.border.strong, textAlign: 'center', outlineStyle: 'none',
  } as any,
  rateResetBtn: { marginLeft: 'auto' },
  rateReset: { fontSize: text.sm, ...inter.semibold, color: color.fg.muted },
  hintText: { fontSize: text.xs, ...inter.regular, color: color.fg.muted, marginTop: space.sm },

  preview: { marginTop: space.lg, gap: 2 },
  pRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm, paddingHorizontal: space.sm, borderRadius: radius.md },
  pRowBad: { opacity: 0.5 },
  pInfo: { flex: 1, minWidth: 0, gap: 1 },
  pNameRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexShrink: 1, minWidth: 0 },
  pName: { fontSize: text.sm, ...inter.semibold, color: color.fg.base, flexShrink: 1 },
  pAddr: { fontSize: text.xs, fontFamily: font.mono, color: color.fg.muted },
  pAmt: { alignItems: 'flex-end', gap: 1 },
  pFiat: { fontSize: text.xs, ...inter.regular, color: color.fg.muted },
  pTokenRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  pToken: { fontSize: text.sm, ...inter.semibold, color: color.fg.base },
  pSkip: { fontSize: text.sm, ...inter.regular, color: color.fg.subtle },

  noticeRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.md, paddingHorizontal: space.sm },
  noticeText: { flex: 1, fontSize: text.xs, ...inter.medium, color: color.warning.base },

  footer: { paddingTop: space.md, gap: space.sm, borderTopWidth: 1, borderTopColor: color.border.base },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.sm },
  totalLabel: { fontSize: text.sm, ...inter.medium, color: color.fg.muted },
  totalRight: { alignItems: 'flex-end' },
  totalToken: { fontSize: text.lg, ...inter.bold, color: color.fg.base },
  totalOver: { color: color.error.base },
  totalFiat: { fontSize: text.xs, ...inter.regular, color: color.fg.muted },
  warnText: { fontSize: text.xs, ...inter.medium, color: color.error.base, paddingHorizontal: space.sm },

  applyDisabled: { backgroundColor: color.bg.sunken, borderWidth: 0 },
}));
