import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Keyboard, Image, useColorScheme } from 'react-native';
import { useTranslation } from 'react-i18next';
import Animated from 'react-native-reanimated';
import { fadeIn, fadeInDown } from '@/constants/entering';
import { color, text, inter, space, radius, font, createStyles } from '@/constants/theme';
import { VelaButton } from '@/components/ui/VelaButton';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { BugReportModal } from '@/components/ui/BugReportModal';
import { useLanguagePreference } from '@/i18n/language';
import { useCreateWallet } from '@/hooks/use-create-wallet';
import {
  ArrowLeft, CheckCircle2, AlertTriangle, Loader, Copy, Check, Square, CheckSquare,
  KeyRound, Plus, X,
} from 'lucide-react-native';
import { copyToClipboard, openBrowser } from '@/services/platform';
import {
  resolveAuthenticator,
  fallbackLabel,
  type AuthenticatorLabel,
} from '@/services/authenticator-info';

/** i18n keys for the semantic fallback names `authenticator-info` returns. */
const AUTHENTICATOR_KIND_KEYS = {
  'security-key': 'onboarding.create.providerSecurityKey',
  platform: 'onboarding.create.providerPlatform',
  generic: 'onboarding.create.providerGeneric',
  unknown: 'onboarding.create.providerUnknown',
} as const;

/** Resolve a key row's provider label (AAGUID → name/icon, cached, best
 *  effort); renders the semantic fallback until — or instead of — the fetch. */
function useAuthenticatorLabel(aaguid: string, attachment: string, transports: string) {
  const [label, setLabel] = useState<AuthenticatorLabel>(() => fallbackLabel(attachment, transports));
  useEffect(() => {
    let live = true;
    resolveAuthenticator(aaguid || null, attachment, transports).then((resolved) => {
      if (live) setLabel(resolved);
    });
    return () => { live = false; };
  }, [aaguid, attachment, transports]);
  return label;
}

/** One founding-key row: provider icon, editable label, provider name +
 *  sync badge, confirmation state, remove. */
function KeyRowView({ index, row, flow, dark }: {
  index: number;
  row: { name: string; authenticatorAttachment: string; transports: string; confirmed: boolean; synced: boolean; aaguid: string };
  flow: ReturnType<typeof useCreateWallet>;
  dark: boolean;
}) {
  const { t } = useTranslation();
  const label = useAuthenticatorLabel(row.aaguid, row.authenticatorAttachment, row.transports);
  const iconUrl = (dark ? label.iconUrlDark : label.iconUrl) ?? label.iconUrl;
  const providerName = label.name ?? t(AUTHENTICATOR_KIND_KEYS[label.kind]);
  return (
    <View style={[styles.keyRow, index > 0 && styles.keyRowDivider]}>
      {iconUrl ? (
        <Image source={{ uri: iconUrl }} style={styles.keyIcon} />
      ) : (
        <KeyRound size={18} color={color.fg.muted} strokeWidth={2} />
      )}
      <View style={styles.keyBody}>
        {index === 0 ? (
          <Text style={styles.keyName} numberOfLines={1}>{row.name}</Text>
        ) : (
          <TextInput
            style={styles.keyNameInput}
            defaultValue={row.name}
            onEndEditing={(e) => flow.renameKey(index, e.nativeEvent.text)}
            returnKeyType="done"
            editable={!flow.busy}
          />
        )}
        <View style={styles.keyMetaRow}>
          <Text style={styles.keyProvider} numberOfLines={1}>{providerName}</Text>
          <View style={[styles.keyBadge, row.synced ? styles.keyBadgeSynced : styles.keyBadgeDeviceOnly]}>
            <Text style={[styles.keyBadgeText, row.synced ? styles.keyBadgeTextSynced : styles.keyBadgeTextDeviceOnly]}>
              {row.synced ? t('onboarding.create.keySyncedBadge') : t('onboarding.create.keyDeviceOnlyBadge')}
            </Text>
          </View>
        </View>
      </View>
      {row.confirmed ? (
        <Check size={16} color={color.success.base} strokeWidth={2.5} />
      ) : (
        <Pressable onPress={() => flow.confirmKey(index)} hitSlop={8} disabled={flow.busy}>
          <Text style={styles.confirmKeyText}>{t('onboarding.create.confirmKeyBtn')}</Text>
        </Pressable>
      )}
      {index > 0 && !flow.busy ? (
        <Pressable
          onPress={() => flow.removeKey(index)}
          hitSlop={8}
          accessibilityLabel={t('onboarding.create.removeKeyBtn')}
        >
          <X size={16} color={color.fg.subtle} strokeWidth={2} />
        </Pressable>
      ) : null}
    </View>
  );
}

