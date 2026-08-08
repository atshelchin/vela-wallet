# Contract — i18n keys per state (spec 014)

Authoritative mapping: every user-visible string in the 35 states → corpus key.
**EXISTS** = already in all 15 locales, reuse as-is (do not re-translate).
**NEW** = author in all 15 locales (zh value below is the mock's verbatim copy; en value
below is the authored source pair; other 13 locales follow repo translation conventions).

Scaffold titles: create = `onboarding.create.headerDefault` (EXISTS), login = NEW
`onboarding.login.header` (登录 / Sign In), sync = `onboarding.create.headerSyncFailed`
(EXISTS 跨设备同步), shared = NEW `onboarding.common.headerShared` (创建钱包 / 登录 —
en: Create Wallet / Sign In).

## New keys (all 15 locales) — namespace `onboarding.common` is a NEW branch

| Key | zh | en |
| --- | --- | --- |
| `onboarding.common.headerShared` | 创建钱包 / 登录 | Create Wallet / Sign In |
| `onboarding.common.stepCounter` | 第 {{current}}/{{total}} 步 | Step {{current}} of {{total}} |
| `onboarding.common.confirmInPrompt` | 请在系统弹窗中确认。 | Confirm in the system prompt. |
| `onboarding.common.waitedSeconds` | 已等待 {{seconds}} 秒 | Waited {{seconds}} seconds |
| `onboarding.common.networkTitle` | 网络连接不稳定 | Network connection is unstable |
| `onboarding.common.networkBody` | 请求没有送达，请检查网络后重试。 | The request never arrived — check your network and try again. |
| `onboarding.common.serverTitle` | 服务暂时不可用 | Service temporarily unavailable |
| `onboarding.common.serverBody` | 通行密钥索引服务无法访问，创建和登录都需要它。 | The passkey index service is unreachable — both creating and signing in need it. |
| `onboarding.common.timeoutTitle` | 等待超时 | Timed out waiting |
| `onboarding.common.timeoutBody` | {{seconds}} 秒没有响应，已停止。 | No response after {{seconds}} seconds — stopped. |
| `onboarding.common.unknownTitle` | 出错了 | Something went wrong |
| `onboarding.common.unknownBody` | 发生了未归类的错误。 | An unclassified error occurred. |
| `onboarding.common.cancelledSetupTitle` | 设置已取消 | Setup cancelled |
| `onboarding.common.cancelledSetupBody` | 通行密钥没有创建，钱包尚未生成。 | No passkey was created — no wallet exists yet. |
| `onboarding.common.cancelledVerifyTitle` | 验证已取消 | Verification cancelled |
| `onboarding.common.cancelledVerifyBody` | 请重试验证以完成创建。 | Retry verification to finish creating your wallet. |
| `onboarding.common.unsupportedTitle` | 设备不支持 | Device not supported |
| `onboarding.common.unsupportedBody` | 此设备没有可用的生物识别认证。 | This device has no usable biometric authentication. |
| `onboarding.common.incompatibleTitle` | 设备不兼容 | Device not compatible |
| `onboarding.common.incompatibleBody` | 当前的密码管理器与 Vela 不兼容。 | The current password manager isn't compatible with Vela. |
| `onboarding.common.notDiscoverableTitle` | 通行密钥未能同步 | Passkey didn't sync |
| `onboarding.common.notDiscoverableBody` | 它只存在本机，无法用于其他设备登录或找回。钱包还没有创建。 | It exists only on this device and can't sign in or recover anywhere else. No wallet was created. |
| `onboarding.common.notFoundTitle` | 未找到账户 | Account not found |
| `onboarding.common.notFoundBody` | 索引中没有这枚通行密钥对应的钱包。 | The index has no wallet for this passkey. |
| `onboarding.common.back` | 返回 | Back |
| `onboarding.common.retry` | 重试 | Retry |
| `onboarding.common.recreateWallet` | 重新创建钱包 | Create wallet again |
| `onboarding.common.editIndexEndpoint` | 修改索引服务地址 | Change index service address |
| `onboarding.common.reportError` | 上报这个错误 | Report this error |
| `onboarding.common.openBiometricSettings` | 前往系统设置开启生物识别 | Open system settings to enable biometrics |
| `onboarding.common.openCredentialManagerSettings` | 前往系统设置切换密码管理器 | Open system settings to switch password manager |
| `onboarding.common.verifyStuckTitle` | 验证一直失败？ | Verification keeps failing? |
| `onboarding.common.verifyStuckBody` | 设备可能没有正确保存这枚通行密钥。还没有创建任何内容。 | Your device may not have stored this passkey correctly. Nothing has been created yet. |
| `onboarding.common.syncFailedBody` | 钱包已创建，但公钥未上传，其他设备暂时无法登录。 | Wallet created, but the public key wasn't uploaded — other devices can't sign in yet. |
| `onboarding.common.copyAddress` | 复制地址 | Copy address |
| `onboarding.common.copied` | 已复制 | Copied |
| `onboarding.common.close` | 关闭 | Close |

