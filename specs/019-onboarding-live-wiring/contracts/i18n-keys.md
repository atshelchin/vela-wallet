# Contract — Translation corpus changes

**Feature**: 019 · Source of truth: `rust/crates/vela-core/i18n/locales/<lng>/onboarding.json`

Baseline: the `onboarding` namespace holds **163 leaves**; the corpus holds **1,184**
across 15 namespaces × 15 locales.

**No blob-width pre-work is needed.** Spec 014's `deviations.md` §8 warned that `ru` was
~1.2 KB from a `u16` ceiling. The generator now picks the offset width **per locale**
(`scripts/gen-i18n.mjs:252-290`, `src/i18n/catalog.rs:14-20`) and already emits `ru` as
`u32` (`src/i18n_catalogs/mod.rs:132`). Adding keys simply widens any locale that crosses
64 KiB. See [research.md D10](../research.md).

The pipeline, in order, every time this file changes:

```
npm run gen:i18n && npm run lint:i18n && npm run verify:i18n
npm run dump:vectors
npx jest                       # the root leaf/path count pins
npm run build:wasm             # rust/pkg-web is a committed artifact
cd rust && cargo test -p vela-core --features crux,i18n-all
```

Chinese below is the design file's own copy and is authoritative for `zh`. English is
this contract's proposal. The other 13 locales follow the
machine-translation-pending-human-review precedent established in spec 014.

---

## 1. Removed (6 leaves × 15 locales)

The four-acknowledgement gate becomes two (research D8). The legal line keeps its inline
link fragments but moves from `ack3` to `ack1`.

| Removed | Why |
| --- | --- |
| `onboarding.create.ack2` | "If your iCloud or Google account is compromised…" — becomes explanatory copy, not a gate |
| `onboarding.create.ack3` | replaced by `ack1` |
| `onboarding.create.ack3PrivacyPolicy` | → `ack1PrivacyPolicy` |
| `onboarding.create.ack3And` | → `ack1And` |
| `onboarding.create.ack3Terms` | → `ack1Terms` |
| `onboarding.create.ack3Period` | → `ack1Period` |

## 2. Rewritten (15 leaves × 15 locales)

| Key | New content |
| --- | --- |
| `create.ack0` | zh 「私钥由我的设备保管，Vela 找不回。」 · en "My private keys are held by my own device. Vela cannot recover them." |
| `create.ack1` | zh 「我同意 隐私政策 和 服务条款。」 · en "I agree to the Privacy Policy and Terms of Service." (rendered from the four fragments below) |
| `create.keysHint` | zh 「钱包地址由这组密钥决定，创建后不能再增减。」 · en "The wallet address is decided by this set of keys — none can be added or removed after creation." |
| `create.addKeyBtn` | zh 「添加通行密钥」 · en "Add a passkey" |
| `create.keysLabel` | zh 「已添加」 · en "Added" — the key-list section label |
| `create.successTitle` | zh 「钱包已创建」 · en "Wallet created" |
| `create.successMessage` | zh 「{{count}} 把密钥都能单独登录。合约在首笔交易时部署。」 · en "Any of your {{count}} keys can sign in on its own. The contract deploys with your first transaction." |
| `create.keyDeviceOnlyBadge` | zh 「仅本机」 · en "This device only" — deliberately NOT "This device", which is `methodPlatformTitle`; the badge and the add-method must not read identically |
| `create.keySyncedBadge` | zh 「已同步」 · en "Synced" |
| `create.needSecondKeyHint` | zh 「这把密钥只存在本机，没有同步备份。设备一旦丢失，钱包就打不开了。」 · en "This key exists only on this device, with no synced backup. Lose the device and the wallet cannot be opened." |
| `common.notDiscoverableTitle` | zh 「这台设备上没有可用的通行密钥」 · en "No usable passkey on this device" |
| `common.notDiscoverableBody` | zh 「系统里没有找到 VELA WALLET 的通行密钥。可以换一台已同步的设备，或插入你的硬件安全密钥。」 · en "The system has no Vela Wallet passkey. Try a device that already has one, or plug in your security key." |
| `common.recreateWallet` | zh 「创建新钱包」 · en "Create a new wallet" |
| `login.statusCancelledTitle` | zh 「验证已取消」 · en "Verification cancelled" |
| `login.statusCancelledBody` | zh 「系统的通行密钥窗口被关闭了，没有完成签名。」 · en "The system passkey sheet was closed, so nothing was signed." |

## 3. Renamed (4 leaves × 15 locales)

`create.ack3PrivacyPolicy` → `create.ack1PrivacyPolicy`, and likewise `ack3And` →
`ack1And`, `ack3Terms` → `ack1Terms`, `ack3Period` → `ack1Period`. Content unchanged.

## 4. Added (32 leaves × 15 locales)

### Welcome (v2 hero) — 3

| Key | zh | en |
| --- | --- | --- |
| `welcome.heroTitle` | 真正由你掌控的以太坊钱包 | The unstoppable Ethereum wallet |
| `welcome.heroTitleFit` | regular | regular |
| `welcome.heroSubtitle` | 用通行密钥签名，密钥留在你的设备里。 | Sign with a passkey. The key never leaves your device. |

`heroTitleFit` is the one corpus value that is not prose: an enum, `regular` or
`long`, naming which rung of the hero type ladder (46 / 38 / 31) this locale's
headline needs. It rides with the string because the width is a property of the
translation — measured at the shipped font the widest authored line runs 6.9em
(zh) to 10.9em (ru) — and all four clients read it through the `t()` they
already call. `gen-i18n.mjs` refuses to generate if a locale carries anything
else, and `welcome-ssr.e2e.ts` measures the rendered line count at 390×844 so a
copy edit that outgrows its rung fails rather than ships.

