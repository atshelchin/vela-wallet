package app.getvela.wallet.core.i18n

/**
 * Corpus key paths used by this app (rust/crates/vela-core/i18n/locales, flat
 * `onboarding.welcome.*` lineage per spec — the nested welcomeWeb set is web-only).
 * Centralised so feature code never scatters key literals.
 */
object I18nKeys {
    object Welcome {
        const val TAGLINE = "onboarding.welcome.desktopTagline"
        const val CREATE_WALLET = "onboarding.welcome.createWallet"
        const val ALREADY_HAVE_WALLET = "onboarding.welcome.alreadyHaveWallet"

        const val FEATURE_NO_MNEMONIC_TITLE = "onboarding.welcome.featureNoMnemonicTitle"
        const val FEATURE_NO_MNEMONIC_BODY = "onboarding.welcome.featureNoMnemonicBody"
        const val FEATURE_ONE_ADDRESS_TITLE = "onboarding.welcome.featureOneAddressTitle"
        const val FEATURE_ONE_ADDRESS_BODY = "onboarding.welcome.featureOneAddressBody"
        const val FEATURE_OPEN_SOURCE_TITLE = "onboarding.welcome.featureOpenSourceTitle"
        const val FEATURE_OPEN_SOURCE_BODY = "onboarding.welcome.featureOpenSourceBody"
        const val FEATURE_KEY_CUSTODY_TITLE = "onboarding.welcome.featureKeyCustodyTitle"
        const val FEATURE_KEY_CUSTODY_BODY = "onboarding.welcome.featureKeyCustodyBody"
        const val FEATURE_SAFE_CONTRACT_TITLE = "onboarding.welcome.featureSafeContractTitle"
        const val FEATURE_SAFE_CONTRACT_BODY = "onboarding.welcome.featureSafeContractBody"
        const val FEATURE_STABLECOIN_GAS_TITLE = "onboarding.welcome.featureStablecoinGasTitle"
        const val FEATURE_STABLECOIN_GAS_BODY = "onboarding.welcome.featureStablecoinGasBody"
    }

    object Settings {
        const val TITLE = "onboarding.settings.title"
        const val SECTION_APPEARANCE = "onboarding.settings.sectionAppearance"
        const val THEME_LIGHT = "onboarding.settings.themeLabelLight"
        const val THEME_DARK = "onboarding.settings.themeLabelDark"
        const val THEME_AUTO = "onboarding.settings.themeLabelAuto"
    }

    object Create {
        const val HEADER = "onboarding.create.headerDefault"
    }

    object Common {
        const val CANCEL = "common.cancel"
    }
}