| Key (login/create namespaces) | zh | en |
| --- | --- | --- |
| `onboarding.login.header` | 登录 | Sign In |
| `onboarding.login.statusAwaitingPasskey` | 正在等待通行密钥 | Waiting for your passkey |
| `onboarding.login.statusAwaitingPasskeyHint` | 请在系统弹窗中用 Face ID 或指纹确认。 | Confirm with Face ID or your fingerprint in the system prompt. |
| `onboarding.login.statusCancelledTitle` | 登录已取消 | Sign-in cancelled |
| `onboarding.login.statusCancelledBody` | 没有完成通行密钥验证。 | The passkey verification wasn't completed. |
| `onboarding.login.successTitle` | 登录成功 | Signed in |
| `onboarding.login.successMessage` | 钱包已恢复到这台设备。 | Your wallet is restored on this device. |
| `onboarding.login.signInFailedBody` | 请确认设备已设置 Face ID、Touch ID 或指纹。 | Make sure Face ID, Touch ID or a fingerprint is set up on this device. |
| `onboarding.login.retryLoginBtn` | 重试登录 | Retry sign-in |
| `onboarding.login.createNewWalletBtn` | 创建新钱包 | Create a new wallet |
| `onboarding.create.retryVerifyBtn` | 重试验证 | Retry verification |

Count-pin impact (`scripts/gen-i18n.mjs:134-140`): +1 branch (`onboarding.common`),
+38 `onboarding.common` leaves, +10 `onboarding.login` leaves, +1 `onboarding.create`
leaf → expected pins become 1245+50=1295 paths / 1172+49=1221 leaves / 73+1=74 branches.
(Recompute at implementation time; the generator prints actuals. Extend the pin comment
citing spec 014.)

## Per-state key map

Notation: H = headline, B = body, S = scaffold title, P/S1/S2 = primary/secondary actions.