The rungs are sized for the 390pt design frame, which is the contract rather
than the floor (founder direction 2026-08-26). Measured on a 375pt iPhone SE,
`ru` wraps into a third and fourth line — it needs 337pt of column and has 327.
That is accepted: closing it would mean a second, viewport-driven shrink layered
under the locale one, and the narrow tail does not justify two mechanisms
arguing over one headline. Dropping a locale a rung to serve the smallest phone
is the wrong fix — it shrinks that headline on every phone.

### Name screen — 2

| Key | zh | en |
| --- | --- | --- |
| `create.assuranceCustody` | 自托管钱包。私钥由设备的密码管理器保管，不经过 VELA WALLET。 | Self-custodial. Your private key is held by your device's password manager and never passes through Vela Wallet. |
| `create.assuranceRecovery` | 丢失设备后，用已添加的其他通行密钥登录。 | If you lose a device, sign in with any of the other passkeys you added. |

### Key screen — 11

| Key | zh | en |
| --- | --- | --- |
| `create.keysTitle` | 添加通行密钥 | Add passkeys |
| `create.keysTitleBlocked` | 再加一把才能创建 | One more key before you can create |
| `create.keysSubtitle` | 任意一把都能单独登录，最多 7 把。 | Any one of them can sign in on its own. Up to 7. |
| `create.keysSubtitleBlocked` | 两把密钥，丢一把另一把照样登录。 | With two keys, losing one still leaves you a way in. |
| `create.keysSubtitleFull` | 已达上限 7 把。 | You've reached the limit of 7. |
| `create.keyCount` | {{current}} / {{max}} | {{current}} / {{max}} |
| `create.keyLimitReached` | 已达上限 7 把 | Limit of 7 reached |
| `create.keyHardwareBadge` | 硬件 | Hardware |
| `create.addSecondKeyBtn` | 先添加第 2 把密钥 | Add a second key first |
| `create.nextBtn` | 继续 | Continue |
| `create.addMethodLabel` | 再添加一把 | Add another |

### The three add methods — 7

| Key | zh | en |
| --- | --- | --- |
| `create.methodPlatformTitle` | 这台设备 | This device |
| `create.methodPlatformBody` | Touch ID 或 Windows Hello | Touch ID or Windows Hello |
| `create.methodHybridTitle` | 手机或平板 | Phone or tablet |
| `create.methodHybridBody` | 扫码，用附近设备创建 | Scan a code and create it on a nearby device |
| `create.methodHybridUnavailable` | 即将支持 | Coming soon |
| `create.methodSecurityKeyTitle` | USB 安全密钥 | USB security key |
| `create.methodSecurityKeyBody` | 插入后轻触 | Plug it in and touch it |

### Progress screen — 6

| Key | zh | en |
| --- | --- | --- |
| `create.progressTitle` | 正在生成钱包 | Creating your wallet |
| `create.progressSubtitle` | 用 {{count}} 把密钥推导地址。合约在首笔交易时部署，不花 gas。 | Deriving the address from {{count}} keys. The contract deploys with your first transaction — no gas now. |
| `create.progressMeterLabel` | 推导地址 | Deriving address |
| `create.taskVerifyKey` | 校验通行密钥公钥 | Verifying the passkey's public key |
| `create.taskDeriveAddress` | 推导账户地址 | Deriving the account address |
| `create.taskWriteIndex` | 写入密钥索引 | Writing the key index |

### Done screen — 2

| Key | zh | en |
| --- | --- | --- |
| `create.walletAddressLabel` | 钱包地址 | Wallet address |
| `create.identiconHint` | 地址生成的身份图案 | An identity pattern generated from the address |

### Desktop security key — 2

| Key | zh | en |
| --- | --- | --- |
| `create.securityKeyRequiredTitle` | 请插入安全密钥 | Plug in a security key |
| `create.securityKeyRequiredBody` | 这台电脑没有系统通行密钥服务。插入 FIDO2 USB 安全密钥后重试。 | This computer has no system passkey service. Plug in a FIDO2 USB security key and try again. |

Note `create.progressMeterLabel`: the design renders it in uppercase mono
(`DERIVING ADDRESS`). The **corpus stores sentence case** and the client applies the
transform — an uppercase source string breaks locales with no case distinction and
mangles the CJK rendering.

---

## 5. Reused without change

`common.retry` (重试), `common.back` (返回), `common.reportError`, `common.technicalDetails`
(via `create.technicalDetails`), the whole `common.*` failure taxonomy (network / server /
timeout / unknown / unsupported / incompatible / notFound), every `login.*` recovery
string, `create.status*`, `create.syncFailed*`, `create.nameTooLong`,
`create.accountNamePlaceholder`, `create.enterWalletBtn`, `create.confirmKeyBtn`,
`create.removeKeyBtn`, `create.startOverBtn`, `settings.*`.

`create.finishKeysBtn` ("Continue") is **retained although the v2 clients stop using it** —
the shipping Expo client still renders it, and FR-030 keeps that client working. The v2
key screen's CTA is `create.createWalletBtn` when enabled and `create.addSecondKeyBtn`
when blocked; its name screen's CTA is the new `create.nextBtn`.

## 6. Count pins to update

| Pin | Change |
| --- | --- |
| namespace `onboarding` leaves | 163 → **189** (−6 removed, +32 added; renames are net zero) |
| corpus leaves | 1,184 → **1,210** |
| path/leaf/branch pins in the root Jest suite | regenerate via `npm run dump:vectors`, then update the pinned numbers in the same commit |
| `tests/i18n_residency.rs` SC-005 figures | re-measure; `ja` + `en` must stay under the 135,345-byte budget |
