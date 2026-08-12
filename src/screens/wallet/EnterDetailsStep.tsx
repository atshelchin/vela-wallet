import { ContactAvatar } from '@/components/contacts/ContactAvatar';
import { RecipientTrust } from '@/components/contacts/RecipientTrust';
import { RecipientTypeBadge } from '@/components/contacts/RecipientTypeBadge';
import { MultiRecipientEditor } from '@/components/send/MultiRecipientEditor';
import { TokenLogo } from '@/components/TokenLogo';
import { AmountText } from '@/components/ui/AmountText';
import { AutoGrowTextInput } from '@/components/ui/AutoGrowTextInput';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { VelaButton } from '@/components/ui/VelaButton';
import { fadeInDown } from '@/constants/entering';
import { color, space, text } from '@/constants/theme';
import { styles } from './SendScreen.styles';
import { amountFontSize, isValidAddress, sanitizeAmountInput, shortAddr } from './send-utils';
import { chainName, tokenBadgeNetwork } from '@/models/network';
import { isNativeToken, tokenBalanceDouble, tokenChainId, tokenId, tokenLogoURLs, tokenUsdValue, type APIToken } from '@/models/types';
import { BATCH_MAX_RECIPIENTS } from '@/services/batch-send';
import { ZERO_DECIMAL_CODES } from '@/services/currency';
import { formatTokenAmount, numberSeparators, parseLocaleNumber } from '@/services/locale-format';
import { copyToClipboard } from '@/services/platform';
import { ArrowUpDown, BookUser, Check, Copy, FileUp, Plus, ScanLine } from 'lucide-react-native';
import React from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Animated from 'react-native-reanimated';
import type { SendController } from './send-controller-types';

