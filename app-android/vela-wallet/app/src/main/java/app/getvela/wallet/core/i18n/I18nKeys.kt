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
}
