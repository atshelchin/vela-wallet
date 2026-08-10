/**
 * Message Sign View (personal_sign) — plain message + SIWE domain binding.
 *
 * Pure rendering. The hex-vs-text split, the decode and the SIWE domain binding
 * are ONE adjudication made upstream (`use-clear-signing`), which is also what
 * decides whether the sheet buzzes on open — so the warning haptic and the red
 * banner below can never disagree.
 *
 * This view used to run a second DECODE of its own — an ASCII-only regex over
 * the raw payload — so a payload could be shown as readable text by one rule and
 * called unreadable by the other. That second decode is gone. What survives is
 * the caution banner's verdict, and it is now a pure function OF the core's
 * projection (`isPossibleDisguisedTransaction`), not of the raw payload: one
 * decode, two questions asked of it.
 */
import React from 'react';
import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { color } from '@/constants/theme';
import type { ClearMessageView } from '@/services/wallet-state-core/generated/ClearMessageView';
import { isPossibleDisguisedTransaction } from '@/services/decode-sign-message';
import { ShieldCheck } from 'lucide-react-native';
import { styles, riskColors } from '../signing-core';
import { IntentHeader } from '../IntentHeader';
import { WarningBanner } from '../WarningBanner';

export function MessageSignView({ view, requestOrigin }: {
  /** The adjudication: decoded text, SIWE fields, domain binding, danger class. */
  view: ClearMessageView;
  requestOrigin?: string;
}) {
  const { t } = useTranslation();
  const siwe = view.siwe;
  const phishing = view.danger_class === 'siwe_phish';

  if (siwe) {
    return (
      <View>
        <IntentHeader
          intent={t('componentsUi.signing.signInIntent')}
          color={phishing ? color.error.base : color.fg.base}
          variant="eyebrow"
          colorEyebrow={phishing}
        />

        <View style={styles.genericFields}>
          <View style={styles.genRow}>
            <Text style={styles.contractLabel}>{t('componentsUi.signing.siweDomain')}</Text>
            {/* The host the binding was COMPARED on — never a prettier one than
                the check ran against. */}
            <Text style={[styles.genValue, phishing && { color: riskColors().danger }]} numberOfLines={1}>
              {siwe.domain_host ?? siwe.domain}
            </Text>
          </View>
          {!!siwe.statement && (
            <View style={styles.genRow}>
              <Text style={styles.contractLabel}>{t('componentsUi.signing.siweStatement')}</Text>
              <Text style={styles.genValue} numberOfLines={3}>{siwe.statement}</Text>
            </View>
          )}
        </View>

        {phishing && (
          <WarningBanner
            severity="danger"
            text={t('componentsUi.signing.siweMismatch', { domain: siwe.domain, origin: hostLabel(requestOrigin) })}
          />
        )}
        {/* The verified badge renders only on a POSITIVE match: an origin we
            couldn't parse is "unknown", and unknown must never assert safety. */}
        {view.binding === 'ok' && (
          <View style={styles.siweOkRow}>
            <ShieldCheck size={13} color={color.success.base} strokeWidth={2} />
            <Text style={styles.siweOkText}>{t('componentsUi.signing.siweOk', { domain: siwe.domain })}</Text>
          </View>
        )}
      </View>
    );
  }

  return (
    <View>
      {/* context shown in dApp banner */}
      <IntentHeader intent={t('componentsUi.signing.signMessage')} color={color.fg.base} variant="eyebrow" />

      {/* Just the message — the "personal_sign · no gas fee" tag was redundant noise
          (a signature obviously costs no gas). Readable text verbatim; a genuinely
          binary payload as the short hex preview the decoder produced. */}
      <View style={styles.msgBubble}>
        <Text style={styles.msgText}>{view.decoded_text ?? view.binary_preview ?? ''}</Text>
      </View>

      {/* Hex that isn't plain ASCII isn't a human message — it can be a disguised
          hash (a transfer or approval hidden behind personal_sign). Legit apps
          sign readable text; flag the hex case so it never reads as calmly as a
          login prompt (F9). Strictly wider than `view.non_printable` and derived
          from the same projection, so the banner cannot go missing on a payload
          the core already calls opaque; a payload signed as TEXT never gets it. */}
      {isPossibleDisguisedTransaction(view) && (
        <WarningBanner
          severity="caution"
          text={t('componentsUi.signing.hexMessageWarning', {
            defaultValue: "This isn't readable text — it could be a transaction or approval in disguise. Only sign if you fully trust this site.",
          })}
        />
      )}
    </View>
  );
}

/** Short host label for messages ("app.uniswap.org"). */
function hostLabel(value: string | undefined): string {
  if (!value) return '—';
  try {
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;
    return new URL(withScheme).host;
  } catch {
    return value;
  }
}
