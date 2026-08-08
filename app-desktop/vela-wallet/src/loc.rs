//! Localization access — the only module that touches `vela_core::i18n`
//! (spec 007 FR-009).
//!
//! Desktop compiles all 15 catalogs in (`i18n-all`, research.md D6), so language
//! selection is synchronous and infallible: the engine always holds the pinned
//! `en` fallback, plus the resolved locale's catalog when that locale isn't `en`.

use gpui::SharedString;
use vela_core::i18n::{Catalog, I18n, Options, Var};

pub struct Loc {
    engine: I18n,
}

impl Loc {
    /// Build the engine for the launch locale: `VELA_LANG` → `LC_ALL` →
    /// `LC_MESSAGES` → `LANG` → `en` (spec 007 FR-007), resolved through the
    /// same ladder i18next uses (`resolve_language`).
    pub fn from_env() -> Self {
        let requested = ["VELA_LANG", "LC_ALL", "LC_MESSAGES", "LANG"]
            .iter()
            .find_map(|k| std::env::var(k).ok().filter(|v| !v.is_empty()))
            .map(|raw| normalize_posix_tag(&raw))
            .unwrap_or_else(|| "en".to_owned());

        let mut engine = match I18n::embedded() {
            Ok(engine) => engine,
            // `i18n-en` is a compile-time feature of this binary; construction
            // can only fail if the crate was built without it, which the
            // dependency declaration makes impossible. Render keys as-is rather
            // than crash the welcome screen if that invariant is ever broken.
            Err(_) => return Self::key_echo(),
        };

        let state = engine.change_language(&requested);
        if let Some(resolved) = state.resolved_language.as_deref()
            && resolved != "en"
            && let Ok(catalog) = Catalog::embedded(resolved)
        {
            engine.load_catalog(catalog);
        }
        Self { engine }
    }

    /// An engine with only the `en` catalog missing-in-action: `t()` echoes
    /// keys. Never reached in a correctly built binary (see `from_env`).
    fn key_echo() -> Self {
        // Catalog::from_json with an empty object gives a valid empty engine.
        let empty = Catalog::from_json("en", b"{}").and_then(I18n::new);
        match empty {
            Ok(engine) => Self { engine },
            Err(_) => unreachable!("empty en catalog construction is infallible"),
        }
    }

    /// Resolve `key` with default options. A missing key echoes the key —
    /// i18next's contract — which the visual checks treat as a failure signal
    /// (SC-004), not something to hide.
    pub fn t(&self, key: &str) -> SharedString {
        self.engine
            .t(key, &Options::default())
            .unwrap_or_else(|_| key.to_owned())
            .into()
    }

