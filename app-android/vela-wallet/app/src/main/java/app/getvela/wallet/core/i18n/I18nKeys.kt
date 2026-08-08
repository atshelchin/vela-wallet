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

    /** Wallet home vocabulary (spec 015, research.md D3 key map — all pre-existing corpus keys). */
    object Wallet {
        // Main navigation (tab bar).
        const val NAV_WALLET = "componentsUi.mainNav.wallet"
        const val NAV_CONTACTS = "componentsUi.mainNav.contacts"
        const val NAV_EXPLORE = "componentsUi.mainNav.explore"
        const val NAV_SETTINGS = "componentsUi.mainNav.settings"

        // Balance display.
        const val TOTAL_BALANCE = "home.totalBalance"
        const val LIVE_INDICATOR = "home.liveIndicator"
        const val BALANCE_STALE = "home.balanceStale"
        const val BALANCE_UNPRICED = "home.balanceUnpriced"
        const val NO_PRICE = "home.balanceDetailNoPrice"
        const val A11Y_HIDE_BALANCE = "home.a11yHideBalance"
        const val A11Y_SHOW_BALANCE = "home.a11yShowBalance"

        // Sections & empty states.
        const val SECTION_ACTIVITY = "home.tabActivity"
        const val EMPTY_NO_ACTIVITY = "home.emptyNoActivity"
        const val EMPTY_ACTIVITY_SUBTITLE = "home.emptySubtitle"
        const val SECTION_ASSETS = "assets.sectionTitle"
        const val ASSETS_ADD = "assets.addToken"
        const val ASSETS_EMPTY_TITLE = "assets.emptyTitle"
        const val ASSETS_EMPTY_SUBTEXT = "assets.emptySubtext"

        // Action dock.
        const val ACTION_RECEIVE = "componentsUi.dock.receive"
        const val ACTION_SEND = "componentsUi.dock.send"
        const val ACTION_SCAN = "componentsUi.dock.scan"

        // Activity rows (templates use {{name}} via t(key, vars)).
        const val FILTER_ALL = "history.filterAll"
        const val LABEL_SENT = "history.labelSent"
        const val LABEL_RECEIVED = "history.labelReceived"
        const val LABEL_DAPP_TX = "history.txLabelDappTx"
        const val TO_NAME = "history.toName"
        const val FROM_NAME = "history.fromName"
        const val DAY_TODAY = "componentsUi.dayGroup.today"
        const val DAY_YESTERDAY = "componentsUi.dayGroup.yesterday"

        // Network filter (pill + chain-select sheet).
        const val PILL_ALL = "componentsUi.networkFilter.pillAll"
        const val SELECT_CHAIN = "componentsUi.networkFilter.selectChain"
        const val ALL_NETWORKS = "componentsUi.networkFilter.allNetworks"

        // Shared component captions.
        const val QR_CAPTION = "componentsUi.qrPlaceholder.caption"
        const val COPY_ADDRESS = "componentsUi.identiconViewer.copyAddress"
    }
}
