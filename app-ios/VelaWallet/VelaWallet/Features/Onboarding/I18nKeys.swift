//
//  I18nKeys.swift
//  VelaWallet
//
//  Corpus key paths used by the onboarding surface (spec 019 T137).
//
//  iOS was the one client with no centralised key file: `FlowStates.swift` and
//  `FlowSheet.swift` carried inline `"onboarding.create.…"` literals, which is
//  tolerable while a screen has six of them and stops being tolerable at the
//  ~90 this feature needs. Two properties are what the file buys:
//
//  - **A key typo is a compile error rather than a screen that renders its own
//    key path at a person.** The engine's missing-key behaviour is to echo the
//    key, which is the right failure signal and a terrible thing to ship.
//  - **The i18n audit can find every key this app uses** by reading one file,
//    which is what `audit-literals.mjs` checks and what makes "does the corpus
//    still cover iOS?" a question with an answer.
//

enum I18nKeys {

    enum Welcome {
        static let tagline = "onboarding.welcome.desktopTagline"
        static let createWallet = "onboarding.welcome.createWallet"
        static let alreadyHaveWallet = "onboarding.welcome.alreadyHaveWallet"
    }

    enum Create {
        static let header = "onboarding.create.headerDefault"
        static let headerCreated = "onboarding.create.headerCreated"
        static let headerSyncFailed = "onboarding.create.headerSyncFailed"

        // Name screen. THREE acknowledgements, each a fact about where something
        // ends up: the public key and the name go on-chain, the private key
        // stays in the device or on a security key, and the legal assent. The
        // legal line's fragments are named for the row they render on — `ack2*`
        // — because a fragment key that disagrees with its index is how the
        // earlier ack3 -> ack1 confusion started.
        static let nameTitle = "onboarding.create.nameTitle"
        static let accountNamePlaceholder = "onboarding.create.accountNamePlaceholder"
        static let nameTooLong = "onboarding.create.nameTooLong"
        static let ack0 = "onboarding.create.ack0"
        static let ack1 = "onboarding.create.ack1"
        static let ack2 = "onboarding.create.ack2"
        static let ack2PrivacyPolicy = "onboarding.create.ack2PrivacyPolicy"
        static let ack2And = "onboarding.create.ack2And"
        static let ack2Terms = "onboarding.create.ack2Terms"
        static let ack2Period = "onboarding.create.ack2Period"
        static let nextBtn = "onboarding.create.nextBtn"
        static let createWalletBtn = "onboarding.create.createWalletBtn"
        static let finishVerifyBtn = "onboarding.create.finishVerifyBtn"
        static let startOverBtn = "onboarding.create.startOverBtn"

        // Statuses.
        static let statusSettingUpIdentity = "onboarding.create.statusSettingUpIdentity"
        static let statusVerifyingIdentity = "onboarding.create.statusVerifyingIdentity"
        static let statusExtractingKey = "onboarding.create.statusExtractingKey"
        static let statusComputingAddress = "onboarding.create.statusComputingAddress"
        static let statusSyncingKey = "onboarding.create.statusSyncingKey"
        static let statusSetupCancelled = "onboarding.create.statusSetupCancelled"
        static let statusVerifyCancelled = "onboarding.create.statusVerifyCancelled"

        // Keys screen.
        static let keysTitle = "onboarding.create.keysTitle"
        static let keysTitleBlocked = "onboarding.create.keysTitleBlocked"
        static let keysSubtitle = "onboarding.create.keysSubtitle"
        static let keysSubtitleBlocked = "onboarding.create.keysSubtitleBlocked"
        static let keysSubtitleFull = "onboarding.create.keysSubtitleFull"
        static let keysLabel = "onboarding.create.keysLabel"
        static let keysHint = "onboarding.create.keysHint"
        static let keyCount = "onboarding.create.keyCount"
        static let keySyncedBadge = "onboarding.create.keySyncedBadge"
        static let keyDeviceOnlyBadge = "onboarding.create.keyDeviceOnlyBadge"
        static let keyLimitReached = "onboarding.create.keyLimitReached"
        static let needSecondKeyHint = "onboarding.create.needSecondKeyHint"
        static let addKeyBtn = "onboarding.create.addKeyBtn"
        static let addSecondKeyBtn = "onboarding.create.addSecondKeyBtn"
        static let confirmKeyBtn = "onboarding.create.confirmKeyBtn"
        static let removeKeyBtn = "onboarding.create.removeKeyBtn"
        static let addMethodLabel = "onboarding.create.addMethodLabel"
        static let methodPlatformTitle = "onboarding.create.methodPlatformTitle"
        static let methodPlatformBody = "onboarding.create.methodPlatformBody"
        static let methodHybridTitle = "onboarding.create.methodHybridTitle"
        static let methodHybridBody = "onboarding.create.methodHybridBody"
        static let methodHybridUnavailable = "onboarding.create.methodHybridUnavailable"
        static let methodSecurityKeyTitle = "onboarding.create.methodSecurityKeyTitle"
        static let methodSecurityKeyBody = "onboarding.create.methodSecurityKeyBody"
        static let providerPlatform = "onboarding.create.providerPlatform"
        static let providerGeneric = "onboarding.create.providerGeneric"
        static let providerSecurityKey = "onboarding.create.providerSecurityKey"