interface Props {
  onCreated?: (address: string, name: string) => void;
  onBack?: () => void;
  onOpenSettings?: () => void;
}

// Stable label keys for the acknowledgment checklist; t() is called inside the
// component. THREE gates, matching the core's ACK_COUNT, and each one a fact
// about where something ends up: the public key and the name go on-chain, the
// private key stays in the device or on a security key, and the legal assent.
// The last item is rendered with inline links — handled specially in JSX.
//
// The recovery assurance that used to sit beside them is gone: it described a
// benefit, and mixing one of those into a list of consequences teaches people
// to skim the list.
const ACKNOWLEDGMENT_KEYS = [
  'onboarding.create.ack0',
  'onboarding.create.ack1',
  'onboarding.create.ack2',
] as const;

/**
 * Renders the create-wallet flow. It holds no business state: every decision —
 * when to register, when a cancelled verification may resume, when it is safe
 * to persist — belongs to the controller (`use-create-wallet`), which on web is
 * the portable Rust state machine and on native today's TypeScript path.
 *
 * What stays here is genuinely visual: copy-confirmation, the technical-details
 * disclosure, and the bug-report sheet.
 */
export function CreateWalletScreen({ onCreated, onBack, onOpenSettings }: Props) {
  const { t } = useTranslation();
  const flow = useCreateWallet({ onCreated });
  const [addressCopied, setAddressCopied] = useState(false);
  const [showBugReport, setShowBugReport] = useState(false);
  const [showErrorDetail, setShowErrorDetail] = useState(false);
  const { resolved: language } = useLanguagePreference();
  const dark = useColorScheme() === 'dark';

  const created = flow.stage === 'created';
  const syncFailed = flow.stage === 'sync_failed';
  const addKeys = flow.stage === 'add_keys';
  const statusText = flow.statusKey ? t(flow.statusKey) : '';

  return (
    <ScreenContainer edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        {onBack && flow.canGoBack && (
          <Pressable onPress={() => { flow.goBack(); onBack(); }} hitSlop={8} style={styles.backButton}>
            <ArrowLeft size={20} color={color.accent.base} strokeWidth={2.5} />
          </Pressable>
        )}
        <Text style={styles.title}>
          {created ? t('onboarding.create.headerCreated') : syncFailed ? t('onboarding.create.headerSyncFailed') : t('onboarding.create.headerDefault')}
        </Text>
        {onBack && flow.canGoBack && <View style={styles.headerSpacer} />}
      </View>

      <View style={styles.content}>
        {created ? (
          <Animated.View style={styles.stateContainer} entering={fadeInDown(0, 400)}>
            <View style={styles.stateIconWrap}>
              <CheckCircle2 size={40} color={color.success.base} strokeWidth={1.5} />
            </View>
            <Text style={styles.successTitle}>{t('onboarding.create.successTitle')}</Text>
            <Text style={styles.successMessage}>
              {/* `count` is the FOUNDING KEY count, not the network count it
                  used to be — the sentence is now about the key set, and
                  handing it 12 networks would tell a one-key wallet it has
                  twelve keys. */}
              {t('onboarding.create.successMessage', { count: flow.keys.length })}
            </Text>

            {/* Address display */}
            {flow.address && (
              <Pressable
                style={styles.addressBox}
                onPress={async () => {
                  await copyToClipboard(flow.address!);
                  setAddressCopied(true);
                  setTimeout(() => setAddressCopied(false), 2000);
                }}
              >
                <Text style={styles.addressText} numberOfLines={1} ellipsizeMode="middle">
                  {flow.address}
                </Text>
                {addressCopied ? (
                  <Check size={14} color={color.success.base} strokeWidth={2.5} />
                ) : (
                  <Copy size={14} color={color.fg.subtle} strokeWidth={2} />
                )}
              </Pressable>
            )}

            <Text style={styles.verifyHint}>
              {t('onboarding.create.verifyHint')}
            </Text>
          </Animated.View>
        ) : syncFailed ? (
          <Animated.View style={styles.stateContainer} entering={fadeInDown(0, 400)}>
            <View style={styles.stateIconWrapError}>
              <AlertTriangle size={32} color={color.accent.base} strokeWidth={2} />
            </View>
            <Text style={styles.errorTitle}>{t('onboarding.create.syncFailedTitle')}</Text>
            <Text style={styles.errorMessage}>
              {t('onboarding.create.syncFailedMessage')}
            </Text>
            <Text style={styles.hint}>
              {t('onboarding.create.syncFailedHint')}
            </Text>
            {onOpenSettings && (
              <Pressable style={styles.settingsLink} onPress={onOpenSettings}>
                <Text style={styles.settingsLinkText}>{t('onboarding.create.openSettings')}</Text>
              </Pressable>
            )}
            <Pressable style={styles.reportLink} onPress={() => setShowBugReport(true)}>
              <Text style={styles.reportLinkText}>{t('onboarding.create.reportError')}</Text>
            </Pressable>
            {/* Raw error text is for the bug report, not the user — keep it
                behind a quiet disclosure instead of an alarming red box. */}
            {flow.syncErrorDetail ? (
              <>
                <Pressable style={styles.detailsToggle} onPress={() => setShowErrorDetail(v => !v)}>
                  <Text style={styles.detailsToggleText}>{t('onboarding.create.technicalDetails')}</Text>
                </Pressable>
                {showErrorDetail ? (
                  <View style={styles.errorDetail}>
                    <Text style={styles.errorDetailText}>{flow.syncErrorDetail}</Text>
                  </View>
                ) : null}
              </>
            ) : null}
          </Animated.View>
        ) : addKeys ? (
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Animated.View entering={fadeIn(0, 400)}>
              <Text style={styles.label}>{t('onboarding.create.keysLabel')}</Text>

              {/* The founding keys, in the order that pins the address. */}
              <View style={styles.keyList}>
                {flow.keys.map((key, i) => (
                  <KeyRowView key={i} index={i} row={key} flow={flow} dark={dark} />
                ))}
              </View>

              {flow.needsSecondKey ? (
                <Text style={styles.needSecondKeyText}>
                  {t('onboarding.create.needSecondKeyHint')}
                </Text>
              ) : null}

              {flow.canAddKey ? (
                <Pressable style={styles.addKeyRow} onPress={() => flow.addKey('')} disabled={flow.busy}>
                  <Plus size={16} color={color.accent.base} strokeWidth={2.5} />
                  <Text style={styles.addKeyText}>{t('onboarding.create.addKeyBtn')}</Text>
                </Pressable>
              ) : null}

              <Text style={styles.hint}>{t('onboarding.create.keysHint')}</Text>

              {statusText ? (
                <Animated.View style={styles.statusRow} entering={fadeIn(0, 200)}>
                  <Loader size={14} color={color.info.base} />
                  <Text style={styles.status}>{statusText}</Text>
                </Animated.View>
              ) : null}

              <View style={styles.inlineBottom}>
                <VelaButton
                  title={t('onboarding.create.finishKeysBtn')}
                  onPress={flow.finishKeys}
                  disabled={!flow.canFinish}
                  loading={flow.busy}
                />
                {flow.showStartOver ? (
                  <Pressable style={styles.startOverLink} onPress={flow.startOver}>
                    <Text style={styles.startOverText}>{t('onboarding.create.startOverBtn')}</Text>
                  </Pressable>
                ) : null}
              </View>
            </Animated.View>
          </ScrollView>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Animated.View entering={fadeIn(0, 400)}>
              <Text style={styles.label}>{t('onboarding.create.accountNameLabel')}</Text>
              <TextInput
                style={styles.input}
                value={flow.name}
                onChangeText={flow.setName}
                placeholder={t('onboarding.create.accountNamePlaceholder')}
                placeholderTextColor={color.fg.subtle}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={() => Keyboard.dismiss()}
                editable={flow.nameEditable}
              />
              {flow.nameTooLong ? (
                <Text style={styles.nameTooLongText}>
                  {t('onboarding.create.nameTooLong')}
                </Text>
              ) : (
                <Text style={styles.hint}>
                  {t('onboarding.create.accountNameHint')}
                </Text>
              )}

              {/* Acknowledgment checklist */}
              <View style={styles.checklistWrap}>
                {ACKNOWLEDGMENT_KEYS.map((labelKey, i) => {
                  const checked = flow.acks[i];
                  const isLast = i === ACKNOWLEDGMENT_KEYS.length - 1;
                  return (
                    <Pressable
                      key={i}
                      style={styles.checkRow}
                      onPress={() => flow.toggleAck(i)}
                    >
                      {checked
                        ? <CheckSquare size={18} color={color.accent.base} strokeWidth={2} />
                        : <Square size={18} color={color.fg.subtle} strokeWidth={1.5} />
                      }
                      <Text style={styles.checkText}>
                        {isLast ? (
                          <>
                            {t('onboarding.create.ack2')}
                            <Text style={styles.checkLink} onPress={() => openBrowser('https://getvela.app/privacy')}>{t('onboarding.create.ack2PrivacyPolicy')}</Text>
                            {t('onboarding.create.ack2And')}
                            <Text style={styles.checkLink} onPress={() => openBrowser('https://getvela.app/terms')}>{t('onboarding.create.ack2Terms')}</Text>
                            {t('onboarding.create.ack2Period')}
                          </>
                        ) : t(labelKey)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {statusText ? (
                <Animated.View style={styles.statusRow} entering={fadeIn(0, 200)}>
                  <Loader size={14} color={color.info.base} />
                  <Text style={styles.status}>{statusText}</Text>
                </Animated.View>
              ) : null}

              <View style={styles.inlineBottom}>
                <VelaButton
                  title={t(flow.submitLabelKey)}
                  onPress={flow.submit}
                  disabled={!flow.canSubmit}
                  loading={flow.busy}
                />
                {/* Escape hatch for a passkey that keeps failing verification
                    (e.g. the provider reported success but never durably
                    stored it — issue #1): discard it and start over, instead
                    of being trapped retrying a signature that can never
                    succeed. */}
                {flow.showStartOver ? (
                  <>
                    <Text style={styles.startOverHint}>{t('onboarding.create.verifyStuckHint')}</Text>
                    <Pressable style={styles.startOverLink} onPress={flow.startOver}>
                      <Text style={styles.startOverText}>{t('onboarding.create.startOverBtn')}</Text>
                    </Pressable>
                  </>
                ) : null}
              </View>
            </Animated.View>
          </ScrollView>
        )}

        {/* Status + buttons for created/syncFailed states (not in ScrollView) */}
        {(created || syncFailed) && statusText ? (
          <Animated.View style={styles.statusRow} entering={fadeIn(0, 200)}>
            <Loader size={14} color={color.info.base} />
            <Text style={styles.status}>{statusText}</Text>
          </Animated.View>
        ) : null}
      </View>

      <View style={styles.bottom}>
        {created ? (
          <VelaButton
            title={t('onboarding.create.enterWalletBtn')}
            onPress={flow.enterWallet}
            loading={flow.busy}
          />
        ) : syncFailed ? (
          <VelaButton
            title={t('onboarding.create.retryUploadBtn')}
            onPress={flow.retryUpload}
            loading={flow.busy}
          />
        ) : null}
      </View>

      <BugReportModal
        visible={showBugReport}
        language={language}
        area="onboarding-sync"
        prefillWhat={t('onboarding.create.reportPrefill') + (flow.syncErrorDetail ? `\n\n${flow.syncErrorDetail}` : '')}
        onClose={() => setShowBugReport(false)}
      />
    </ScreenContainer>
  );
}

const styles = createStyles(() => ({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space.xl,
  },
  backButton: {
    position: 'absolute',
    left: 0,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSpacer: {
    width: 44,
  },
  title: {
    fontSize: text.xl,
    ...inter.bold,
    color: color.fg.base,
  },
  content: {
    flex: 1,
    paddingTop: space['4xl'],
  },
  label: {
    fontSize: text.sm,
    ...inter.semibold,
    color: color.fg.muted,
    marginBottom: space.md,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  input: {
    fontSize: text.lg,
    ...inter.regular,
    color: color.fg.base,
    backgroundColor: color.bg.raised,
    borderWidth: 1,
    borderColor: color.border.base,
    borderRadius: radius.xl,
    paddingHorizontal: space['2xl'],
    paddingVertical: space.xl,
  },
  hint: {
    fontSize: text.sm,
    ...inter.regular,
    color: color.fg.subtle,
    marginTop: space.lg,
    lineHeight: 18,
  },
  nameTooLongText: {
    fontSize: text.sm,
    ...inter.medium,
    color: color.accent.base,
    marginTop: space.lg,
    lineHeight: 18,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
    marginTop: space.xl,
  },
  status: {
    fontSize: text.sm,
    ...inter.medium,
    color: color.info.base,
  },
  bottom: {
    paddingBottom: space['3xl'],
  },

  // State containers
  stateContainer: {
    alignItems: 'center',
    gap: space.lg,
  },
  stateIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: color.success.soft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.md,
  },
  stateIconWrapError: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: color.accent.soft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.md,
  },
  successTitle: {
    fontSize: text.xl,
    ...inter.bold,
    color: color.success.base,
  },
  successMessage: {
    fontSize: text.base,
    ...inter.regular,
    color: color.fg.muted,
    lineHeight: 20,
    textAlign: 'center',
  },
  errorTitle: {
    fontSize: text.xl,
    ...inter.bold,
    color: color.accent.base,
  },
  errorMessage: {
    fontSize: text.base,
    ...inter.regular,
    color: color.fg.muted,
    lineHeight: 20,
    textAlign: 'center',
  },
  errorDetail: {
    padding: space.xl,
    width: '100%',
    backgroundColor: color.bg.sunken,
    borderRadius: radius.lg,
  },
  errorDetailText: {
    fontSize: text.xs,
    color: color.fg.muted,
    fontFamily: font.mono,
    lineHeight: 16,
  },
  detailsToggle: {
    paddingVertical: space.sm,
    paddingHorizontal: space.xl,
    marginTop: space.md,
  },
  detailsToggleText: {
    fontSize: text.xs,
    ...inter.regular,
    color: color.fg.subtle,
    textDecorationLine: 'underline',
  },

  // Wallet ready address
  addressBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: color.bg.sunken,
    borderRadius: radius.lg,
    paddingHorizontal: space.xl,
    paddingVertical: space.lg,
    width: '100%',
  },
  addressText: {
    flex: 1,
    fontSize: text.sm,
    ...inter.medium,
    color: color.fg.base,
    fontFamily: font.mono,
  },
  verifyHint: {
    fontSize: text.sm,
    ...inter.regular,
    color: color.fg.subtle,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: space.sm,
  },
  settingsLink: {
    marginTop: space.md,
    paddingVertical: space.md,
    paddingHorizontal: space.xl,
  },
  settingsLinkText: {
    fontSize: text.base,
    ...inter.semibold,
    color: color.accent.base,
    textDecorationLine: 'underline',
  },
  reportLink: {
    paddingVertical: space.sm,
    paddingHorizontal: space.xl,
  },
  reportLinkText: {
    fontSize: text.sm,
    ...inter.medium,
    color: color.fg.muted,
    textDecorationLine: 'underline',
  },

  // Founding-key list (multi-passkey)
  keyList: {
    backgroundColor: color.bg.raised,
    borderWidth: 1,
    borderColor: color.border.base,
    borderRadius: radius.xl,
    paddingHorizontal: space['2xl'],
  },
  keyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    paddingVertical: space.lg,
  },
  keyIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.md,
  },
  keyBody: {
    flex: 1,
    gap: 2,
  },
  keyMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  keyProvider: {
    fontSize: text.xs,
    ...inter.regular,
    color: color.fg.subtle,
    flexShrink: 1,
  },
  keyBadge: {
    borderRadius: radius.full,
    paddingHorizontal: space.md,
    paddingVertical: 1,
  },
  keyBadgeSynced: {
    backgroundColor: color.success.soft,
  },
  keyBadgeDeviceOnly: {
    backgroundColor: color.warning.soft,
  },
  keyBadgeText: {
    fontSize: text.xs,
    ...inter.medium,
  },
  keyBadgeTextSynced: {
    color: color.success.base,
  },
  keyBadgeTextDeviceOnly: {
    color: color.warning.base,
  },
  needSecondKeyText: {
    fontSize: text.sm,
    ...inter.medium,
    color: color.warning.base,
    marginTop: space.lg,
    lineHeight: 19,
  },
  keyRowDivider: {
    borderTopWidth: 1,
    borderTopColor: color.border.base,
  },
  keyName: {
    fontSize: text.base,
    ...inter.medium,
    color: color.fg.base,
  },
  keyNameInput: {
    fontSize: text.base,
    ...inter.regular,
    color: color.fg.base,
    padding: 0,
  },
  addKeyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.xl,
    paddingHorizontal: space.sm,
  },
  addKeyText: {
    fontSize: text.base,
    ...inter.semibold,
    color: color.accent.base,
  },
  confirmKeyText: {
    fontSize: text.sm,
    ...inter.semibold,
    color: color.accent.base,
    textDecorationLine: 'underline',
  },

  // Acknowledgment checklist
  checklistWrap: {
    marginTop: space['3xl'],
    gap: space.xl,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.lg,
  },
  checkText: {
    flex: 1,
    fontSize: text.sm,
    ...inter.regular,
    color: color.fg.muted,
    lineHeight: 20,
  },
  checkLink: {
    color: color.accent.base,
    ...inter.semibold,
    textDecorationLine: 'underline',
  },
  inlineBottom: {
    marginTop: space['3xl'],
    paddingBottom: space['3xl'],
  },

  // Start-over escape hatch (verification stuck on a dead passkey)
  startOverHint: {
    fontSize: text.sm,
    ...inter.regular,
    color: color.fg.subtle,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: space['2xl'],
  },
  startOverLink: {
    alignSelf: 'center',
    paddingVertical: space.md,
    paddingHorizontal: space.xl,
    marginTop: space.xs,
  },
  startOverText: {
    fontSize: text.base,
    ...inter.semibold,
    color: color.accent.base,
    textDecorationLine: 'underline',
  },
}));