export function EnterDetailsStep({ c }: { c: SendController }) {
  const {
    t,
    prefilledRecipient,
    locked,
    amountLocked,
    dc,
    formatUsd,
    selectedToken,
    changeToken,
    recipient,
    setRecipient,
    amount,
    setAmount,
    splitMode,
    recipients,
    splitOverBalance,
    multiSelectMode,
    openScanner,
    copiedContract,
    setCopiedContract,
    estimatingGas,
    inputInUsd,
    amountFiatCode,
    denomToggleShown,
    denomToggleEnabled,
    denomToggleReason,
    tokenAmount,
    toggleFiatInput,
    openContactPicker,
    openBatchImport,
    amountWarning,
    recipientIdentity,
    recipientRisk,
    amountInputRef,
    canContinue,
    enterSplitMode,
    handleRecipientsChange,
    pickedTokens,
    multiTokenSpecs,
    handleContinue,
    handleMaxAmount,
  } = c;

    if (!selectedToken) return null;
    const balance = tokenBalanceDouble(selectedToken);
    const logos = tokenLogoURLs(selectedToken);
    const chain = chainName(tokenChainId(selectedToken));
    // Fiat-input mode is denominated in the currency the FIGURE was typed in —
    // `amountFiatCode`, straight from the controller — and not in whatever
    // `dc.code` happens to be this frame. Those two differ for exactly one
    // instant (a display-currency commit landing under a typed figure), and
    // that instant is when this screen used to lie: it had only a boolean, so
    // it printed a number typed in USD with a CNY label beside it.
    //
    // The ⇅ row below no longer computes its own conversion either: it reads the
    // controller's `tokenAmount`, which is the very string the signature is
    // built from. A screen may not advertise an answer its own button would not
    // produce — this row used to print "⇅ 5000 USDC" under "5000 CNY" while the
    // controller held '0', and the one action it offered would have made the
    // lie true. (The old expression divided by the fiat price with a `|| 1`
    // fallback: an implicit rate of 1 on the display side of the very screen
    // that refuses one on the money side.)
    const fiatDecimals = ZERO_DECIMAL_CODES.has(amountFiatCode ?? dc.code) ? 0 : 2;

    return (
      <ScrollView style={styles.stepContainer} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Animated.View entering={fadeInDown(0, 300)}>
          <Text style={styles.stepTitle}>{multiSelectMode ? t('send.multiSendTitle') : t('send.sendTitle', { symbol: selectedToken.symbol })}</Text>

          {/* Token hero (single/split) — open row on the page, tap to switch token.
              Multi-select hides it. */}
          {!multiSelectMode && (
          <View style={styles.heroBlock}>
            <Pressable style={styles.heroRow} disabled={locked} onPress={changeToken}>
              <TokenLogo symbol={selectedToken.symbol} logoUrls={logos} chain={tokenBadgeNetwork(selectedToken)} size={44} />
              <View style={styles.heroIdentity}>
                <Text style={styles.heroSymbol}>{selectedToken.symbol}</Text>
                <Text style={styles.heroChain}>{chain}</Text>
              </View>
              <View style={styles.heroBalance}>
                <AmountText
                  text={formatTokenAmount(balance, { compact: true })}
                  size={text.xl}
                  minScale={0.7}
                  style={styles.heroAmount}
                  containerStyle={styles.heroAmountBox}
                />
                {tokenUsdValue(selectedToken) > 0 && (
                  <Text style={styles.heroUsd}>
                    {formatUsd(tokenUsdValue(selectedToken))}
                  </Text>
                )}
              </View>
            </Pressable>
            {!isNativeToken(selectedToken) && selectedToken.tokenAddress ? (<>
              <View style={styles.heroDivider} />
              <Pressable
                style={styles.contractRow}
                onPress={() => {
                  copyToClipboard(selectedToken.tokenAddress!);
                  setCopiedContract(true);
                  setTimeout(() => setCopiedContract(false), 1500);
                }}
                hitSlop={6}
              >
                <Text style={styles.contractLabel}>{t('addToken.tokenAddressLabel')}</Text>
                <Text style={styles.contractAddr} numberOfLines={1}>{shortAddr(selectedToken.tokenAddress)}</Text>
                {copiedContract
                  ? <Check size={14} color={color.success.base} strokeWidth={2.5} />
                  : <Copy size={14} color={color.fg.subtle} strokeWidth={2} />}
              </Pressable>
            </>) : null}
          </View>
          )}

          {/* Single-recipient flow (default). Split / multiSelect replace it below. */}
          {!splitMode && !multiSelectMode && (<>
          {/* Amount — open hero on the page (no box); large display with inline unit */}
          <SectionLabel>{t('send.amountLabel', { defaultValue: 'Amount' })}</SectionLabel>
          <Pressable style={styles.amountWrap} onPress={() => { if (!amountLocked) amountInputRef.current?.focus(); }}>
            <View style={styles.amountTopRow}>
              <View style={styles.amountInputWrap}>
                <TextInput
                  ref={amountInputRef}
                  testID="amount-input"
                  style={[styles.amountInput, { fontSize: amountFontSize(amount) }]}
                  placeholder="0"
                  placeholderTextColor={color.fg.subtle}
                  // Stored canonical (dot); shown with the locale decimal so a
                  // dot_comma user sees "47,28" and can type a comma — every
                  // downstream parseFloat(amount) keeps its canonical input.
                  value={amount.replace('.', numberSeparators().decimal)}
                  editable={!amountLocked}
                  onChangeText={(t) => {
                    const maxDec = inputInUsd ? fiatDecimals : selectedToken.decimals;
                    const sanitized = sanitizeAmountInput(parseLocaleNumber(t), maxDec);
                    if (sanitized !== null) setAmount(sanitized);
                  }}
                  keyboardType="decimal-pad"
                  selectionColor={color.fg.muted}
                />
              </View>
              {amount || amountLocked ? (
                <Text style={[styles.unitLabel, { fontSize: Math.max(amountFontSize(amount || '0') * 0.7, 16) }]}>
                  {amountFiatCode ?? selectedToken.symbol}
                </Text>
              ) : (
                <Pressable onPress={handleMaxAmount} hitSlop={8} style={styles.maxBtn}>
                  <Text style={styles.maxBtnText}>{t('send.maxBtn')}</Text>
                </Pressable>
              )}
            </View>
            {/* Conversion toggle row — below the input, like ↕ 0.0113 ETH.
                Shown and enabled by the controller, not by a second reading of
                `priceUsd` here: the core refused to enter fiat without a rate
                for the display currency while this row rendered on `priceUsd`
                alone, so the control looked live and swallowed the tap. It is
                visibly disabled now, and it stays on screen while the figure is
                fiat even for an unpriced token — leaving is the only way out of
                a mode whose amount can no longer resolve. */}
            {denomToggleShown ? (
              <Pressable
                onPress={toggleFiatInput}
                disabled={!denomToggleEnabled}
                hitSlop={8}
                style={[styles.conversionRow, !denomToggleEnabled && styles.conversionRowDisabled]}
              >
                <ArrowUpDown size={14} color={color.fg.muted} strokeWidth={2.5} />
                <Text style={styles.conversionText}>
                  {amount
                    ? inputInUsd
                      ? `${parseFloat(tokenAmount || '0').toFixed(Math.min(selectedToken.decimals, 8)).replace(/\.?0+$/, '')} ${selectedToken.symbol}`
                      : formatUsd(parseFloat(amount || '0') * (selectedToken.priceUsd ?? 0))
                    : inputInUsd
                      ? `0 ${selectedToken.symbol}`
                      : formatUsd(0)}
                </Text>
              </Pressable>
            ) : null}
            {/* The dimming said "no"; this says why. It is the one branch the
                amount warning cannot reach — the figure is in token units and
                resolves perfectly, so nothing else on this screen has any
                reason to speak. */}
            {denomToggleShown && denomToggleReason ? (
              <Text style={styles.conversionDisabledReason}>{denomToggleReason}</Text>
            ) : null}
          </Pressable>
          {amountWarning ? (
            <Text style={styles.amountWarning}>{amountWarning}</Text>
          ) : null}

          {/* Recipient */}
          <View style={styles.fieldLabelRow}>
            <Text style={styles.fieldLabel}>{t('send.recipientLabel')}</Text>
          </View>
          <View style={styles.inputWrap}>
            <AutoGrowTextInput
              style={styles.input}
              minHeight={48}
              maxHeight={100}
              placeholder={t('send.recipientPlaceholder')}
              placeholderTextColor={color.fg.subtle}
              value={recipient}
              onChangeText={(t) => setRecipient(t)}
              autoCapitalize="none"
              autoCorrect={false}
              // Read-only for a prefilled recipient. This prop is the SCREEN's
              // half of the rule; the other half now lives with the machine
              // that builds the call — `send.rs::view_recipient_locked` refuses
              // `SetRecipient` for a LOCKED request, the same way it already
              // refused `SetAmount` for a locked amount. Note the two
              // conditions differ on purpose: an unlocked prefill (a contact
              // tapped "Send") is read-only here but re-settable there, because
              // `changeToken` clears and restores it.
              editable={!prefilledRecipient}
              blurOnSubmit
              returnKeyType="done"
            />
            {!prefilledRecipient && (
              <View style={styles.inputIcons}>
                {/* Scan in-flow (one tap) — plain icon, no container. */}
                <Pressable
                  onPress={openScanner}
                  hitSlop={8}
                  style={styles.addrActionBtn}
                  accessibilityRole="button"
                  accessibilityLabel={t('send.scanAria', { defaultValue: 'Scan a QR code' })}
                >
                  <ScanLine size={22} color={color.fg.muted} strokeWidth={2} />
                </Pressable>
                {/* Address book / recent recipients. */}
                <Pressable
                  onPress={() => openContactPicker(null)}
                  hitSlop={8}
                  style={styles.addrActionBtn}
                  accessibilityRole="button"
                  accessibilityLabel={t('send.recipientPickAria', { defaultValue: 'Choose recipient' })}
                >
                  <BookUser size={22} color={color.fg.muted} strokeWidth={2} />
                </Pressable>
              </View>
            )}
          </View>

          {/* Recipient identity — SAME treatment as the confirm row: avatar + name + the trust
              marker on the right (calm colors; the name is ink, not accent-orange). */}
          {recipient.length > 0 && isValidAddress(recipient) && (
            <View style={styles.recipientIdentityRow}>
              <ContactAvatar name={recipientIdentity?.name ?? ''} address={recipient} size={28} />
              <View style={styles.nameRow}>
                <RecipientTrust address={recipient} identity={recipientIdentity} prominent nameOnly />
                <RecipientTypeBadge address={recipient} identity={recipientIdentity} isContract={recipientRisk?.isContract} />
              </View>
            </View>
          )}

          {/* Send this token to several people at once → split mode, or import a
              payroll table (fiat → token) in one go.

              Hidden — not disabled — for a locked request: one scanned EIP-681
              request pays one payee, and `send.rs` now refuses `EnterSplitMode`
              / `SeedSplitRecipients` while locked, so the mode cannot be
              reached through any other door either. Removing the affordance
              rather than dimming it is why a silent refusal underneath is safe:
              there is no lit control here to press and have nothing happen. */}
          {!locked && !prefilledRecipient && (
            <View style={styles.splitEntryRow}>
              <Pressable onPress={enterSplitMode} style={styles.addRecipientEntry}>
                <Plus size={16} color={color.accent.base} strokeWidth={2.5} />
                <Text style={styles.addRecipientEntryText}>{t('send.addRecipient', { defaultValue: 'Add recipient' })}</Text>
              </Pressable>
              <Pressable onPress={openBatchImport} style={styles.addRecipientEntry} testID="send-batch-import">
                <FileUp size={16} color={color.accent.base} strokeWidth={2.5} />
                <Text style={styles.addRecipientEntryText}>{t('send.batchImport', { defaultValue: 'Import list' })}</Text>
              </Pressable>
            </View>
          )}
          </>)}

          {splitMode && selectedToken && (
            <MultiRecipientEditor
              recipients={recipients}
              onChange={handleRecipientsChange}
              tokenSymbol={selectedToken.symbol}
              decimals={selectedToken.decimals}
              priceUsd={selectedToken.priceUsd}
              overBalance={splitOverBalance}
              formatUsd={formatUsd}
              onPickContact={(id) => openContactPicker(id)}
              onImport={openBatchImport}
              maxRecipients={BATCH_MAX_RECIPIENTS}
            />
          )}

          {/* ② multi-token send — exact amounts sent (native net of its gas reserve). */}
          {multiSelectMode && (() => {
            const cid = tokenChainId(selectedToken);
            const specs = multiTokenSpecs(cid);
            // Amount actually sent per token: ERC-20 = full balance; native = balance
            // minus its gas reserve (0 if the native line was dropped).
            const amountOf = (tk: APIToken) => {
              const addr = isNativeToken(tk) ? null : tk.tokenAddress;
              const spec = specs.find((s) => s.tokenAddress === addr);
              return spec ? parseFloat(spec.amount) : 0;
            };
            const total = pickedTokens.reduce((s, tk) => s + amountOf(tk) * (tk.priceUsd ?? 0), 0);
            return (<>
            <View style={styles.multiBlock}>
              <View style={styles.mtSummary}>
                <Text style={styles.mtSummaryTitle}>
                  {t('send.multiSendSummary', { n: pickedTokens.length, chain: chainName(cid) })}
                </Text>
                <Text style={styles.mtSummaryUsd}>{formatUsd(total)}</Text>
              </View>
              {pickedTokens.map((tk) => {
                const amt = amountOf(tk);
                const usd = amt * (tk.priceUsd ?? 0);
                // Trimmed for gas: sent amount is below full balance. True for the native coin
                // AND for any ERC-20 fee asset whose line is trimmed for the gas reserve.
                const reserved = amt < tokenBalanceDouble(tk);
                return (
                  <View key={tokenId(tk)}>
                    <View style={styles.mtSep} />
                    <View style={styles.mtRow}>
                      <TokenLogo symbol={tk.symbol} logoUrls={tokenLogoURLs(tk)} chain={tokenBadgeNetwork(tk)} size={32} />
                      <View style={styles.mtInfo}>
                        <Text style={styles.mtSym}>{tk.symbol}</Text>
                        <Text style={styles.mtChain}>
                          {chainName(tokenChainId(tk))}{reserved ? ` · ${t('send.gasReserved')}` : ''}
                        </Text>
                      </View>
                      <View style={styles.mtVals}>
                        <Text style={styles.mtBal}>{formatTokenAmount(amt, { compact: true })}</Text>
                        {usd > 0 && <Text style={styles.mtUsd}>{formatUsd(usd)}</Text>}
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>

            <View style={[styles.fieldLabelRow, { marginTop: space.xl }]}>
              <Text style={styles.fieldLabel}>{t('send.recipientLabel')}</Text>
            </View>
            <View style={styles.inputWrap}>
              <AutoGrowTextInput
                style={styles.input}
                minHeight={48}
                maxHeight={100}
                placeholder={t('send.recipientPlaceholder')}
                placeholderTextColor={color.fg.subtle}
                value={recipient}
                onChangeText={(t) => setRecipient(t)}
                autoCapitalize="none"
                autoCorrect={false}
                blurOnSubmit
                returnKeyType="done"
              />
              <View style={styles.inputIcons}>
                <Pressable onPress={() => openContactPicker(null)} hitSlop={8} style={styles.addrActionBtn}>
                  <BookUser size={22} color={color.fg.muted} strokeWidth={2} />
                </Pressable>
              </View>
            </View>
            {recipient.length > 0 && isValidAddress(recipient) && (
              <View style={styles.recipientIdentityRow}>
                <ContactAvatar name={recipientIdentity?.name ?? ''} address={recipient} size={28} />
                <View style={styles.nameRow}>
                  <RecipientTrust address={recipient} identity={recipientIdentity} prominent nameOnly />
                  <RecipientTypeBadge address={recipient} identity={recipientIdentity} isContract={recipientRisk?.isContract} />
                </View>
              </View>
            )}
          </>);
          })()}

          <VelaButton
            title={estimatingGas ? t('send.preparing') : t('send.continueBtn')}
            onPress={handleContinue}
            loading={estimatingGas}
            style={styles.continueBtn}
            disabled={!canContinue}
          />
        </Animated.View>
      </ScrollView>
    );
}