    /// `t` with numeric interpolation variables (`{{seconds}}`, `{{count}}`,
    /// `{{current}}/{{total}}` — spec 014 flow copy). Numbers only and no
    /// `count` plural option: interpolation stays a pure text substitution,
    /// which is all the flow keys use.
    pub fn t_vars(&self, key: &str, vars: &[(&str, f64)]) -> SharedString {
        let vars: Vec<(&str, Var<'_>)> = vars.iter().map(|(k, v)| (*k, Var::Num(*v))).collect();
        let opts = Options {
            vars: &vars,
            ..Options::default()
        };
        self.engine
            .t(key, &opts)
            .unwrap_or_else(|_| key.to_owned())
            .into()
    }

    /// The BCP-47 tag actually resolved (used only for logging).
    pub fn language(&self) -> &str {
        self.engine.language()
    }

    /// Test-only: a `Loc` pinned to `lng` regardless of the environment — the
    /// fixture/catalog invariants in `onboarding_flow` need deterministic
    /// strings on any machine.
    #[cfg(test)]
    pub(crate) fn pinned(lng: &str) -> Self {
        let mut engine = I18n::embedded().expect("en catalog compiled in");
        let state = engine.change_language(lng);
        if let Some(resolved) = state.resolved_language.as_deref()
            && resolved != "en"
        {
            engine.load_catalog(Catalog::embedded(resolved).expect("catalog compiled in"));
        }
        Self { engine }
    }
}

/// `zh_CN.UTF-8` → `zh-CN`; strips the encoding suffix and maps `_` → `-`.
/// `resolve_language` takes it from there (including `C`/`POSIX` → `en` via
/// its unsupported-tag fallback).
fn normalize_posix_tag(raw: &str) -> String {
    let no_encoding = raw.split('.').next().unwrap_or(raw);
    no_encoding.replace('_', "-")
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Every key the welcome screen renders, including the 13 added by spec 007.
    const WELCOME_KEYS: [&str; 16] = [
        "onboarding.welcome.desktopTagline",
        "onboarding.welcome.createWallet",
        "onboarding.welcome.alreadyHaveWallet",
        "onboarding.welcome.featureNoMnemonicTitle",
        "onboarding.welcome.featureNoMnemonicBody",
        "onboarding.welcome.featureOneAddressTitle",
        "onboarding.welcome.featureOneAddressBody",
        "onboarding.welcome.featureOpenSourceTitle",
        "onboarding.welcome.featureOpenSourceBody",
        "onboarding.welcome.featureKeyCustodyTitle",
        "onboarding.welcome.featureKeyCustodyBody",
        "onboarding.welcome.featureSafeContractTitle",
        "onboarding.welcome.featureSafeContractBody",
        "onboarding.welcome.featureStablecoinGasTitle",
        "onboarding.welcome.featureStablecoinGasBody",
        "onboarding.welcome.tagline",
    ];

    /// The 48 NEW spec-014 flow keys (contracts/i18n-keys.md) plus the reused
    /// root `common.cancel` (E1's secondary). The EXISTS onboarding keys the
    /// flow reuses were pinned by their own specs; this sweep guards the ones
    /// this feature introduced. Var-bearing keys (`{{seconds}}` …) resolve
    /// with the placeholder left in place under default options — still a
    /// non-echo, non-empty value, which is all this sweep asserts.
    const FLOW_KEYS: [&str; 49] = [
        "onboarding.common.headerShared",
        "onboarding.common.stepCounter",
        "onboarding.common.confirmInPrompt",
        "onboarding.common.waitedSeconds",
        "onboarding.common.networkTitle",
        "onboarding.common.networkBody",
        "onboarding.common.serverTitle",
        "onboarding.common.serverBody",
        "onboarding.common.timeoutTitle",
        "onboarding.common.timeoutBody",
        "onboarding.common.unknownTitle",
        "onboarding.common.unknownBody",
        "onboarding.common.cancelledSetupTitle",
        "onboarding.common.cancelledSetupBody",
        "onboarding.common.cancelledVerifyTitle",
        "onboarding.common.cancelledVerifyBody",
        "onboarding.common.unsupportedTitle",
        "onboarding.common.unsupportedBody",
        "onboarding.common.incompatibleTitle",
        "onboarding.common.incompatibleBody",
        "onboarding.common.notDiscoverableTitle",
        "onboarding.common.notDiscoverableBody",
        "onboarding.common.notFoundTitle",
        "onboarding.common.notFoundBody",
        "onboarding.common.back",
        "onboarding.common.retry",
        "onboarding.common.recreateWallet",
        "onboarding.common.editIndexEndpoint",
        "onboarding.common.reportError",
        "onboarding.common.openBiometricSettings",
        "onboarding.common.openCredentialManagerSettings",
        "onboarding.common.verifyStuckTitle",
        "onboarding.common.verifyStuckBody",
        "onboarding.common.syncFailedBody",
        "onboarding.common.copyAddress",
        "onboarding.common.copied",
        "onboarding.common.close",
        "onboarding.login.header",
        "onboarding.login.statusAwaitingPasskey",
        "onboarding.login.statusAwaitingPasskeyHint",
        "onboarding.login.statusCancelledTitle",
        "onboarding.login.statusCancelledBody",
        "onboarding.login.successTitle",
        "onboarding.login.successMessage",
        "onboarding.login.signInFailedBody",
        "onboarding.login.retryLoginBtn",
        "onboarding.login.createNewWalletBtn",
        "onboarding.create.retryVerifyBtn",
        "common.cancel",
    ];

    fn engine_for(lng: &str) -> I18n {
        let mut engine = I18n::embedded().expect("en catalog compiled in");
        let state = engine.change_language(lng);
        if let Some(resolved) = state.resolved_language.as_deref()
            && resolved != "en"
        {
            engine.load_catalog(Catalog::embedded(resolved).expect("catalog compiled in"));
        }
        engine
    }

    /// SC-004 as a test: no key echoes in the languages the visual pass uses,
    /// and zh/de actually differ from en (proves the catalog loaded).
    #[test]
    fn welcome_keys_resolve_without_echo() {
        let en = engine_for("en");
        for lng in ["en", "zh", "de", "zh-TW", "ru"] {
            let engine = engine_for(lng);
            for key in WELCOME_KEYS {
                let value = engine.t(key, &Options::default()).expect("t() is total");
                assert_ne!(value, key, "{lng}: `{key}` echoed the key");
                assert!(!value.is_empty(), "{lng}: `{key}` resolved empty");
                if lng != "en" && !key.ends_with("SafeContractTitle") {
                    let en_value = en.t(key, &Options::default()).expect("t() is total");
                    assert_ne!(value, en_value, "{lng}: `{key}` fell back to English");
                }
            }
        }
    }

    /// Spec 014's sweep: every flow key resolves in the visual-pass languages
    /// (no echo, no empty), and non-en locales differ from en — verified at
    /// authoring time that none of these 49 keys legitimately matches English
    /// in zh/de/zh-TW/ru, so no per-key exclusions are needed.
    #[test]
    fn flow_keys_resolve_without_echo() {
        let en = engine_for("en");
        for lng in ["en", "zh", "de", "zh-TW", "ru"] {
            let engine = engine_for(lng);
            for key in FLOW_KEYS {
                let value = engine.t(key, &Options::default()).expect("t() is total");
                assert_ne!(value, key, "{lng}: `{key}` echoed the key");
                assert!(!value.is_empty(), "{lng}: `{key}` resolved empty");
                if lng != "en" {
                    let en_value = en.t(key, &Options::default()).expect("t() is total");
                    assert_ne!(value, en_value, "{lng}: `{key}` fell back to English");
                }
            }
        }
    }

    /// The mock's zh flow copy is the source of record — pin representative
    /// keys verbatim (contracts/i18n-keys.md zh column).
    #[test]
    fn zh_flow_copy_matches_the_mock_verbatim() {
        let zh = engine_for("zh");
        let opts = Options::default();
        assert_eq!(
            zh.t("onboarding.common.networkTitle", &opts).unwrap(),
            "网络连接不稳定"
        );
        assert_eq!(
            zh.t("onboarding.login.statusAwaitingPasskey", &opts)
                .unwrap(),
            "正在等待通行密钥"
        );
        assert_eq!(
            zh.t("onboarding.common.headerShared", &opts).unwrap(),
            "创建钱包 / 登录"
        );
    }

    /// The mock's zh copy is the source of record — pin two representative keys.
    #[test]
    fn zh_matches_the_mock_verbatim() {
        let zh = engine_for("zh");
        let opts = Options::default();
        assert_eq!(
            zh.t("onboarding.welcome.desktopTagline", &opts).unwrap(),
            "您的密钥，您的资产"
        );
        assert_eq!(
            zh.t("onboarding.welcome.featureNoMnemonicTitle", &opts)
                .unwrap(),
            "不用助记词"
        );
    }

    #[test]
    fn posix_tags_normalize() {
        assert_eq!(normalize_posix_tag("zh_CN.UTF-8"), "zh-CN");
        assert_eq!(normalize_posix_tag("de"), "de");
        assert_eq!(normalize_posix_tag("pt_BR"), "pt-BR");
    }
}