| Code | S | Keys |
| --- | --- | --- |
| A1/A2/A3 | create.headerDefault | label `create.accountNameLabel`, placeholder `create.accountNamePlaceholder`, hint `create.accountNameHint`, too-long `create.nameTooLong` (A3), acks `create.ack0/ack1` + row3 `create.ack3`+`ack3PrivacyPolicy`+`ack3And`+`ack3Terms`+`ack3Period`, CTA `create.createWalletBtn` — all EXISTS |
| A4–A8 | create.headerDefault | step `common.stepCounter` (NEW), H `create.statusSettingUpIdentity / statusVerifyingIdentity / statusExtractingKey / statusComputingAddress / statusSyncingKey` (EXISTS ×5), A4 hint `common.confirmInPrompt` (NEW); c-variants add ring a11y `common.waitedSeconds` (NEW) |
| A11 | create.headerDefault | H `create.successTitle`, B `create.successMessage` ({{count}}=12), verify line `create.verifyHint`, copy a11y `common.copyAddress`/`common.copied` (NEW), P `create.enterWalletBtn` — rest EXISTS |
| A12 | create.headerSyncFailed | H `create.syncFailedTitle` (EXISTS), B `common.syncFailedBody` (NEW — mock copy differs from create.syncFailedMessage; reuse decision at impl: prefer existing `create.syncFailedMessage` if the mock's shorter line is judged equivalent — default NEW), P `create.retryUploadBtn` (EXISTS), S1 `common.editIndexEndpoint` (NEW), S2 `common.reportError` (NEW) |
| A13 | create.headerDefault | H `common.verifyStuckTitle` (NEW; existing `create.verifyStuckHint` is one merged sentence — kept for RN), B `common.verifyStuckBody` (NEW), P `create.finishVerifyBtn` (EXISTS), S1 `create.startOverBtn` (EXISTS), S2 `common.back` (NEW) |
| E1 | create.headerDefault | H `common.networkTitle`, B `common.networkBody`, P `common.retry`, S1 `common.cancel` → **reuse root `common.cancel` (EXISTS)** |
| E2/E2x | create.headerDefault | H `common.serverTitle`, B `common.serverBody`, disclosure label `create.technicalDetails` (EXISTS), P `common.retry`, S1 `common.editIndexEndpoint`, S2 `common.reportError` |
| E3 | create.headerDefault | H `common.timeoutTitle`, B `common.timeoutBody` ({{seconds}}=60), P `common.retry`, S1 `common.back` |
| E4 | create.headerDefault | H `common.cancelledSetupTitle`, B `common.cancelledSetupBody`, P `common.recreateWallet`, S1 `common.back` |
| E5 | create.headerDefault | H `common.cancelledVerifyTitle`, B `common.cancelledVerifyBody`, P `create.retryVerifyBtn` (NEW), S1 `common.back` |
| E6 | create.headerDefault | H `common.unsupportedTitle`, B `common.unsupportedBody`, P `common.openBiometricSettings`, S1 `common.back` |
| E7 | create.headerDefault | H `common.incompatibleTitle`, B `common.incompatibleBody`, P `common.openCredentialManagerSettings`, S1 `common.back` |
| E8 | create.headerDefault | H `common.notDiscoverableTitle`, B `common.notDiscoverableBody`, P `common.recreateWallet`, S1 `common.openCredentialManagerSettings`, S2 `common.back` |
| E9 | login.header (NEW) | H `common.notFoundTitle`, B `common.notFoundBody`, P `login.createNewWalletBtn` (NEW), S1 `common.editIndexEndpoint`, S2 `common.back` |
| E10 | common.headerShared (NEW) | H `common.unknownTitle`, B `common.unknownBody`, P `common.retry`, S1 `common.reportError`, S2 `common.back` |
| B1/B1c | login.header | bar (no step counter), H `login.statusAwaitingPasskey` (NEW), B `login.statusAwaitingPasskeyHint` (NEW), ring a11y `common.waitedSeconds` |
| B2 | login.header | H `login.recoverOfferTitle` (EXISTS), B `login.recoverOfferBody` (EXISTS), P `login.recoverConfirm` (EXISTS 立即找回), S1 `login.recoverCancel` (EXISTS 暂时不用) |
| B3 | login.header | H `login.recoverFailedTitle` (EXISTS), B `login.recoverFailedBody` (EXISTS), P `common.retry`, S1 `common.back` |
| B4 | login.header | H `login.alertSignInFailedTitle` (EXISTS 登录失败), B `login.signInFailedBody` (NEW — existing alertSignInFailedBody needs {{message}}; mock body is static), P `common.retry`, S1 `common.reportError`, S2 `common.back` |
| B5 | login.header | H `login.successTitle` (NEW), B `login.successMessage` (NEW), P `create.enterWalletBtn` (EXISTS 进入钱包) |
| B6 | login.header | H `login.statusCancelledTitle` (NEW), B `login.statusCancelledBody` (NEW), P `login.retryLoginBtn` (NEW), S1 `common.back` |

Notes:
- `onboarding.common.retry` vs root `common.tryAgain`: mocks use 重试; root `common.tryAgain`
  is also 重试 — implementation MAY reuse `common.tryAgain` and drop
  `onboarding.common.retry`; whichever is chosen, one authority, applied on all platforms
  identically. Same option for `common.cancel` (root EXISTS, use it — listed above).
- Never render mock annotation strings. Never hardcode any of the above in view code.
