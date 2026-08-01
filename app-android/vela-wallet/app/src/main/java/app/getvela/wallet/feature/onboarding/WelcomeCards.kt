package app.getvela.wallet.feature.onboarding

import app.getvela.wallet.core.i18n.I18nKeys

/** Spec entity WelcomeCard: fixed order 01–06, ordinals generated (`%02d`). */
data class WelcomeCard(
    val ordinal: Int,
    val titleKey: String,
    val bodyKey: String,
)

val WelcomeCards: List<WelcomeCard> = listOf(
    WelcomeCard(1, I18nKeys.Welcome.FEATURE_NO_MNEMONIC_TITLE, I18nKeys.Welcome.FEATURE_NO_MNEMONIC_BODY),
    WelcomeCard(2, I18nKeys.Welcome.FEATURE_ONE_ADDRESS_TITLE, I18nKeys.Welcome.FEATURE_ONE_ADDRESS_BODY),
    WelcomeCard(3, I18nKeys.Welcome.FEATURE_OPEN_SOURCE_TITLE, I18nKeys.Welcome.FEATURE_OPEN_SOURCE_BODY),
    WelcomeCard(4, I18nKeys.Welcome.FEATURE_KEY_CUSTODY_TITLE, I18nKeys.Welcome.FEATURE_KEY_CUSTODY_BODY),
    WelcomeCard(5, I18nKeys.Welcome.FEATURE_SAFE_CONTRACT_TITLE, I18nKeys.Welcome.FEATURE_SAFE_CONTRACT_BODY),
    WelcomeCard(6, I18nKeys.Welcome.FEATURE_STABLECOIN_GAS_TITLE, I18nKeys.Welcome.FEATURE_STABLECOIN_GAS_BODY),
)