        // Progress screen.
        static let progressTitle = "onboarding.create.progressTitle"
        static let progressSubtitle = "onboarding.create.progressSubtitle"
        static let progressMeterLabel = "onboarding.create.progressMeterLabel"
        static let taskVerifyKey = "onboarding.create.taskVerifyKey"
        static let taskDeriveAddress = "onboarding.create.taskDeriveAddress"
        static let taskWriteIndex = "onboarding.create.taskWriteIndex"

        // Retry screen.
        static let syncFailedTitle = "onboarding.create.syncFailedTitle"
        static let syncFailedMessage = "onboarding.create.syncFailedMessage"
        static let syncFailedHint = "onboarding.create.syncFailedHint"
        static let retryUploadBtn = "onboarding.create.retryUploadBtn"
        static let technicalDetails = "onboarding.create.technicalDetails"

        // Done screen.
        static let successTitle = "onboarding.create.successTitle"
        static let successMessage = "onboarding.create.successMessage"
        static let identiconHint = "onboarding.create.identiconHint"
        static let walletAddressLabel = "onboarding.create.walletAddressLabel"
        static let verifyHint = "onboarding.create.verifyHint"
        static let enterWalletBtn = "onboarding.create.enterWalletBtn"

        // Prompts (data-model §5).
        static let alertErrorTitle = "onboarding.create.alertErrorTitle"
        static let alertNotSupportedTitle = "onboarding.create.alertNotSupportedTitle"
        static let alertNotSupportedBody = "onboarding.create.alertNotSupportedBody"
        // The app-owned CTAP path's own dialogs (spec 019 §5), shared with the desktop.
        static let pinTitle = "onboarding.create.pinTitle"
        static let pinBody = "onboarding.create.pinBody"
        static let pinLabel = "onboarding.create.pinLabel"
        static let pinAttemptsLeft = "onboarding.create.pinAttemptsLeft"
        static let pinRejected = "onboarding.create.pinRejected"
        static let touchTitle = "onboarding.create.touchTitle"
        static let touchBody = "onboarding.create.touchBody"
        static let touchFingerprintBody = "onboarding.create.touchFingerprintBody"
        static let touchSelectBody = "onboarding.create.touchSelectBody"
    }

    enum Login {
        static let header = "onboarding.login.header"
        static let alertNotSupportedTitle = "onboarding.login.alertNotSupportedTitle"
        static let alertNotSupportedBody = "onboarding.login.alertNotSupportedBody"
        static let alertIncompatibleTitle = "onboarding.login.alertIncompatibleTitle"
        static let alertIncompatibleBody = "onboarding.login.alertIncompatibleBody"
        static let alertIncompatibleBodyCreate = "onboarding.login.alertIncompatibleBodyCreate"
        static let alertSignInFailedTitle = "onboarding.login.alertSignInFailedTitle"
        static let alertSignInFailedBody = "onboarding.login.alertSignInFailedBody"
        static let recoverOfferTitle = "onboarding.login.recoverOfferTitle"
        static let recoverOfferBody = "onboarding.login.recoverOfferBody"
        static let recoverConfirm = "onboarding.login.recoverConfirm"
        static let recoverCancel = "onboarding.login.recoverCancel"
        static let recoverFailedTitle = "onboarding.login.recoverFailedTitle"
        static let recoverFailedBody = "onboarding.login.recoverFailedBody"
        // The which-wallet picker for the app-owned CTAP path, shared with the desktop.
        static let pickTitle = "onboarding.login.pickTitle"
        static let pickBody = "onboarding.login.pickBody"
        static let pickUnnamed = "onboarding.login.pickUnnamed"
    }

