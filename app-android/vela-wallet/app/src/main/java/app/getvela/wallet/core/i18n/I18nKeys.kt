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

        // Spec 014 create-flow keys (contracts/i18n-keys.md). All EXISTS in the
        // corpus except RETRY_VERIFY_BTN, which lands with the spec-014 corpus batch.
        const val HEADER_SYNC_FAILED = "onboarding.create.headerSyncFailed"
        const val ACCOUNT_NAME_LABEL = "onboarding.create.accountNameLabel"
        const val ACCOUNT_NAME_PLACEHOLDER = "onboarding.create.accountNamePlaceholder"
        const val ACCOUNT_NAME_HINT = "onboarding.create.accountNameHint"
        const val NAME_TOO_LONG = "onboarding.create.nameTooLong"
        const val TECHNICAL_DETAILS = "onboarding.create.technicalDetails"
        const val ACK0 = "onboarding.create.ack0"
        const val ACK1 = "onboarding.create.ack1"
        const val ACK3 = "onboarding.create.ack3"
        const val ACK3_PRIVACY_POLICY = "onboarding.create.ack3PrivacyPolicy"
        const val ACK3_AND = "onboarding.create.ack3And"
        const val ACK3_TERMS = "onboarding.create.ack3Terms"
        const val ACK3_PERIOD = "onboarding.create.ack3Period"
        const val CREATE_WALLET_BTN = "onboarding.create.createWalletBtn"
        const val STATUS_SETTING_UP_IDENTITY = "onboarding.create.statusSettingUpIdentity"
        const val STATUS_VERIFYING_IDENTITY = "onboarding.create.statusVerifyingIdentity"
        const val STATUS_EXTRACTING_KEY = "onboarding.create.statusExtractingKey"
        const val STATUS_COMPUTING_ADDRESS = "onboarding.create.statusComputingAddress"
        const val STATUS_SYNCING_KEY = "onboarding.create.statusSyncingKey"
        const val SUCCESS_TITLE = "onboarding.create.successTitle"
        const val SUCCESS_MESSAGE = "onboarding.create.successMessage"
        const val VERIFY_HINT = "onboarding.create.verifyHint"
        const val ENTER_WALLET_BTN = "onboarding.create.enterWalletBtn"
        const val FINISH_VERIFY_BTN = "onboarding.create.finishVerifyBtn"
        const val START_OVER_BTN = "onboarding.create.startOverBtn"
        const val SYNC_FAILED_TITLE = "onboarding.create.syncFailedTitle"
        const val RETRY_UPLOAD_BTN = "onboarding.create.retryUploadBtn"
        const val RETRY_VERIFY_BTN = "onboarding.create.retryVerifyBtn"
    }

    /** onboarding.login.* — spec 014 login flow (mix of EXISTS + NEW corpus keys). */
    object Login {
        const val HEADER = "onboarding.login.header"
        const val STATUS_AWAITING_PASSKEY = "onboarding.login.statusAwaitingPasskey"
        const val STATUS_AWAITING_PASSKEY_HINT = "onboarding.login.statusAwaitingPasskeyHint"
        const val STATUS_CANCELLED_TITLE = "onboarding.login.statusCancelledTitle"
        const val STATUS_CANCELLED_BODY = "onboarding.login.statusCancelledBody"
        const val SUCCESS_TITLE = "onboarding.login.successTitle"
        const val SUCCESS_MESSAGE = "onboarding.login.successMessage"
        const val SIGN_IN_FAILED_TITLE = "onboarding.login.alertSignInFailedTitle"
        const val SIGN_IN_FAILED_BODY = "onboarding.login.signInFailedBody"
        const val RETRY_LOGIN_BTN = "onboarding.login.retryLoginBtn"
        const val CREATE_NEW_WALLET_BTN = "onboarding.login.createNewWalletBtn"
        const val RECOVER_OFFER_TITLE = "onboarding.login.recoverOfferTitle"
        const val RECOVER_OFFER_BODY = "onboarding.login.recoverOfferBody"
        const val RECOVER_CONFIRM = "onboarding.login.recoverConfirm"
        const val RECOVER_CANCEL = "onboarding.login.recoverCancel"
        const val RECOVER_FAILED_TITLE = "onboarding.login.recoverFailedTitle"
        const val RECOVER_FAILED_BODY = "onboarding.login.recoverFailedBody"
    }

    /**
     * onboarding.common.* — the NEW shared flow-scaffolding branch (spec 014,
     * contracts/i18n-keys.md). Keys are added to the corpus by the spec-014
     * batch; the engine echoes missing keys until that lands.
     */
    object Flow {
        const val HEADER_SHARED = "onboarding.common.headerShared"
        const val STEP_COUNTER = "onboarding.common.stepCounter"
        const val CONFIRM_IN_PROMPT = "onboarding.common.confirmInPrompt"
        const val WAITED_SECONDS = "onboarding.common.waitedSeconds"
        const val NETWORK_TITLE = "onboarding.common.networkTitle"
        const val NETWORK_BODY = "onboarding.common.networkBody"
        const val SERVER_TITLE = "onboarding.common.serverTitle"
        const val SERVER_BODY = "onboarding.common.serverBody"
        const val TIMEOUT_TITLE = "onboarding.common.timeoutTitle"
        const val TIMEOUT_BODY = "onboarding.common.timeoutBody"
        const val UNKNOWN_TITLE = "onboarding.common.unknownTitle"
        const val UNKNOWN_BODY = "onboarding.common.unknownBody"
        const val CANCELLED_SETUP_TITLE = "onboarding.common.cancelledSetupTitle"
        const val CANCELLED_SETUP_BODY = "onboarding.common.cancelledSetupBody"
        const val CANCELLED_VERIFY_TITLE = "onboarding.common.cancelledVerifyTitle"
        const val CANCELLED_VERIFY_BODY = "onboarding.common.cancelledVerifyBody"
        const val UNSUPPORTED_TITLE = "onboarding.common.unsupportedTitle"
        const val UNSUPPORTED_BODY = "onboarding.common.unsupportedBody"
        const val INCOMPATIBLE_TITLE = "onboarding.common.incompatibleTitle"
        const val INCOMPATIBLE_BODY = "onboarding.common.incompatibleBody"
        const val NOT_DISCOVERABLE_TITLE = "onboarding.common.notDiscoverableTitle"
        const val NOT_DISCOVERABLE_BODY = "onboarding.common.notDiscoverableBody"
        const val NOT_FOUND_TITLE = "onboarding.common.notFoundTitle"
        const val NOT_FOUND_BODY = "onboarding.common.notFoundBody"
        const val VERIFY_STUCK_TITLE = "onboarding.common.verifyStuckTitle"
        const val VERIFY_STUCK_BODY = "onboarding.common.verifyStuckBody"
        const val SYNC_FAILED_BODY = "onboarding.common.syncFailedBody"
        const val BACK = "onboarding.common.back"
        const val RETRY = "onboarding.common.retry"
        const val RECREATE_WALLET = "onboarding.common.recreateWallet"
        const val EDIT_INDEX_ENDPOINT = "onboarding.common.editIndexEndpoint"
        const val REPORT_ERROR = "onboarding.common.reportError"
        const val OPEN_BIOMETRIC_SETTINGS = "onboarding.common.openBiometricSettings"
        const val OPEN_CREDENTIAL_MANAGER_SETTINGS = "onboarding.common.openCredentialManagerSettings"
        const val COPY_ADDRESS = "onboarding.common.copyAddress"
        const val COPIED = "onboarding.common.copied"
        const val CLOSE = "onboarding.common.close"
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

    /**
     * Contacts vocabulary (spec 018, contracts/i18n-keys.md — the normative key
     * map). The 21 additions plus the two updated values already live in the
     * corpus; keys shared with the wallet map are re-exported here so contacts
     * code never reaches into [Wallet] for its own copy.
     */
    object Contacts {
        // Page / section chrome.
        const val TITLE = "contacts.title"
        const val SECTION_GROUPS = "contacts.sectionGroups"
        const val SECTION_CONTACTS = "contacts.sectionContacts"
        const val MANAGE = "contacts.manage"
        const val COUNT_PEOPLE = "contacts.countPeople"
        const val GROUP_MEMBERS = "contacts.groupMembers"
        const val MEMBERS_COUNT = "contacts.membersCount"
        const val ALL_CONTACTS = "contacts.allContacts"
        const val SEARCH_PLACEHOLDER = "contacts.searchPlaceholder"
        const val NO_RESULTS = "contacts.noResults"

        // Empty state.
        const val EMPTY = "contacts.empty"
        const val EMPTY_HINT = "contacts.emptyHint"
        const val ADD_CONTACT = "contacts.addContact"

        // Detail.
        const val ADDRESS_LABEL = "contacts.addressLabel"
        const val RECENT_ACTIVITY = "contacts.recentActivity"
        const val VIEW_ALL_ACTIVITY = "contacts.viewAllActivity"
        const val DELETE_CONTACT = "contacts.deleteContact"
        const val ACTION_QR = "contacts.actionQr"
        const val EDIT = "contacts.edit"
        const val MOVE_GROUP = "contacts.moveGroup"

        // Group detail.
        const val ADD_MEMBER = "contacts.addMember"
        const val BATCH_SEND = "contacts.batchSend"
        const val BATCH_SEND_HINT = "contacts.batchSendHint"
        const val BATCH_SEND_HINT_TITLED = "contacts.batchSendHintTitled"
        const val GROUP_NEW = "contacts.groupNew"
        const val GROUP_EDIT = "contacts.groupEdit"
        const val GROUP_RENAME = "contacts.groupRename"
        const val GROUP_DELETE = "contacts.groupDelete"

        // Menus (add / import / export).
        const val ADD_TITLE = "contacts.addTitle"
        const val IMPORT_FILE = "contacts.importFile"
        const val IMPORT_ALL = "contacts.importAll"
        const val EXPORT_TITLE = "contacts.exportTitle"
        const val EXPORT_ALL = "contacts.exportAll"
        const val IMPORT_GROUP = "contacts.importGroup"
        const val EXPORT_GROUP = "contacts.exportGroup"

        // Destructive confirmation.
        const val DELETE_TITLE = "contacts.deleteTitle"
        const val DELETE_BODY = "contacts.deleteBody"
        const val DELETE = "contacts.delete"
        const val CANCEL = "contacts.cancel"

        // Reused from the spec-015 map (same keys, no corpus change).
        const val ACTION_SEND = "componentsUi.dock.send"
        const val ACTION_RECEIVE = "componentsUi.dock.receive"
        const val COPY_ADDRESS = "componentsUi.identiconViewer.copyAddress"
        const val LABEL_SENT = "history.labelSent"
        const val LABEL_RECEIVED = "history.labelReceived"
        const val FILTER_ALL = "history.filterAll"
        const val NAV_WALLET = "componentsUi.mainNav.wallet"
        const val NAV_CONTACTS = "componentsUi.mainNav.contacts"
        const val NAV_EXPLORE = "componentsUi.mainNav.explore"
        const val NAV_SETTINGS = "componentsUi.mainNav.settings"
    }
}
