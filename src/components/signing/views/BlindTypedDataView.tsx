/**
 * Blind Typed Data View (EIP-712, no descriptor).
 *
 * Pure rendering. Which five `message` entries are shown, in which order, and
 * how each raw value is rendered onto one line is the projection made upstream
 * (`use-clear-signing`) — deliberately unreinterpreted: no decimals, no
 * timestamp guessing. The descriptor is unknown, so an honest raw value beats a
 * confident wrong one, and the full exact payload is one tap away under 技术细节.
 */
import React from 'react';
import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { color } from '@/constants/theme';
import type { ClearBlindTyped } from '@/services/wallet-state-core/generated/ClearBlindTyped';
import { styles } from '../signing-core';
import { IntentHeader } from '../IntentHeader';
import { ContractBar } from '../ContractBar';
import { WarningBanner } from '../WarningBanner';

export function BlindTypedDataView({ view }: {
  view: ClearBlindTyped;
}) {
  const { t } = useTranslation();

  return (
    <View>
      {/* ZONE 1 — the fields are the hero, so the action is just a small kicker.
          Neutral grey: the caution lives in the banner below. */}
      <IntentHeader intent={t('componentsUi.signing.signTypedData')} color={color.fg.base} variant="eyebrow" />
      <View style={styles.genericFields}>
        {view.primary_type && (
          <View style={styles.genRow}>
            {/* fixed label → uppercase kicker; the dynamic struct keys below stay as data */}
            <Text style={styles.contractLabel}>{t('componentsUi.signing.typeLabel')}</Text>
            <Text style={styles.genValue}>{view.primary_type}</Text>
          </View>
        )}
        {view.fields.map((f, i) => (
          <View key={i} style={styles.genRow}>
            <Text style={styles.genLabel}>{f.key}</Text>
            {/* One line each — long hex/addresses are mid-truncated so a raw salt
                or maker doesn't wrap into a two-line hex wall. */}
            <Text style={styles.genValue} numberOfLines={1}>{f.value}</Text>
          </View>
        ))}
      </View>

      {/* ZONE 2 — who you're signing for. */}
      {view.has_domain && (
        <ContractBar
          label={t('componentsUi.signing.signingFor')}
          name={view.domain_name ?? undefined}
          address={view.verifying_contract ?? undefined}
          verified={false}
          identity="contract"
        />
      )}

      {/* ZONE 3 — undecodable caution. */}
      <WarningBanner
        severity="caution"
        text={t('componentsUi.signing.blindTypedWarning')}
      />
    </View>
  );
}