    /// `onboarding.common.*` — the shared flow scaffolding.
    enum Flow {
        static let touchRemoteTitle = "onboarding.common.touchRemoteTitle"
        static let touchRemoteBody = "onboarding.common.touchRemoteBody"
        static let back = "onboarding.common.back"
        static let retry = "onboarding.common.retry"
        static let close = "onboarding.common.close"
        static let copyAddress = "onboarding.common.copyAddress"
        static let copied = "onboarding.common.copied"
        static let confirmInPrompt = "onboarding.common.confirmInPrompt"
        static let editIndexEndpoint = "onboarding.common.editIndexEndpoint"
        static let notDiscoverableTitle = "onboarding.common.notDiscoverableTitle"
        static let notDiscoverableBody = "onboarding.common.notDiscoverableBody"
    }

    enum Settings {
        static let sectionPasskeyIndex = "onboarding.settings.sectionPasskeyIndex"
        static let endpointUrlLabel = "onboarding.settings.endpointUrlLabel"
        static let passkeyHint = "onboarding.settings.passkeyHint"
        static let resetToDefault = "onboarding.settings.resetToDefault"
        static let warningText = "onboarding.settings.warningText"
    }

    /// Every key the onboarding surface renders, for the coverage test.
    ///
    /// Hand-maintained rather than derived by reflection: Swift has no way to
    /// enumerate an enum's static properties, and a list that silently missed a
    /// key would make the coverage test pass by covering less.
    static let all: [String] = [
        Welcome.tagline, Welcome.createWallet, Welcome.alreadyHaveWallet,
        Create.header, Create.headerCreated, Create.headerSyncFailed,
        Create.nameTitle, Create.accountNamePlaceholder, Create.nameTooLong,
        Create.ack0, Create.ack1,
        Create.ack2, Create.ack2PrivacyPolicy, Create.ack2And,
        Create.ack2Terms, Create.ack2Period,
        Create.nextBtn, Create.createWalletBtn, Create.finishVerifyBtn, Create.startOverBtn,
        Create.statusSettingUpIdentity, Create.statusVerifyingIdentity,
        Create.statusExtractingKey, Create.statusComputingAddress, Create.statusSyncingKey,
        Create.statusSetupCancelled, Create.statusVerifyCancelled,
        Create.keysTitle, Create.keysTitleBlocked, Create.keysSubtitle,
        Create.keysSubtitleBlocked, Create.keysSubtitleFull, Create.keysLabel,
        Create.keysHint, Create.keyCount, Create.keySyncedBadge,
        Create.keyDeviceOnlyBadge, Create.keyLimitReached, Create.needSecondKeyHint,
        Create.addKeyBtn, Create.addSecondKeyBtn, Create.confirmKeyBtn,
        Create.removeKeyBtn, Create.addMethodLabel,
        Create.methodPlatformTitle, Create.methodPlatformBody,
        Create.methodHybridTitle, Create.methodHybridBody, Create.methodHybridUnavailable,
        Create.methodSecurityKeyTitle, Create.methodSecurityKeyBody,
        Create.providerPlatform, Create.providerGeneric, Create.providerSecurityKey,
        Create.progressTitle, Create.progressSubtitle, Create.progressMeterLabel,
        Create.taskVerifyKey, Create.taskDeriveAddress, Create.taskWriteIndex,
        Create.syncFailedTitle, Create.syncFailedMessage, Create.syncFailedHint,
        Create.retryUploadBtn, Create.technicalDetails,
        Create.successTitle, Create.successMessage, Create.identiconHint,
        Create.walletAddressLabel, Create.verifyHint, Create.enterWalletBtn,
        Create.alertErrorTitle, Create.alertNotSupportedTitle, Create.alertNotSupportedBody,
        Login.header, Login.alertNotSupportedTitle, Login.alertNotSupportedBody,
        Login.alertIncompatibleTitle, Login.alertIncompatibleBody,
        Login.alertIncompatibleBodyCreate,
        Login.alertSignInFailedTitle, Login.alertSignInFailedBody,
        Login.recoverOfferTitle, Login.recoverOfferBody,
        Login.recoverConfirm, Login.recoverCancel,
        Login.recoverFailedTitle, Login.recoverFailedBody,
        Flow.back, Flow.retry, Flow.close, Flow.copyAddress, Flow.copied,
        Flow.confirmInPrompt, Flow.editIndexEndpoint,
        Flow.notDiscoverableTitle, Flow.notDiscoverableBody,
        Settings.sectionPasskeyIndex, Settings.endpointUrlLabel, Settings.passkeyHint,
        Settings.resetToDefault, Settings.warningText,
    ]
}
