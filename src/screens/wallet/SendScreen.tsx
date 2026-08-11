import { ContactPicker } from '@/components/contacts/ContactPicker';
import { QRScanner } from '@/components/QRScanner';
import { BatchImportSheet } from '@/components/send/BatchImportSheet';
import { makeRecipientId } from '@/components/send/MultiRecipientEditor';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { TokenSelector } from '@/components/ui/TokenSelector';
import { TransactionReceipt } from '@/components/ui/TransactionReceipt';
import { TreasuryBootstrapSheet } from '@/components/ui/TreasuryBootstrapSheet';
import { VelaButton } from '@/components/ui/VelaButton';
import { fadeInDown } from '@/constants/entering';
import { color } from '@/constants/theme';
import { styles } from './SendScreen.styles';
import { ConfirmStep } from './ConfirmStep';
import { EnterDetailsStep } from './EnterDetailsStep';
import { useSendController } from './useSendController';
import { tokenChainId, tokenLogoURLs } from '@/models/types';
import { BATCH_MAX_RECIPIENTS } from '@/services/batch-send';
import { AlertCircle, ArrowLeft, Globe, X } from 'lucide-react-native';
import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';



export default function SendScreen() {
  const c = useSendController();
  const {
    t,
    router,
    locked,
    activeAccount,
    address,
    dc,
    step,
    lockError,
    resolvingLock,
    addingNetwork,
    addNetworkMsg,
    tokens,
    loading,
    selectedToken,
    recipient,
    pickerTarget,
    multiSelectChainId,
    showScanner,
    closeScanner,
    handleScan,
    txStatus,
    txHash,
    userOpHash,
    receiptTransfers,
    receiptKind,
    receiptFailed,
    feeHeld,
    feeRejected,
    receiptAmount,
    receiptUsdValue,
    treasuryBootstrap,
    dismissTreasurySheet,
    retryAfterBootstrap,
    showContactPicker,
    closeContactPicker,
    showBatchImport,
    closeBatchImport,
    openScanner,
    recipientIdentity,
    handleAddNetwork,
    refreshTokens,
    seedSplitRecipients,
    applyPickedAddress,
    handleSelectToken,
    handleBack,
    handleDone,
    saveReceiptContact,
    tokenMultiSelect,
  } = c;

  const renderSelectToken = () => (
    <Animated.View style={styles.stepContainer} entering={fadeInDown(0, 300)}>
      <Text style={styles.stepTitle}>{t('send.selectTokenTitle')}</Text>
      <TokenSelector
        tokens={tokens}
        loading={loading}
        onSelect={handleSelectToken}
        onAddChanged={refreshTokens}
        initialChainId={multiSelectChainId}
        multiSelect={tokenMultiSelect}
      />
    </Animated.View>
  );



  // Exception screen for a scanned EIP-681 request Vela can't fulfil as-is.
  const renderLockError = () => {
    if (!lockError) return null;
    if (lockError.kind === 'network') {
      return (
        <View style={styles.lockErrorWrap}>
          <View style={styles.lockErrorIcon}><Globe size={30} color={color.accent.base} strokeWidth={2} /></View>
          <Text style={styles.lockErrorTitle}>{t('send.lock.netTitle')}</Text>
          <Text style={styles.lockErrorBody}>{t('send.lock.netBody', { chainId: lockError.chainId })}</Text>
          {addNetworkMsg ? <Text style={styles.lockErrorMsg}>{addNetworkMsg}</Text> : null}
          <VelaButton
            title={t('send.lock.addNetwork')}
            onPress={() => handleAddNetwork(lockError.chainId)}
            loading={addingNetwork}
            style={styles.lockErrorBtn}
          />
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <Text style={styles.lockErrorCancel}>{t('common.cancel')}</Text>
          </Pressable>
        </View>
      );
    }
    return (
      <View style={styles.lockErrorWrap}>
        <View style={styles.lockErrorIcon}><AlertCircle size={30} color={color.accent.base} strokeWidth={2} /></View>
        <Text style={styles.lockErrorTitle}>{t('send.lock.tokenTitle')}</Text>
        <Text style={styles.lockErrorBody}>{t('send.lock.tokenBody')}</Text>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.lockErrorCancel}>{t('common.cancel')}</Text>
        </Pressable>
      </View>
    );
  };

  return (
    <ScreenContainer>
      {/* Nav bar */}
      <View style={styles.navBar}>
        <Pressable onPress={handleBack} hitSlop={8} style={styles.navBtn}>
          {step === 'select-token'
            ? <X size={22} color={color.fg.base} strokeWidth={2} />
            : <ArrowLeft size={22} color={color.fg.base} strokeWidth={2} />
          }
        </Pressable>
        <View style={styles.navSpacer} />
      </View>

      {/* Transaction confirmed — full-screen receipt replaces everything */}
      {lockError ? (
        renderLockError()
      ) : (locked && resolvingLock && !selectedToken) ? (
        <View style={styles.lockLoading}><ActivityIndicator color={color.accent.base} /></View>
      ) : txStatus === 'confirmed' && selectedToken ? (
        <TransactionReceipt
          from={activeAccount?.address ?? ''}
          fromName={activeAccount?.name}
          to={recipient}
          toName={recipientIdentity?.name}
          amount={receiptAmount}
          symbol={selectedToken.symbol}
          chainId={tokenChainId(selectedToken)}
          txHash={txHash ?? ''}
          userOpHash={userOpHash ?? undefined}
          logoUrls={tokenLogoURLs(selectedToken)}
          usdValue={receiptUsdValue}
          rate={dc.shown.rate}
          currencyCode={dc.shown.code}
          currencySymbol={dc.shown.symbol}
          timestamp={new Date()}
          recipientIdentity={recipientIdentity}
          transfers={receiptTransfers ?? undefined}
          batchKind={receiptKind ?? undefined}
          status={receiptFailed ? 'failed' : (txHash ? 'confirmed' : 'submitted')}
          holdReason={feeRejected ? 'fee-rejected' : feeHeld ? 'fee-hold' : undefined}
          onDone={handleDone}
          onSaveContact={receiptKind === 'split' ? undefined : saveReceiptContact}
        />
      ) : (
        <>
          {step === 'select-token' && renderSelectToken()}
          {step === 'enter-details' && <EnterDetailsStep c={c} />}
          {step === 'confirm' && <ConfirmStep c={c} />}
        </>
      )}

      <QRScanner
        visible={showScanner}
        onScan={handleScan}
        onClose={closeScanner}
      />

      {/* Relayer float depleted on this network — community bootstrap ask
          (non-refundable treasury contribution), shown instead of the generic
          error / personal top-up surfaces. */}
      <TreasuryBootstrapSheet
        visible={!!treasuryBootstrap}
        status={treasuryBootstrap}
        onClose={dismissTreasurySheet}
        onRetry={retryAfterBootstrap}
      />

      <ContactPicker
        visible={showContactPicker}
        onClose={closeContactPicker}
        onSelect={(addr) => applyPickedAddress(addr)}
        onSelectGroup={locked || pickerTarget ? undefined : (addrs) =>
          seedSplitRecipients(addrs.map((a) => ({ id: makeRecipientId(), address: a, amount: '' })))}
        onScan={locked ? undefined : openScanner}
        myAddress={address}
      />

      {selectedToken && (
        <BatchImportSheet
          visible={showBatchImport}
          onClose={closeBatchImport}
          token={selectedToken}
          currencyCode={dc.code}
          currencySymbol={dc.symbol}
          onApply={seedSplitRecipients}
          maxRecipients={BATCH_MAX_RECIPIENTS}
        />
      )}
    </ScreenContainer>
  );
}
