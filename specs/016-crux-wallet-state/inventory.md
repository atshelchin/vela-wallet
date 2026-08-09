# Business-State Inventory — Vela Wallet (Expo web)

**Feature**: [016-crux-wallet-state](./spec.md) · **Date**: 2026-08-09

Produced by a 10-domain parallel analysis of every page, module, component,
hook and service under `src/` (all files read, none missing), cross-checked and
merged. Format per machine: scope, model, events, operations, invariants with
`file:line` provenance, and integration notes. Priorities: P1 = money/safety
rules most entangled with UI; P2 = session & master-data; P3 = periphery.

**Wave 1 (this spec)**: `display_currency`, `receive_watch` (a.k.a.
deposit_watcher below), `payment_request`. Everything else is the roadmap for
specs 017+ — the recommended order is in §Summary below.

## Summary

## Vela Wallet 业务状态清单综述

**仓库根**: `/Volumes/data/production/agent-2/vela-wallet`。10 份领域报告共产出 ~120 条业务状态条目（high 严重度约 45 条），无一份报告发现指定文件缺失；全部文件已实读。既有 Crux 先例是 spec 011 的 `create_wallet` / `login` 两台机器（`rust/crates/vela-core/src/app/`，JSON/wasm 边界 + `src/services/crux/effect-loop.ts` + `onboarding-core/executor.web.ts`），本清单所有提案沿用其范式：Model 私有、ViewModel 语义化投影、ShellOperation 是"句子"、失败是 serde variant、i18n key 留 shell。

### 状态分布与耦合热点

1. **发送流程**（useSendController.ts 1273 行，40+ useState/useRef）：多步表单、三种模式（单发/split/multiSelect）、金额/费用/储备数学、单飞锁、乐观确认——资金不变量最密集，几乎全部靠 useRef + 注释纪律维持。
2. **dApp 签名审批**（dapp-connection.tsx 1073 行 Provider）：BUG-2/BUG-3/funding-rid 三类历史资金 bug 全源于 React 异步状态与同步锁错配；4 个同步 ref 补丁是 Crux 同步 update 的直接受益者。
3. **余额聚合**（useHomeController.ts 649 行）：max(live,cached)、流式合并、退避重试、stale-account 竞态守卫（7 处手工 addressRef 检查）。
4. **模块级可变单例遍地**：tokenCache、nonce/deployed 缓存、banMap、descriptorCache、identity memo、rpc failed 集合——被跨域同步读取，迁移必须一次性划定所有权。

### 跨分析员重叠的合并裁决

- **三个并行轮询者**（safe-transaction 的 waitForReceipt、tx-reconciler、TransactionReceipt 自轮询）→ 统一为 `tx_tracker` 一台机器（报告 2/8/1 一致建议）。
- **费用数学被 3 份报告分别提名**（send 的 fee_policy、签名页的 fee_quote、GasFeeCard 共享组件）→ 统一为 `fee_policy` 纯模块，send 与 dapp 签名共用，避免"显示即签名"链路劈成两套。
- **token 信任模型分裂在 3 份报告**（transfer-monitor allowlist、token-autoadd 准入、tx-simulation 不对称信任）→ 统一为 `token_trust`：它们是同一个反诈骗安全模型（收入需可信来源、绝不从模拟日志入账），且经 getCachedHeldTokens 隐式互相耦合。
- **扫码决策树双份实现已漂移**（useHomeController.ts:507-534 vs SendScreen.tsx:179-205）+ /pay 解析 + 收款请求构建 → 收敛进 `payment_request` 单一 PayRequest 归一类型。
- **add-network 去重不变量已发散**（AddNetworkModal 有查重、services/add-network.ts 无）→ `network_admin` 单核收编两个调用方。
- **§12.1.6 签名账户对账**（报告 5/7 各提一台）→ 并入 `sign_request`（它是审批流程的时序前置）。
- **display_currency**（报告 1 的 money display + 报告 6 的首启种子规则）→ 合并为一台。

### 命名澄清（分析员实证）

- 仓库**没有 WalletConnect SDK**——"WalletPair"是自研 WS relay + X25519 指纹配对协议；会话与授权均**无 TTL**（被动发现过期）。
- `abi-decode.ts`/`abi.ts`/`attestation-parser.ts`/`safe-address.ts` 等标注 QUARANTINED byte-frozen oracle，真实现已在 vela-core（spec 001），不属本次抽取。
- `src/app/` 下大量文件是 2 行 re-export 路由壳；真实状态主体在 `src/screens/*/use*Controller.ts` 与 `src/services/`。

### 测试安全网（报告 10）

~100 个 service 层 jest 是现成行为规格书；e2e 18 个 Playwright spec 用**屏上英文文案**定位（无 testID）——迁移期间 Render 输出文案必须逐字节保持。3 个 jest 是对源码文本的 grep 断言（send-same-fee-token / send-tempo-gate / currency-picker-scope），逻辑进 Rust 的那个 PR 必须同步重写。Safari 真机矩阵（4 条资金安全不变量）不在 CI，相关迁移需手动重跑 `e2e/safari/run_matrix.py`。命令：`npm run test:core`（cargo test）、`npm run dump:vectors`/`verify:wasm`（平价工作流）、`npm run test:e2e`。

### 建议迁移顺序

P1 内部：`fee_policy`（纯数学零风险）→ `approval_guard`（已纯化）→ `clear_signing` → `tx_tracker`（统一三轮询者）→ `sign_request` → `send`（最大、收益最高）。P2 以 `rpc_pool` 决策核与 `session` 先行（所有资金流程的上游真相源）。任何 P1 动工前必须先解决 open_questions 第 1 条（native 双实现策略）。

## Candidate machines

### send (P1)

**Scope**: 发送流程主机：多步表单（select-token→enter-details→confirm→receipt）、单发/split（一币多人）/multiSelect（多币一人清仓）三模式、EIP-681 锁定请求解析、金额实时校验与 Max 计算、同资产费用上限拦截、金库 bootstrap 预检、签名→提交生命周期、单飞重入锁与取消语义。发送域的表单与交易生命周期强耦合（校验依赖报价、confirm 依赖预检、取消横跨签名窗口），按原则收进同一台机器。

**Model**: Model = { step: SelectToken|EnterDetails|Confirm|Receipt, mode: Single|Split{recipients:Vec<RecipientDraft>}|MultiSelect{selected_ids, chain_id}, locked_request: Option<Eip681Lock>, token, recipient, amount{value: String(canonical dot), in_fiat: bool}, tokens: Vec<Token>, fee: 引用 fee_policy 的 quoted 状态, tx: Idle|Preparing|Signing|Submitting|Confirmed{user_op_hash, tx_hash: Option}|Error{kind}, send_lock: {held, generation}, treasury_bootstrap: Option<Status>, cancelled: bool, 派生: amount_warning / same_asset_fee_issue（纯派生，不再是 useState+IIFE） }。现散落在 useSendController 的 ~40 个 useState/useRef 全部收入。

**Events**: SelectToken, ConfirmMultiSelection, SetRecipient, SetAmount, ToggleFiatInput, TapMax, EnterSplitMode, RecipientsChanged, SeedSplitRecipients, ScanResolved{Eip681|Address}, Continue, Back, ChooseFeeToken, SlideConfirm, CancelSigning, RetryAfterBootstrap, AddNetworkResolved ＋ ShellResult 回送: TokensLoaded, LockResolved, FeeQuoted, TreasuryProbed, AccountLoaded, PasskeySigned/PasskeyCancelled, UserOpSubmitted, SubmitFailed{classified}, IdentityResolved, RiskResolved, SimResolved, TimerFired{tag}（全部带 attempt/generation 标签防过期结果）

**Operations**: FetchTokens{address}, ResolveTokenMetadata{chain,addr}, EstimateFee{calls, gas_fee_token, pub_key}, ProbeTreasury{chain}, LoadAccountCredential{id}, SignPasskey{challenge}, SubmitUserOp{op}, PersistTxRecords{records}(原子批量), PatchTxRecords{ids, patch}, ResolveIdentity{addr}, ResolveRisk{chain, addr}, SimulateCalls{calls}, AddNetwork{chain_id}, StartTimer{ms, tag}/CancelTimer, Haptic{kind}, ClearTokenCache, Render

**Invariants**: ①显示即签名：in-band 签名费用与 confirm 展示的 quotedFee 逐字一致（useSendController.ts:933-943; safe-transaction.ts:1286-1296）②未通过地址/金额/余额校验绝不进 confirm；估算失败/15s 超时绝不带假预览前进（useSendController.ts:651-791, 724-784）③tx 进行中 Back 必须拒绝（:1116）；~20s Phase-2 等待中取消后 passkey 弹窗绝不复活（:80-83）④单飞锁 generation token：被取消 promise 的 stale end 绝不释放新发送的锁（reentry-lock.ts:27-51, issue #91）⑤bundler 接受后慢/失败回执绝不把已提交付款翻成 error（useSendController.ts:1000-1004）⑥批量兄弟记录单次原子写（:1035-1039）；patch 先 await pendingWrites（:1045-1049）⑦fee-hold 是等待不是失败（:1051-1058）⑧同资产费用超限的注定失败批绝不到达 passkey（:860-875; safe-transaction.ts:310-332 sameAssetFeeLimit）⑨Max 字符串精确：toBaseUnits(result)+reserve===balance（:793-848; batch-send.ts:176-179）⑩split ≤60 行、sumSplitBaseUnits≤余额且与提交同一 helper（MultiRecipientEditor.tsx:56-96; batch-send.ts:42,92-101）⑪multiSelect 单链、原生行留 EntryPoint prefund、erc20 费用币 2× 裁剪、预览与签名同一 multiTokenSpecs（use-token-multi-select.ts:49-52; batch-send.ts:150-201; useSendController.ts:559-568）⑫EIP-681 金额按链上真实 decimals 还原而非链接声称的 dec（useSendController.ts:205-216）⑬split 行内扫码只取地址绝不清空其他行（SendScreen.tsx:184-189）⑭签名前金库复查覆盖预检后竞态窗口（:926-930; bundler-service.ts:787-839）⑮原始 RPC 异常绝不呈现在资金确认屏（:1097-1103）

**Sources**:

- `src/screens/wallet/useSendController.ts`
- `src/screens/wallet/SendScreen.tsx`
- `src/screens/wallet/send-utils.ts`
- `src/screens/wallet/EnterDetailsStep.tsx`
- `src/screens/wallet/ConfirmStep.tsx`
- `src/services/batch-send.ts`
- `src/services/safe-transaction.ts (551-949, 1215-1357)`
- `src/services/reentry-lock.ts`
- `src/services/eip681.ts`
- `src/services/bundler-service.ts (787-839)`
- `src/services/fiat-convert.ts`
- `src/components/send/MultiRecipientEditor.tsx`
- `src/hooks/use-token-multi-select.ts`

**Integration notes**: 最大重构面：控制器现返回 ~90 字段含裸 setter（useSendController.ts:1154-1270），ConfirmStep 取消按钮直接调 setTxStatus/sendLock.cancel()/Passkey.cancelSign()——迁移后 shell 只能发 Event，必须收回全部旁路。bigint 走十进制字符串编码（StoredAssetSim 已示范）。15s 估算超时、3s 取消钮延迟、3×3s 提交重试全部变 Timer operation。bundler 错误文案正则分类（parseBundlerUnderfunded、/gas relayer unavailable/i）留在 shell 的 result 映射层，映射为 typed variant 进核。makeRecipientId 进程计数器改核内确定性序号。mountedRef 双轨语义 = Render 可丢、PersistTxRecords 不可丢。3 个源码 grep jest（send-same-fee-token/send-tempo-gate/send-utils）必须同 PR 重写为 core 状态机测试；e2e batch-send/send-to-group/send-high-risk/eip681-pay 是现成黑盒安全网。依赖 fee_policy、tx_tracker、payment_request（ScanResolved）。

---

### fee_policy (P1)

**Scope**: 费用报价与储备纯数学模块，send 与 dApp 签名两条流程共用（GasFeeCard/FeeTokenSelector 是共享组件）：tier 乘数、in-band 计价（USD 8 位定点）、sameAssetFeeLimit、reserveNativeGas/reserveFeeToken、maxNativeSendable、Tempo 报销分账、报价 TTL 与链有效性、费用资产余额充足性判定。

**Model**: Model = { chain_id, tier, fee_asset: Native|Erc20{addr}, quotes: Vec<InBandQuote{asset, decimals, usd_price, recipient}>, estimate: Option<{total_gas, network_fee_per_gas}>, quoted: Option<{amount, recipient}>, staleness/valid_for_chain, busy }。calculateInBandFeeAmount / usdPriceScaled / tempoReimbursement / sameAssetFeeLimit / rawBundlerGasCost / deriveChainGasPrice 已是纯函数，直译 Rust。

**Events**: QuoteRequested{tx|batch}, EstimateLoaded, QuotesLoaded, SelectFeeAsset{token|native}, Requote, LeaveConfirm(重置 erc20 估价), ChainChanged(旧报价失效), QuoteExpired

**Operations**: BundlerGasQuoteRPC(pimlico_getUserOperationGasPrice), EstimateUserOpGasRPC, InBandQuoteRPC(vela_getInBandGasQuote, 8s 缓存留 shell), GasPriceRPC, Timer(8s/30s TTL)

**Invariants**: ①报价只对其计算所在链有效，晚到的旧链报价绝不污染新表单（useSendController.ts:119-121; TransactionFeeEstimate.chainId safe-transaction.ts:265）②换算永不 undercharge：native USD 价向上取整、fee 币价向下取整（safe-transaction.ts:351-363）③稳定币最小 $0.01 / native 最小 0.00001；Tempo recipient 变更或低于 floor 即拒签（safe-transaction.ts:1087-1095）④bundler 报 0 价视为『不能报价』走本地兜底（:2070-2073）⑤undeployed 账户缺 publicKeyHex 绝不估算（initCode 必需, :634-642）⑥离开 confirm 必须清 erc20 估价防下游储备数学读到 0（useSendController.ts:467-473）⑦估费失败/进行中/重报价中确认必须禁用（SigningSheet.tsx:576-583）；新签名请求必须重置费资产（:247-249）⑧balance<fee 的费用资产禁选（FeeTokenSelector.tsx:74）⑨估算必须用真实 calldata 形状（防 Arbitrum 8× 过收费, useSendController.ts:734-753）

**Sources**:

- `src/services/safe-transaction.ts (242-434, 551-765, 1918-2086)`
- `src/services/tempo.ts`
- `src/services/batch-send.ts (136-201)`
- `src/services/bundler-service.ts (589-637)`
- `src/components/ui/GasFeeCard.tsx`
- `src/components/ui/FeeTokenSelector.tsx`
- `src/hooks/use-inband-fee-tokens.ts`
- `src/screens/wallet/useSendController.ts (116-166, 468-473, 718-786)`

**Integration notes**: 迁移成本最低、property test 收益最高的起点（bigint 定点数学天然适合 Rust）。GasFeeCard 内部的重报价循环（requoteInBandFee）现同时服务 send 与 dapp 签名——只抽一边会把『显示即签名』链路劈成两套，必须作为共享模块被 send 与 sign_request 两台机器消费。8s 报价缓存/in-flight 合并留 shell 执行层。

---

### sign_request (P1)

**Scope**: dApp 签名审批状态机：请求进入→审阅→gas 预检→（funding 分支）→passkey 提交→响应回送→记录落盘的完整生命周期，含 swipe-dismiss 语义分派、per-request 链/transport/dapp 身份路由、切链取消规则、§12.1.6 签名账户对账、EIP-5792 批量、extension/popup 一次性签名契约。替代 dapp-connection.tsx approveRequest 的 4 个同步 ref 锁。

**Model**: Model = { pending: Option<{id, method, params, origin, owner_transport_id, chain_id, dapp_identity}>, phase: Idle|Reviewing|GasPrecheck|FundingWait{pinned_rid, capped_opts}|PasskeySubmitting|Submitted{op_hash}|Succeeded|Failed{kind}, cancelled: bool, last_approve_opts(capped params, bigint 十进制字符串), approval_choice/batch_choices(来自 approval_guard), pending_record_id, granted_account_reconciled: bool }。F2『响应回属主 transport』从 ref 变成 Model 数据。

**Events**: RequestArrived{id, method, params, origin, transport_id, chain_id?, dapp?}, ChainSwitchRequested{chain_id}, ApproveTapped{opts}, RejectTapped, DismissTapped, SwipeDismissed(核按 phase 分派→Reject|Dismiss|FundingCancel), PreCheckDone{funding?|timeout}, SponsorshipDone, FundingCompleteTapped, FundingCancelled, PasskeyCancelled, OpSubmitted{hash}, SubmitSucceeded, SubmitFailed{msg, underfunded?}, AccountReconciled, TransportDropped{transport_id}, TimerFired

**Operations**: SendResponse{transport_id, id, result?|error{code,msg}}, CheckBundlerFunding, AttemptSponsorship, SignAndSubmit{request, chain_id, fee_opts}(拆为 Submitted/Succeeded/Failed 多次回送), PersistRecord/UpdateRecord, PollReceipt(交 tx_tracker), SwitchActiveAccount{index}(经 session), Timer(15s 预检竞速), Haptic, Render

**Invariants**: ①BUG-2：已 reject（4001 已发）的请求绝不允许仍广播交易或对同 id 再发成功；isSubmitting 后 swipe=dismiss 不 reject（dapp-connection.tsx:705-709, 851, 859; SigningRequestModal.tsx:34-42）②BUG-3：同 tick 双击绝不产生两次并发提交/两次 passkey（:632-633）③funding retry 必须与发起请求同 rid 且携带原 capped opts（:918-937）；晚到的充值 sheet 不劫持新请求（:860-864）④§4：持久记录先于 dApp 可轮询到的结果落盘（:753-770; dapp-history.ts:47-206）⑤F2：响应必须发给拥有该请求的 transport（dapp-request-routing.ts:26-76; dapp-connection.tsx:775）；F3/F4：签名/展示/历史用请求自己的链与 dApp 身份（:336-388）⑥切换全局链必须取消绑定旧链的挂起签名（4001 'wallet switched chains', :376-383）；不支持的链进 UI 前 4902 拒绝（use-dapp-signing.ts:105-156）⑦§12.1.6：先切到被授权账户、批准面才可操作；地址与 granted 不一致 4100 拒绝，绝不静默换签名者（dapp-request-routing.ts:67-76; web-request.tsx:190-207; ExtensionSignController.tsx:125-133）⑧extension 同一 rid 绝不二次签名；只有明确用户拒绝才落盘 4001，其余失败走可恢复 4900；>5min 请求不签（extension-bridge-transport.ts:66-207）⑨签名/提交/记录用 paramsOverride(capped) 而非原始请求（dapp-connection.tsx:638）⑩批量必须先拒绝不支持的 required capability(5700) 再触碰钱包（use-dapp-signing.ts:66-84, 403）

**Sources**:

- `src/models/dapp-connection.tsx (203-946)`
- `src/models/dapp-request-routing.ts`
- `src/components/signing/SigningRequestModal.tsx (34-42)`
- `src/components/signing/SigningSheet.tsx`
- `src/hooks/use-dapp-signing.ts`
- `src/services/dapp-history.ts`
- `src/services/extension-bridge-transport.ts`
- `src/services/extension-sign-bus.ts`
- `src/app/web-request.tsx (169-250)`
- `src/components/ExtensionSignController.tsx`

**Integration notes**: Crux 同步 update 天然消灭 approveInFlightRef/signCancelledRef/fundingRidRef/consentRef 这类 async-state 补丁，但前提是 shell 把 transport 事件、passkey 完成、funding 轮询、导航事件串进单一事件队列。incomingRequest.__transport 活对象引用改为 transportId 句柄 + shell 维护 id→实例表（句柄失配会重现 F2，需 shell 侧测试）。取消需要 shell abort 语义——现有 Bridge 的 cancelled_effect_ids 通道恒空，需扩展（见 open_questions）。『cancelled 后 update 绝不再发 SubmitUserOp 命令』要配属性测试。concurrent-session.test.ts 已证明纯化可行。userOp→链跟踪与只读转发白名单（use-dapp-signing.ts:29-58, 503-688）随本机迁入或留 shell 路由表，未知方法绝不盲转发（:516-519）。

---

### approval_guard (P1)

**Scope**: 永不无限授权守卫与额度编辑器：detectApproval（8 种授权形态识别，不依赖描述符）、rewriteApprovalParams（有限额重编码）、enforceNoUnlimited（提交咽喉终审）、金额/布尔两种 cap 编辑器的 choice 派生、EIP-5792 批量逐 leg 封顶、increaseAllowance 合计展示。

**Model**: Model = { detected: Option<DetectedApproval{kind, spender, amount_raw(十进制字符串), is_unbounded/is_boolean_grant/is_reducing/editable, locus}>, token_meta{symbol, decimals, verified}, editor_mode: Requested|Balance|Custom|Revoke|Grant, custom_input, derived choice: Option<Choice>(null=确认禁用), current_allowance: Option, balance_raw: Option, batch: Vec<LegState> }。cap 常量：uint256 域 2^200、uint160 域 2^152。

**Events**: ApprovalDetected{method, params}, MetaResolved, AllowanceRead, BalanceRead, PresetSelected{mode}, CustomAmountChanged{text}, GrantDeliberatelyChosen, RevokeChosen, LegChoiceChanged{index, choice}

**Operations**: ReadTokenMetadata(Multicall3), ReadErc20Allowance, ReadErc20Balance（均为 RPC 读，其余全纯）

**Invariants**: ①任何代码路径不得放出 ≥cap 的链上额度；UI 门控 + 提交端 enforceNoUnlimited fail-closed 双保险（approval-guard.ts 全文; use-dapp-signing.ts:364 单笔, 413-415 批量逐 leg）②rewrite 只改目标 32 字节字，assertOnlyWordChanged 否则抛错（approval-guard.ts:432-440）③离链 permit 签名绝不改写（改写使签名与 dApp 上链 struct 脱钩回滚）——走明示同意而非静默封顶（:223, 376-384; SigningSheet.tsx:421-423）④unbounded 请求初始 choice=null，用户选定有限额/revoke 前确认禁用（EditableApproveCard.tsx:85-107; SigningSheet.tsx:576-583）；custom ≥cap → choice=null+报错（:101-104）⑤布尔 grant-all 默认不预选，强迫 deliberate tap（:217）；setApprovalForAll 只有 revoke/明示 grant 两种改写⑥批量每个 granting leg 必须 capped/revoked/明示 grant 才能确认（SigningSheet.tsx:583; BatchCallsView.tsx:40-53）⑦『increase by 100』绝不读作『cap at 100』——读链上 allowance 显示合计，读失败仍须警示叠加语义（ApprovalView.tsx:40-66, 143-171）⑧typed-data 金额用十进制字符串防 JS number 精度损失（approval-guard.ts:359-361）⑨未验证 decimals 必须显式警示（EditableApproveCard.tsx:200-202; PermitSignView.tsx:103-105）

**Sources**:

- `src/services/approval-guard.ts`
- `src/components/signing/EditableApproveCard.tsx`
- `src/components/signing/SigningSheet.tsx (196-228, 316-387, 527-583)`
- `src/components/signing/views/ApprovalView.tsx`
- `src/components/signing/views/BatchCallsView.tsx`
- `src/components/signing/views/PermitSignView.tsx`
- `src/hooks/use-dapp-signing.ts (364, 413-415)`

**Integration notes**: 移植成本最低、安全收益最高的起点：detect/rewrite/enforce 已是刻意的纯函数（keccak/abi 编码依赖注入自 vela-core）。抽取后 web(wasm) 与 native(uniffi) 共享同一 canon，消除 TS/Hermes 双实现漂移。现状『unbounded 必须有限选择』门控散在 3 处组件（SigningSheet.confirmDisabled + EditableApproveCard useMemo + BatchCallsView.legNeedsChoice），收进 Model 派生字段后单点真相。approval-guard.test + e2e approval-guard.spec（US 5.3）是现成回归网。作为 sign_request 的子模块或独立机均可——建议独立（clear-signing 画廊与批量视图也消费它）。

---

### clear_signing (P1)

**Scope**: 清晰签名解析与风险评估管线：eth_sendTransaction/typedData 的五级解码 fallback（本地描述符→合约专属 ERC-7730→ERC-165 判型→ERC fallback→4-byte best-effort→盲签）、风险分级（safe/normal/caution/danger）、personal_sign hex/文本分类、SIWE 域绑定钓鱼检测、危险视图分派序（eth_sign 硬警告等）。

**Model**: Model = { resolving: bool, result: Option<ClearSignResult{intent, fields, risk, verified, partial, best_effort}>, descriptor_cache, token_standard_cache(只存确定性判定), decimals_cache, message: Option<{is_hex, decoded_text|binary_preview, non_printable, siwe: Option<SiweFields>, binding: Ok|Mismatch|Unknown, danger_class: Plain|SiweOk|SiwePhish|OpaqueHash|EthSign}> }。超时（3s ERC-165 / 4s decimals / descriptor）建模为显式 Timeout 事件。

**Events**: ResolveRequested{tx|typed_data, chain_id}, DescriptorFetched{path, json|null}, SelectorCandidates{sigs}, Erc165Answer{is721, is1155 ∈ {true,false,null}}, DecimalsAnswer{addr, d|null}, Timeout{kind}, MessagePresented{payload, request_origin}(纯派生)

**Operations**: HttpGet{descriptor_url}, RpcEthCall{chain_id, to, data}, SelectorDbLookup{sel}, Timer, Now(过期判定)

**Invariants**: ①绝不对未知 token 静默假设 18 位小数——查链失败则 18+unverified 显式旗标（clear-signing.ts:362-363）②ERC-165 只缓存确定性结论，RPC 不可达≠不支持（:186-201）③partial/unverified/expired 时风险下限 caution 绝不读作 safe（:1266-1270）；任何 warning 字段→danger④0 字段解出宁盲签不给半真相（:587-590）；共享 selector(approve/transferFrom) 必须判型后再渲染（:164-171）⑤SIWE domain 必须裸 authority——含 userinfo/path/scheme 的伪装直接判非 SIWE（siwe.ts:45）；CRLF 归一防锚点绕过（:33-36）；origin 不可解析→unknown 绝不假匹配（:88-92）；检测必须用请求自己的 dApp 身份（F3）⑥显示路径与签名路径必须用同一 isHexPayload 谓词（decode-sign-message.ts:33-66）；非 hex payload 按 UTF-8 签名（use-dapp-signing.ts:180-193）⑦eth_sign 绝不以平静的消息视图呈现（SigningSheet.tsx:465-470）；描述符解析期间绝不先闪盲签视图（:441-447）；授权检测优先于描述符（:426）⑧模拟不对称信任：SENT 可信、RECEIVED 仅可信集显示金额；重放模式用签名时刻持久化的 replaySim 绝不重算（SigningSheet.tsx:68-93, 407-415; dapp-connection.tsx:642, 742）

**Sources**:

- `src/services/clear-signing.ts`
- `src/services/siwe.ts`
- `src/services/decode-sign-message.ts`
- `src/services/local-descriptors.ts`
- `src/services/selector-registry.ts`
- `src/components/signing/SigningSheet.tsx (114-306, 407-487)`
- `src/components/signing/views/MessageSignView.tsx`
- `src/screens/settings/ClearSigningTestScreen.tsx (验收硬件)`

**Integration notes**: siwe.ts/decode-sign-message.ts 已是纯模块，机械翻译；收敛时先裁定 canon——SigningSheet 的 haptic effect 与 MessageSignView 各算一遍 siwePhish，nonPrintable 还有 ASCII/Unicode 两套并存。decodeCalldata 的 Rust 实现已在 vela-core（abi-decode.ts 是冻结 oracle）。三个模块级缓存的生命周期需显式决策（per-request Model 丢缓存 vs 进程级单例）。clear-signing.spec（17 场景）+ parallel-clear-signing.spec 双层 e2e 覆盖，fixture 从 screens/settings/clear-signing-scenarios 移为 core 共享向量。ClearSigningTestScreen 证明单一渲染路径，迁移后可直接注入 Model 快照做验收。

---

### tx_tracker (P1)

**Scope**: 提交后交易生命周期/对账机：统一 waitForReceipt（safe-transaction）、tx-reconciler、TransactionReceipt 组件自轮询三个并行轮询者的节流/退避/终局判定，含 dapp 签名的 pending 恢复扫描。终局分类：confirmed / dropped / rejected / fee-hold / unreachable-unknown / accepted-not-landed。

**Model**: Model = { entries: Map<user_op_hash, {chain_id, record_ids: Vec, status: Pending|FeeHeld|Confirmed{tx_hash}|Failed|Rejected|Unknown, submitted_at, last_receipt_poll, last_status_poll}>, throttle: {per_hash_receipt: 3s, status: 12s, reconcile: 12s}, deadlines: {wait: 120s, abandon: 24h} }

**Events**: Submitted{user_op_hash, record_ids, chain_id}, Tick, ReceiptResult{tx_hash?, failed?, unreachable?}, StatusResult{queued|rejected|…, stage}, AppResumed/HomeFocused, RecordsLoaded, Abort

**Operations**: PollReceiptRPC(eth_getUserOperationReceipt), PollStatusRPC(eth_getUserOperationStatus), LoadPendingTxs, UpdateTxRecords{ids, patch}, Timer, Now, NotifyConfirmed(触发 token_trust 的 ReceiptLogsConfirmed)

**Invariants**: ①超时/不可达绝不判定失败——op 可能仍落地，误标 failed 诱导重发→双花（safe-transaction.ts:2185-2332; useSendController.ts:1000-1004）②fee-hold 保持 pending 仅换措辞，relay 排队中（safe-transaction 的 UserOpFeeHoldError; useSendController.ts:1051-1058）③rejected/确定性 drop/revert 才置 failed 且立即终止（waitForReceipt 分类; tx-reconciler.ts:205-252）④>24h 停止轮询但保持 pending——诚实的 unknown 而非误标失败（tx-reconciler.ts:16-23, 29-36）⑤同一 hash 多消费者共享 3s 节流请求，绝不加倍打 bundler（safe-transaction.ts:2237-2240; tx-reconciler.ts:117-197）⑥pending 记录必须跨应用重启存活并最终 resolve（dapp-connection.tsx:1029-1048 启动恢复扫描）⑦pending→confirmed 同 id 原地更新，绝不产生第二条（dapp-history.ts）⑧unreachable≠pending：诚实区分（net.ts 的 timeout/aborted/network 三分类）

**Sources**:

- `src/services/tx-reconciler.ts`
- `src/services/safe-transaction.ts (2185-2332)`
- `src/components/ui/TransactionReceipt.tsx (593-629)`
- `src/screens/wallet/useSendController.ts (1000-1070)`
- `src/models/dapp-connection.tsx (729-803, 1029-1048)`
- `src/services/storage.ts (437-533)`
- `src/services/net.ts`

**Integration notes**: 终局判定现靠 Error 子类 + message 正则（/dropped from the network/、parseExistingUserOpHash）三处措辞漂移即出错（代码已有 wording-tolerant 注释自证）——迁移时改为 typed 结局枚举，正则分类留 shell 结果映射层。同一状态机同时服务发送屏、回执组件、Home 对账与 dapp 签名。存储写锁（storage.ts withTxLock）在核单线程化后自然消失，但 shell 的 UpdateTxRecords 执行仍需保持原子批量。Safari 真机矩阵的 4 条资金安全不变量（不丢/不 false-decline/不 hang/不 double-resolve）在核内变成确定性单测。

---

### session (P2)

**Scope**: 钱包会话/账户真相源：账户列表、活跃索引、启动恢复与地址迁移、索引持久化门控、登出、路由守卫视图。所有资金流程（send/sign/balance）的上游。吸收 wallet-state.ts reducer + 2 个 effect + 6 个分散 dispatch 站点。

**Model**: Model = { accounts: Vec<Account{id, name, address, public_key_hex, credential_id}>, active_index, phase: Restoring|Empty|Active|SignedOut, 派生: has_wallet, address, allowed_routes }。computeAddress 纯函数进核，迁移判定整体入 update。

**Events**: Boot, StorageLoaded{accounts, saved_index}, StorageFailed, SwitchAccount{index}, AccountEstablished{account}(来自 create_wallet/login 机的 CompleteOnboarding 交接，统一 ADD_ACCOUNT/SET_WALLET 双入口), SignOut, SignOutConfirmed{has_pending_uploads}

**Operations**: LoadAccounts, LoadActiveIndex, SaveAccount(迁移回写), SaveActiveIndex, CheckPendingUploads, ClearWalletStorage(迫使 clearAll 死代码被显式决策), ClearExtensionCache, Render

**Invariants**: ①address 恒等于 accounts[active_index].address；越界 SWITCH 整体 no-op 绝不把 address 置空（wallet-state.ts:12-85, :69）②存储中 address≠computeAddress(publicKeyHex) 的账户绝不原样展示（资金流向错误 Safe）；单账户迁移失败保留旧地址不破坏存储、不阻塞其余账户（:112-141, 126-129）③savedIndex 越界钳制为 0；恢复失败必落 LOADED_EMPTY 绝不卡 isLoading④加载窗口期间绝不持久化索引（初始 0 会覆盖用户保存值, :144-148）⑤存在未同步 pending upload 时绝不无警告登出（SettingsScreen.tsx:1416-1426, 1613-1646; storage.ts:101-104）⑥ADD_ACCOUNT 后新账户必须激活⑦切换器 dispatch 原始 index 而非显示位置（accounts.ts:21-40; AccountSwitcherModal.tsx:76-90）⑧无钱包时不停留在资金操作界面；isLoading 期间不做跳转判定（src/app/index.tsx:9-21）

**Sources**:

- `src/models/wallet-state.ts`
- `src/services/storage.ts (49-79, 565-569)`
- `src/services/accounts.ts`
- `src/app/index.tsx`
- `src/app/_layout.tsx (103, 153-230)`
- `src/screens/settings/SettingsScreen.tsx (1416-1426, 1613-1646)`
- `src/components/ui/AccountSwitcherModal.tsx`

**Integration notes**: web shell 直接复用 spec 011 的 effect-loop/json-wasm-shell；但 session 是常驻状态而现有范式 core 生命周期=屏幕生命周期（Bridge 随 unmount free）——需要 app 级常驻 core 实例，是范式的首次扩展。大量组件同步读 useWallet().activeAccount，JSON 边界后变异步 view 推送，§12.1.6『先切账户再放批准面』（现靠 setTimeout(0) 兜底, web-request.tsx:207）是最易回归点，须在 sign_request 机内显式建序。AccountSwitcherModal 的 onSwitch 同步携带新账户对象的约定会断，改事件链。登出语义（clearAll 死代码）先过产品决策。深链路由无守卫（/(tabs)/wallet 裸露）——守卫收进 view 模型会改变 web 直开深链行为，逐路由回归。

---

### balance_dashboard (P2)

**Scope**: 余额聚合与展示策略机（per 活跃账户）：max(live,cached) 不欠显规则、多链流式合并、partial 检测与 3 步递增退避静默重试、notice 门控、缓存写入门槛（仅完整结果）、stale-account 竞态丢弃、骨架 vs $0 区分、失败链/限流链分类快照、余额隐私开关、刷新节奏编排、账户切换器余额。

**Model**: Model = { address, tokens_by_chain: Map<chain_id, Vec<Token>>, failed_chain_ids, rate_limited_chain_ids, cached_total: Option<f64>, bootstrapped, partial_retries_left(预算 3, 退避 [1500,4000,8000]ms), notice_allowed, refreshing, hidden(隐私), 派生: display_total, balance_partial, balance_unknown, unpriced_tokens }

**Events**: AccountChanged{address}, RefreshRequested{force}, ChainAssetsArrived{chain_id, tokens}, FetchSettled{tokens, failed_chain_ids, rate_limited_chain_ids}, CachedTotalLoaded{Option<usd>}, RetryTimerFired, PrivacyToggled, PrivacyHydrated{hidden}, AppFocused/AppBackgrounded, FixChainResolved{chain_id}, SwitcherOpened

**Operations**: FetchChainAssets{address, chain_id, force}, ReadBalanceCache/WriteBalanceCache{address, usd}, StartTimer/CancelTimer, ReadKV/WriteKV{vela.balanceHidden}, Render

**Invariants**: ①绝不显示『自信但偏小』的数字——partial 时取 max(live, cached)（useHomeController.ts:167-188）②绝不显示假 $0 后跳变真值——未知即骨架（:186-188）③常规抖动绝不立刻提示『仍在更新』——3 次静默重试耗尽才 notice（:46-54, 83-91, 350-366）④刷新中途总额绝不掉零——慢链保持上次值（:318-335; wallet-api.ts:167-220 每链 18s cap）⑤旧账户慢请求绝不画进新账户（7 处 addressRef 检查 :273-369 → Model 带 address 后按构造丢弃）⑥缓存只允许存完整总额——partial 落盘毒化 max 兜底（:340-348; balance-cache.ts:1-74, 24h TTL）⑦限流链自愈，绝不弹『换 RPC』横幅，余额安静回落缓存值（rpc-pool.ts:156-185; HomeScreen.tsx:133-139）⑧隐私威胁模型是递手机：隐藏后重启绝不恢复可见；所有金额面同时遮蔽含收款 toast 抑制与 fiat 不传（use-balance-privacy.ts:25-40; HomeScreen.tsx:176-180, 248-250）；hydrate 竞态用户操作赢⑨手动 pull 必须 forceRefresh 绕过 TTL（wallet-api.ts:55-133）；后台/非激活绝不轮询（:373-395）⑩切换器打开瞬间必须有数字——缓存先画（:451-479）

**Sources**:

- `src/screens/wallet/useHomeController.ts`
- `src/screens/wallet/HomeScreen.tsx (95-139, 264-278)`
- `src/services/balance-cache.ts`
- `src/services/wallet-api.ts (55-220)`
- `src/hooks/use-balance-privacy.ts`
- `src/services/rpc-pool.ts (156-185)`

**Integration notes**: 每个 ShellResult 必须带 address/generation 标签——漏一处即把 A 账户余额画进 B 账户。wallet-api 的 tokenCache 被 tx-simulation/activity/切换器跨域共用：建议 Core 拥有失效决策、shell 缓存仅作执行层 memo，所有消费者同批切换否则 split-brain。displayTotal 全程 f64 的数值保真需先定谱（见 open_questions）。10min 聚合轮询/骨架关闭时机等变 Timer op + AppFocused 事件。原生币定价的最深池/理智带策略（wallet-api.ts:289-427, X Layer WOKB 案例）与 DEX/Chainlink 偏差规则建议随本机进核（无单测的资金显示规则）。

---

### display_currency (P2)

**Scope**: 显示货币机：code+rate 原子提交、首启地区种子、用户选择优先、汇率来源链（Chainlink→FX endpoint→1）与『何时允许兜 1』的语义分叉。合并报告 1 的 money display 与报告 6 的种子规则。

**Model**: Model = { committed_pair: {code, rate}(原子), stored_code: Option, seed_state: NotSeeded|SeedPending{candidate}|Committed|UserChosen, supported_codes }

**Events**: Hydrated{stored_code: Option}, DeviceLocaleRead{currency_code: Option}, RateResolved{code, Option<rate>}, UserChoseCurrency{code}, FocusRefresh, FxCodesLoaded

**Operations**: ReadKV/WriteKV{vela.displayCurrency}, ReadDeviceLocale(capability), FetchChainlinkRate{code}, FetchFxRates, Render

**Invariants**: ①绝不把已存 code 与 rate=1 默认值配对渲染（¥12 vs ¥1,860 错量级, use-display-currency.ts:20-42; currency.ts:113-201）②首启种子只在真实汇率解析成功后才持久化（currency.ts:128-152）③用户显式选择绝不被异步种子覆盖（:146-150，提交前 re-read 的竞态窗口在核内消失）④key 缺失恒等于『从未选择』⑤display 路径可兜 1，种子/支持性判定绝不把『取不到』当 1（resolveRate vs getRate 分离, currency.ts:178-201）⑥缓存换 endpoint 必须失效（fiat-fx.ts:57-108 按 URL 键控）⑦批量导入的 per-batch 货币覆盖绝不改写全局（issue #80, currency-picker-scope.test）

**Sources**:

- `src/services/currency.ts`
- `src/hooks/use-display-currency.ts`
- `src/services/fiat-fx.ts`
- `src/services/fiat-rates.ts`
- `src/services/currency-catalog.ts`
- `src/screens/settings/SettingsScreen.tsx (1382-1397)`

**Integration notes**: 小而规则密集，三方竞态（hydrate vs seed vs user pick）在核内可穷举测试。每个显示金额的屏消费同一 view model，替代模块级 _committed + focus 轮询拾取。汇率数值格式化（formatFiat 零小数货币、10 万去分位）留 shell locale 层，核只输出 {code, rate} 与结构化金额。currency-picker-scope.test 的源码 grep 需重写为核规则测试。

---

### token_trust (P2)

**Scope**: token 信任模型统一机（反诈骗安全核心）：收款扫描的 transfer allowlist 与日志真实性校验、token 自动上架准入（只信真实回执 log）、模拟结果的不对称信任集。三者现分散在 transfer-monitor / token-autoadd / tx-simulation 互相隐式引用（getCachedHeldTokens），是同一个安全模型。

**Model**: Model = { transfer_allowlist: 链上 stables + 用户自加 token + EIP-7708 native 哨兵, trusted_receive_set: held ∪ known ∪ registry, auto_add_policy: 净入账 ∧ ¬已列 ∧ ¬已持 ∧ ¬known ∧ symbol 可解析, scan_config: {窗口 100 块, ≤2 次 getLogs} }

**Events**: LogsReceived{raw_logs, chain_id}, ReceiptLogsConfirmed{from, chain_id, logs}(来自 tx_tracker，唯一 auto-add 入口), SimDeltasComputed{deltas}(不可信来源), MetadataResolved{chain_id, addrs}, CustomTokensLoaded, HeldTokensSnapshot

**Operations**: RpcGetLogs/BlockNumber/GetBlockByNumber, MulticallErc20Meta, ReadCustomTokens/WriteCustomToken, InvalidateTokenCache, Render(判定结果供 feed/模拟预览消费)

**Invariants**: ①池中恶意/缓存端点绝不能伪造『已收款』——不信 RPC 的 topic 过滤，逐条本地复核 topics[2] 确为本钱包（transfer-monitor.ts:136-168）②spam 空投绝不进 feed——getLogs 限定可信合约 allowlist（:188-221）③元数据解析不了的 ERC-20 绝不落盘（18-decimals 兜底会把 6-decimals 稳定币记成 '+0 tokens'）④单次 poll 最多两次 getLogs（探测+一次 cap 重试），绝不 fan-out 触发限流（:96-118）⑤自动上架的数据源绝不能是 sign-time 模拟 log——攻击者可伪造 Transfer 事件把骗子币种进钱包，进而毒化 simulation 信任与 transfer allowlist 级联（token-autoadd.ts:5-14 明文警告, 32-86）⑥模拟不对称信任：SENT 不可被低估可信显示，RECEIVED 仅 trusted set 内渲染金额否则 unverified（tx-simulation.ts:206-286）⑦unknown 一律 null（没信息）绝不是 false（会失败）⑧symbol 解析不出的 token 绝不上架；同 `${chainId}_${addr}` 绝不重复保存；上架后必须失效 fetchTokens 缓存（token-autoadd.ts:81）

**Sources**:

- `src/services/transfer-monitor.ts`
- `src/services/token-autoadd.ts`
- `src/services/tx-simulation.ts (206-286)`
- `src/services/activity.ts (392-421)`
- `src/services/wallet-api.ts (141-152 getCachedHeldTokens)`

**Integration notes**: held→trusted 的传导使 auto-add 污染会级联，故『log→transfer 接受判定』『token→列表准入判定』这两条必须进 Core 并配 property test（报告 1 风险条明确要求）。扫哪些链的决策（有余额的链, 新钱包默认 6 链, activity.ts:395-404）依赖 fetchTokens 缓存副作用——迁移时改为显式事件输入。与 balance_dashboard 的 tokenCache 所有权决策联动。

---

### network_admin (P2)

**Scope**: 网络与端点配置机：自定义网络添加向导（搜索→解析→11 合约+P256 兼容性门控→保存）、chainId 去重、每网络 RPC/Explorer 覆盖（含保存前 chainId 校验的现状缺口修复）、服务端点（数据/passkey 索引/bundler/汇率）身份健康检查、RPC Provider 密钥管理与逐链探测、变更后的池失效编排。

**Model**: Model = { builtin_chains(常量), custom_networks: Vec, overrides: Map<chain_id, NetworkConfig>, add_wizard: Idle|Searching{query}|Suggested|Resolving{chain_id}|Resolved{chain_info}|Checking|Checked{CompatibilityResult}|Saving|Error{kind}, service_endpoints + per-field health: Checking|Ok|NotHttps|Unreachable|InvalidResponse, provider_keys + per-provider probe 结果 }

**Events**: SearchInput/SearchDebounced/SearchResults, ChainSelected, ChainInfoFetched, CompatibilityChecked, CustomRpcEdited, AddConfirmed, DeleteConfirmed, OverrideFieldEdited/OverrideBlurred, OverrideProbeResult{url, reported_chain_id}, EndpointEdited/EndpointBlurred/EndpointHealthResult, ResetEndpointsToDefaults, ProviderKeyEdited/ProviderProbeResult

**Operations**: HttpGet(chain-registry: /chains/eip155-{id}.json, fuse-chains.json), JsonRpcPost(eth_chainId 探测, eth_getCode×11, P256 eth_call, 并行竞速), KvRead/KvWrite(vela.customNetworks / vela.networkConfig / vela.serviceEndpoints / vela.rpcProviders), Timer(300ms 防抖), PoolInvalidate{chain_id|all}, Now

**Invariants**: ①同一 chainId 绝不添加两次——现状已发散：AddNetworkModal 有查重（SettingsScreen.tsx:620-626）而 services/add-network.ts:42-53（扫码路径）没有，Core 单实现收编②11 个必需 Safe/4337 合约 + RIP-7212 未全就绪的链绝不入库——否则用户存入后无法签名转出=资金被困（network-checker.ts:20-112; SettingsScreen.tsx:650）③RPC 全挂只能判『无法验证』绝不判『不兼容』（rpcFailed 导向 Retry, SettingsScreen.tsx:813-827）④override 保存前必须 probe eth_chainId 匹配——现状缺口：probeRpcChainId 存在却未被调用，错链 URL 以最高 tier 进池静默污染余额（SettingsScreen.tsx:178-328）⑤保存 RPC/Explorer 绝不清掉既有 bundlerURL（:204-211）；端点变更后旧池缓存绝不继续生效（:288-308）⑥服务端点强制 HTTPS（localhost 例外）、/api/health 身份必须匹配 SERVICE_IDENTITY——passkey 索引指错服务是登录安全问题（:340-379）；URL trim+去 CR/LF 防 header 注入（:453-460）⑦provider 探测必须 reported===target chainId（rpc-providers.ts:78）；清空 key 彻底移除；key 变更→池失效（storage.ts:298-340）⑧精确 chainId 搜索命中排第一（chain-registry.ts:84-176）；含密钥占位符的 RPC URL 绝不进候选⑨安全上下文中未知链绝不显示回退 explorer 链接（network.ts:70-78）

**Sources**:

- `src/screens/settings/SettingsScreen.tsx (93-516, 570-853)`
- `src/services/add-network.ts`
- `src/services/network-checker.ts`
- `src/services/chain-registry.ts`
- `src/models/network.ts`
- `src/screens/settings/RpcProvidersModal.tsx`
- `src/services/rpc-providers.ts`
- `src/services/storage.ts (218-340)`

**Integration notes**: 四处相似不一致的 eth_chainId 探测实现（checkEndpointHealth/checkServiceEndpointHealth/network-checker/probeRpcChainId，超时 6s/8s/10s 各异）在 Core 统一为一个探测决策词汇。健康检查现不 gate 保存（invalid_response 只是徽章）——是否改为 gate 属行为变更，需产品确认。network.ts 的响应式快照 store 是 Model+Render 最直接映射对象，但与 storage/rpc-pool 的 globalThis 单例互引，需整组切换。密钥明文存 AsyncStorage（storage.ts:289-297 自认）留 shell 但记安全债。REQUIRED_CONTRACTS 与 safe-address.ts 常量双手抄表需先定 canon。

---

### rpc_pool (P2)

**Scope**: RPC/Bundler 端点池决策核：六层来源优先级评分、EMA 延迟罚分、指数冷却、临时 1h/永久 24h 封禁、错误四分类（permanent auth / transient / rate-limit / getLogs range-cap）、3 轮全池扫荡+抖动退避、链级失败定性（failed vs rate-limited）、全封自救。shell 保留 fetch 执行。

**Model**: Model = { per_chain: Map<chain_id, Vec<EndpointStats{url, source_tier, ema_latency, consecutive_failures, last_failure_at, banned}>>, ban_map: {url→{banned_at, permanent}}(持久化), failed_chains / rate_limited_chains, pool_ttl(10min), attempt 计数 }。SOURCE_PRIORITY: user 10000 > provider 9000 > default 1000 > public 500 > builtin 100 > fallback 10；冷却 30s·2^(n-1) 封顶 300s。

**Events**: CallRequested{chain_id, method, kind: rpc|bundler}, PoolConfigLoaded, EndpointSucceeded{url, latency_ms}, EndpointFailed{url, class: HttpBan(status)|RateLimit|Timeout|Network|NonJson|RangeCap}, BackoffElapsed{attempt}, ChainIdProbed{url, reported}, BansLoaded, InvalidateAll/RefreshChain

**Operations**: JsonRpcPost{url, method, params, headers(X-Rpc-Url), timeout_ms}(shell fetch, 回送状态码+body), Timer(退避), KvRead/KvWrite(vela.rpc.banned), Now, Random(jitter, 注入)

**Invariants**: ①banned 端点绝不被选中（score=-Infinity, rpc-pool.ts:396-423）②报告错误 chainId 的端点绝不通过 X-Rpc-Url 交给 bundler（:673-681）③account-info/sponsor 必须解析到与提交 UserOp 相同的 bundler——否则 Tempo gas 报销打到错误 EOA 被拒（:957-974）④rate-limit 是自愈的瞬时故障，绝不为它向用户弹『换 RPC』横幅（:576-630; 分类被 parallel-rate-limit.spec 钉死）⑤getLogs range-cap 是请求级问题交调用方分片，不 failover 不封禁（:484-519）⑥全封禁自动清空恢复（:745-755）⑦永久封禁条件：0 成功且 ≥6 失败, 24h TTL（:58-185）⑧封禁概念现存两处真值（EndpointStats.banned vs banMap 生命周期不同步）——建模时合一

**Sources**:

- `src/services/rpc-pool.ts (26-1035 全文)`
- `src/services/net.ts (23-52 超时表, 163-176 退避)`
- `src/services/readonly-rpc-gate.ts (留 shell, 见 not_migrating)`

**Integration notes**: 决策与执行现完全交织在 1035 行内（内联 Date.now/Math.random/console），Time/Random capability 化后退避与封禁策略可穷举测试。dev fault-injection 钩子（poolRpcCall 头部）改为 Core 测试事件天然消除。console.log 打印含 query key 的完整 URL 需迁移前清理。getFailedRpcChains/getRateLimitedChains 两个全局 Set 被 balance_dashboard 与 bug-report 消费——改为 view 推送。建议作为 P2 首个落地（无 UI 重构成本、测试收益最大）。

---

### dapp_session (P2)

**Scope**: dApp 连接会话生命周期机：disconnected→connecting→pendingFingerprint(WalletPair 4 位指纹确认)→connected→reconnecting/error 的 FSM、多层定时器策略（4s grace 不续期、45s stuck、120s join、60s deadline、8s dropIfDead、指数退避 1s·2^n≤30s）、会话快照恢复与死通道清理、RemoteInject/WalletPair 互斥、连接入口输入分类。

**Model**: Model = { phase: Disconnected|Preparing|PendingFingerprint{fp}|Connecting|Connected|Reconnecting{grace_expired, stuck, attempt}|Error{msg}, connection_type: RemoteInject|WalletPair|None, session_ref(句柄 id, 不含密钥), dapp_info, chain_id, snapshot_present }。X25519 密钥/消息计数器/加密快照留 shell 的 WalletPairSession 对象。

**Events**: InputSubmitted{kind: WalletPairUri|RemoteInjectUrl|BrowserUrl|Invalid}(分类纯解析进核), FingerprintPrepared{fp}, FingerprintConfirmed/Cancelled, TransportConnected/Disconnected/Reconnecting, TransportError{msg}, TimerFired{grace|stuck|join_timeout|wp_deadline|drop_if_dead|backoff}, ManualReconnect, DisconnectRequested, RestoreLoaded{remote_inject?|wallet_pair?|none}, AppForegrounded{backgrounded_ms}, NetworkOnline

**Operations**: TransportOp{Connect|Disconnect|Reconnect|PushWalletInfo}(shell 持有 transport 实例), KvOp{save|load|delete}(vela.remoteInjectSession / vela.walletpairSession), TimerOp{start(id,ms)|cancel(id)}, Render

**Invariants**: ①指纹未经用户确认绝不建立会话——配对即授权（dapp-connection.tsx:203-224; walletpair-protocol.ts:694-697）②取消/替换 pending 配对必须释放临时 X25519 密钥（dapp-connection.tsx:461-474, 563-572）③重复 blip 不得延长 grace 窗口（:439 early-return）；手动重连绕过 grace 立即反馈④reconnecting 不允许无限旋转——45s/60s 双保险（:56-64, 221-242; walletpair-transport.ts:360-375）⑤死通道快照必须清除，否则每次启动 restore-loop 且与新配对在 relay 碰撞（BUG-5/6, :963-1027, 8s dropIfDead）⑥RemoteInject 优先于 WalletPair（互斥单会话）；恢复失败静默清理⑦WalletPair 计数器可持久化之前绝不产出该 nonce 的密文；receiveSequence 严格递增拒重放（walletpair-protocol.ts:372-437, 404, 418——留 shell 执行但 effect 顺序在 Command 序列显式表达）⑧明文 chainId 与加密 CAIP-2 上下文不一致必须拒绝（walletpair-transport.ts:65-81）⑨判别顺序不可颠倒：remote-inject 链接先于浏览器 fallback（dapp-transport.ts:262-334; ARCHITECTURE §7）

**Sources**:

- `src/models/dapp-connection.tsx (54-620, 963-1027)`
- `src/services/walletpair-transport.ts`
- `src/services/walletpair-protocol.ts`
- `src/services/dapp-transport.ts (262-334)`
- `src/screens/connect/ConnectScreen.tsx (46-79)`

**Integration notes**: 定时器密度全仓库最高，每条 timer 微语义（grace 不续期等）建议各配一条 Rust 单测防迁移漂移。transport 实例是活对象——core 只持 transportId 句柄。web/native 分叉（AppState vs online/visibilitychange）是 shell 事件源差异，core 不感知，但 e2e 需双平台跑恢复路径。会话无 TTL 属现状（被动过期），引入显式过期是行为变更（见 open_questions）。/parallel 空间复用生产 ConnectScreen，迁移期两套实现并存时 parallel e2e 必须对两套都跑。

---

### dapp_permissions (P2)

**Scope**: 每源授权 + 浏览器 consent 机：grant 存取与解析（resolveGranted/shouldDropGrant）、consent 队列（同源合并/异源拒绝）、settle-on-navigation（4900 结算）、不安全源封锁、iframe 拒绝、accountsChanged 泄露防护。收敛 in-app browser / web popup / extension 三入口的授权编排漂移。

**Model**: Model = { grants: Map<origin, {address, chain_id, granted_at}>(KV 为真源的镜像), pending_consent: Option<{origin, coalesced_requests: Vec<{id, method}>}>, current_origin, connected_addr: Option, wallet_addresses: Option<Vec> }

**Events**: ProviderRequest{id, method, params, origin, is_main_frame}, GrantLoaded{origin, grant?}, ConsentApproved/ConsentRejected, NavigationStarted{url, new_origin?}, BrowserClosed, AccountsUpdated{addresses}, AccountSwitched{address}, RevokeRequested{origin}

**Operations**: Respond{id, result?|error{code,msg}}(经 bridge), EmitEvent{accountsChanged|chainChanged|disconnect}, KvOp(vela.perm.<origin>), SaveConnectionRecord, ForwardToSigning{...}(交 sign_request), Render(consent sheet)

**Invariants**: ①跨源 iframe 永远拿不到账户（wallet-browser-router.ts:135-166）②冷/空账户读绝不掉 grant——一次瞬态空态会把用户从所有 dApp 登出（dapp-permissions.ts:17-78, 注释明言 load-bearing）③公网 http 源上的签名/转账方法必拒 4100——IP 必须完整锚定，10.0.0.1.evil.com 不豁免（wallet-browser-router.ts:78-118）④同源重复 connect 合并进已开 sheet、异源第二个 4001（browser.tsx:110-129）⑤导航结算必须用 4900 绝不用 4001——dApp 视 4001 为可安全重试，已落地请求会被双花（browser.tsx:313-360, NAV_SETTLE_ERROR）⑥approve 的 await 期间发生导航，绝不 respond 或向新 origin 推 accountsChanged（:245-248）⑦地址绝不泄露给未连接的 origin；未连接时切账户不 emit（:193-196 区域）⑧eth_accounts 永不弹窗——反映授权状态⑨grant 钉在被授予地址而非 activeAccount⑩每个请求 id 恰好一个响应（幂等 gate 留 shell WebViewTransport）

**Sources**:

- `src/services/dapp-permissions.ts`
- `src/services/wallet-browser-router.ts`
- `src/app/browser.tsx (51-360)`
- `src/app/web-request.tsx (57-250)`
- `src/services/webview-transport.ts (49-133)`
- `src/services/readonly-rpc-gate.ts`

**Integration notes**: 决策已纯化（wallet-browser-router 可单测），队列的 useState+consentRef 锁步 hack 存在正因为 React state 异步——Crux 同步 update 原生消除。grant 检查编排现在 browser.tsx / web-request.tsx / extension background 三处各一份（纯函数共享但编排不共享），单核收敛是价值点也是迁移期最易不一致处。SUPPORTED_METHODS/SIGNING_METHODS/isSigningMethod/buildSigningRecord 四处方法集需人工同步——收进核后单点。grant 无过期（grantedAt 从不参与判断）属现状，见 open_questions。

---

### contacts (P2)

**Scope**: 地址簿机：manual saved + 从 send 历史派生的 auto 两层合并、删除墓碑与复活规则、分组级联/归一化、existing-wins 导入导出、发送界面防地址投毒的信任信号（getSavedContact）与收款人风险分类（首次交互/合约识别）。

**Model**: Model = { saved: Vec<Contact>, tombstones: Map<addr, dismissed_at>, groups: Vec<Group{id 确定性生成, members}>, 派生: merged = saved ⊕ history-derived(墓碑抑制, lastUsed>dismissedAt 解除) }

**Events**: Save{input}, Delete{addr}, ToggleFavorite{addr}, GroupSave/GroupDelete/SetMembers, ImportParsed{contacts, groups}, HistoryLoaded{sends}, StoreLoaded, AccountSwitched(替代隐式 clearContactsCache)

**Operations**: ReadStore/WriteStore(vela.contacts / .dismissed / vela.contactGroups), LoadSendHistory, ResolveIdentity{addr}, ClassifyRecipient{chain_id, addr}(eth_getCode), Render

**Invariants**: ①dApp 合约调用地址（dapp_tx）绝不自动进入地址簿——防路由/代币合约地址污染信任信号（contacts.ts:61-317, auto 只来自 type:'send'）②已删除建议在无新交互时绝不复活；重新保存清墓碑③分组成员绝不悬垂/重复/非法地址；删联系人级联移出所有分组（:362-416）④并发写绝不互相覆盖——现靠 _writeChain 串行化，核单线程后自然消失⑤导入 existing-wins：绝不修改任何既有联系人或其既有分组关系；非法地址计 invalid 不入库；文件内重复地址取首个（contact-io.ts:117-245）⑥小写地址为规范键；分组 id 确定性生成不依赖时钟/随机⑦EIP-7702 委托 EOA（0xef0100+addr, 23 字节）绝不标 Contract（recipient-risk.ts:42-49）；unknown/不可达→null 绝不误报；只缓存正向身份解析（recipient-identity.ts:232-267）

**Sources**:

- `src/services/contacts.ts`
- `src/services/contact-io.ts`
- `src/components/contacts/ContactsManager.tsx`
- `src/components/contacts/RecipientTrust.tsx`
- `src/services/recipient-risk.ts`
- `src/services/recipient-identity.ts`

**Integration notes**: 规则已相对纯净（service 层），迁移成本低；收益是消灭写锁与隐式缓存失效两个易碎点——漏掉 AccountSwitched 事件会跨账户串簿。RecipientTrust 组件的『绿勾=保存∧星标』信任语义随 view model 收进核。收款人风险/身份解析同时服务 send 与 feed，归本机后以 view 供两者消费。use-recipient-identity 的模块级 memo/inflight 合并降为 shell 执行 memo。

---

### batch_import (P2)

**Scope**: payroll 批量导入机：粘贴/文件表格解析（含金额列 shape 投票推断）、地址校验与去重、fiat→token 换算（显示汇率=应用汇率）、60 上限截断、超余额阻断，产出 RecipientDraft[] 播种 send 的 split 模式。

**Model**: Model = { unit: Fiat|Token, fiat_code, rate: {auto: Option<Decimal>, input: String, edited: bool, status: Loading|Ok|Failed}, rows: Vec<ParsedRow{name, address, raw_amount}>, 派生 preview: Vec<{valid, dup, token_amount, ok}>, cap=60, totals(基单位), over_balance }。表格解析: cell matrix + header roles + per-shape 金额列投票（recipient-table 三 pass）。

**Events**: Open{token, currency}(全量重置), SetUnit, SetFiatCode, SetRawText, FileParsed{rows|err}, RateFetched{rate|failed}, EditRate{text}, ResetRateToAuto, Apply

**Operations**: FetchUsdFiatRate{code}, PickFile+ParseWorkbook(SheetJS 留 shell, 文本路径纯核内), SaveTemplateFile, Render

**Invariants**: ①显示的 rate 字符串 IS 应用的 rate，显示与换算绝不分叉——历史缺陷：toFixed(2) 把 rate 镜像成 0 后一碰清零全表（BatchImportSheet.tsx 文件头 Rate invariant, 423-443）②正汇率绝不镜像成 "0"（formatRate :436-443）③重复地址跳过首个保留；>60 截断且 overCap 与 rejected 两条警告绝不互相遮蔽（:365-377）④合计基单位>余额 → apply 禁用；fiat 模式 rate≤0 不可 apply⑤每次打开全量重置——stale 粘贴/汇率绝不复用（:84-91）⑥名字绝不静默变成付款金额——带数字的名字(Alice123/团队2024/1e5)不当金额，空金额格报错不回落别列（recipient-table.ts:107-283, issue #137 两次回归）⑦2 列表的投票证据绝不给 3 列表用（shape 隔离）⑧贴进名字列的地址不能夺走付款（header 地址列优先）

**Sources**:

- `src/components/send/BatchImportSheet.tsx (67-154, 423-443)`
- `src/services/recipient-table.ts`
- `src/services/file-io.ts / file-io.web.ts (留 shell)`
- `src/components/ui/CurrencySheet.tsx`

**Integration notes**: 纯钱数学+校验，I/O 只有汇率拉取与文件解析两个词汇，自包含、适合早期落地验证范式。recipient-table.interpretRows 纯同步直接移植，现有 fixture 做 conformance。currency-picker-scope.test（per-batch 覆盖不写全局）grep 断言需重写。产出经 send 机的 SeedSplitRecipients 事件交接。

---

### payment_request (P3)

**Scope**: 收款与支付请求域统一机：EIP-681 URI/payLink 构建（request 模式）、/pay 落地页不可信 query 的 parse→validate→normalize、扫码载荷五岔分类路由（LockedSend/RecipientOnly/PairConnect/OpenBrowser/Invalid）、收款风险提示 acknowledge 门。三个入口（pay 链接、扫码、粘贴）收敛到同一 PayRequest 归一类型与校验路径。

**Model**: Model = { 构建侧: {recipient, asset{chain_id, token_address?, symbol, decimals}, amount_raw, token_catalog: LoadState, mode: Address|Request} → 派生 {eip681_uri, pay_link, qr_value(未构建完回退裸地址), copy_payload}; 解析侧: raw_query → Result<PayRequest{to, chain_id, token?, amount_base: Option<U256>, display_hints}, PayLinkError{InvalidRecipient|InvalidChain|MalformedAmount}>; 门: gate: Loading|Unacknowledged|Acknowledged(按 address 键控) }

**Events**: AssetPicked, AmountChanged, ModeChanged, TokenCatalogLoaded, CustomTokenAdded, RecipientChanged, LinkOpened{query}, QrModeChanged, OpenInVelaRequested, Scanned{payload, context: Home|SendTop|SendSplitRow}, AddressChanged, FlagLoaded, AcknowledgePressed

**Operations**: FetchTokens{include_zero_balance}, ClearTokenCache, Clipboard, Navigate{route, params}, OpenUrl(eip681 深链), KvRead/KvWrite(vela.receiveWarned.{address}), Render。核心为纯派生：buildEIP681/buildPayLink/sanitizeAmount/toBaseUnits 直译 Rust（U256 + 严格数字文法）

**Invariants**: ①token 请求 uint256 必须是按真实 decimals 换算的基单位整数——错一位=金额差 10 倍（ReceiveRequestControls.tsx:51-93; eip681.ts:48-54）②amount 小数位绝不超 token decimals，否则 toBaseUnits 静默截断生成与所见不符的请求（sanitizeAmount :39-45）；Rust 移植改为显式 Result 拒绝静默截断③request 模式复制给对方的必须是 payLink 而非裸 ethereum: URI（ReceiveScreen.tsx:156-163）④格式非法的 amount 绝不崩页或被静默误解析——已实测缺陷：'1e18'/'1,5' → BigInt SyntaxError 整页崩，'0x10' → 静默解析成 ≈7.5 万枚 token 预填锁定 Send（PayScreen.tsx:44-66）⑤display hint(dec/sym/net) 与实际编码值必须一致（dec 伪造检测）⑥带 chainId 的完整请求必须锁定链+token+金额进 Send；chainless 绝不臆测链；split 行内扫码绝不清空其他收款行（useHomeController.ts:507-534; SendScreen.tsx:179-205）⑦bigint 金额跨路由以十进制字符串无损传递⑧未确认风险提示者不得取得可分享收款载体——QR 遮罩/copy 无 onPress/save 禁用三处门控收敛为 view model 三个显式布尔；加载中(null)也盖遮罩；按账户隔离（ReceiveScreen.tsx:38-70, 223, 287-366）⑨includeZeroBalance 结果绝不污染主余额缓存（wallet-api.ts:98, 106）

**Sources**:

- `src/components/ReceiveRequestControls.tsx`
- `src/screens/wallet/ReceiveScreen.tsx`
- `src/screens/wallet/PayScreen.tsx`
- `src/services/eip681.ts`
- `src/screens/wallet/useHomeController.ts (507-534)`
- `src/screens/wallet/SendScreen.tsx (179-205)`
- `src/screens/wallet/useSendController.ts (57-92, 185-241)`

**Integration notes**: 扫码决策树双份实现已漂移（Home 侧含 pair/browser 分支、Send 侧含 pickerTarget 分支）——迁移前先统一语义，否则固化其中一份的缺口。payLinkBase() 读 window.location 藏在『纯』service 里——拆为 shell origin capability。eip681.ts 已有单测可平移为 Rust 单测。/pay 崩溃缺陷可立即修，不必等迁移。分享卡片预渲染（web 手势内同步 share 约束）整体留 shell，核只产 ShareCardModel。锁定请求落地部分属 send 机（LockResolved）。

---

### deposit_watcher (P3)

**Scope**: 收款页入账侦测轮询机：分相退避（前 1 分钟每 3s → 之后 60s → 5 分钟停）、余额基线 diff、部分链失败防误报。商户/收款人凭它判断『钱到了』，误报即资金风险。

**Model**: Model = { baseline: Option<HashMap<TokenId, f64>>, deposits: Vec<DepositEntry{token, delta, at_epoch}>, started_at, phase: Fast|Slow|Stopped, address }

**Events**: Started{address}, TimerFired, TokensFetched{Result<Vec<Token>>}, AppActiveChanged{bool}, Stopped

**Operations**: FetchTokens{force_refresh}, Timer{delay}, Now, Haptic{success}, Render(时间戳输出 epoch 由 shell 本地化)

**Invariants**: ①绝不因部分链拉取失败误报入账——结果集缩水（tokens.length < 基线长度）跳过比较只重排下轮（ReceiveScreen.tsx:107）②5 分钟后必须停止轮询（省电/防限流, :28-31）③基线只在首轮或确认增量后前移④后台非激活跳过本轮（isAppActive 门控）⑤隐含语义需先显式裁决：无变化不前移基线 → 转出后再入账可能被旧高基线吞掉——迁移前决定是 bug 还是特性并写入不变量测试（:93-154）

**Sources**:

- `src/screens/wallet/ReceiveScreen.tsx (27-31, 49-52, 93-154)`

**Integration notes**: 最典型的『决定 vs 执行』错位：整台状态机活在一个 useEffect 闭包里零测试。Crux 化后 fake clock + fixture 穷举『链失败缩水』『5 分钟截止』等路径。时间戳现硬编码 en-US locale（:130）——核输出 epoch，shell 按 locale 格式化，顺带修复。

---

### activity_feed (P3)

**Scope**: 活动流机：本地 tx store 为唯一事实源的加载/去重/批次折叠、日期分组、乐观删除墓碑、收款庆祝生命周期、对手方别名解析记忆化、chain filter。pending→confirmed 收敛政策属 tx_tracker，本机只消费。

**Model**: Model = { address, items: Vec<ActivityItem>(结构化金额: value+decimals+symbol, 非预格式化字符串), tx_index: Map<id, record>, initialized(首轮旗标), delete_tombstones: Set<id>, celebration: Option<{item_id, toast_deadline}>, alias_map + alias_attempted, chain_filter }

**Events**: StoreLoaded{items}, SyncCompleted{new_count}, ReconcileCompleted{resolved_count}(来自 tx_tracker), LiveTick/FocusTick, AliasResolved{addr, name}, DeleteRequested{id}, DeleteCommitted/DeleteFailed{id}, ToastExpired, ChainFilterChanged

**Operations**: ReadTxStore{address}, DeleteTxRecord{id}, ScanIncomingTransfers(经 token_trust 判定), ResolveRecipientIdentity{addr}, Timer(toast 2.8s, 10s 轮询), Haptic, Render

**Invariants**: ①同一 id 绝不渲染两行；共享 userOpHash 的多行折叠为一条 batch 行，先按 id 去重防重提交单笔误判成批次（activity.ts:428-478）②feed 绝不因后台刷新闪空——先画缓存，sync 仅 newCount>0 时重读（useHomeController.ts:259-316）③历史存量绝不触发『到账』庆祝——只庆祝首轮之后的会话内新增（initializedRef, :219-257）④隐私模式下收款 toast 绝不弹（HomeScreen.tsx:176-180）⑤已删事件绝不被并发重载复活——墓碑过滤是重载路径唯一 setter 的职责（:133-144, 577-610）⑥分组 header 绝不与 item 错序（dayStartMs 本地午夜键）⑦已尝试别名地址绝不重复打网络；本地账户名优先远端解析（:421-449）⑧稳定币无价格源按面额估值，绝不显示 $0.00（activity.ts:149-181）

**Sources**:

- `src/services/activity.ts`
- `src/screens/wallet/useHomeController.ts (111-144, 192-316, 421-449, 543-610)`
- `src/services/storage.ts (437-533)`
- `src/screens/wallet/HomeScreen.tsx (176-180, 244-250)`

**Integration notes**: 关键契约变更：ActivityItem 现存预格式化字符串，迫使 locale 变化整体重跑且庆祝逻辑靠字符串反解（useHomeController.ts:192-197, 225-227）——Crux 版必须携带结构化数值+格式化提示，shell 格式化，一并消除两个 hack。relativeTime/dayGroupLabel 需 shell 注入 now。依赖 token_trust（扫描判定）与 tx_tracker（收敛）。

---

### manage_tokens (P3)

**Scope**: 手动自定义 token 添加机：合约地址跨全网络并行探测 name/symbol/decimals、`${chainId}_${addr}` 去重、逐链保存、删除。（自动上架准入已归 token_trust；网络添加向导已归 network_admin——本机只保留 token 面板部分。）

**Model**: Model = { input_address, validity, detection: Map<chain_id, Option<TokenMeta>>, detect_in_flight, added_token_ids: Set, custom_tokens: Vec }

**Events**: AddressInput{s}, DetectRequested, ChainMetaResolved{chain_id, Option}, SaveRequested{chain_id}, SaveConfirmed/SaveFailed, DeleteRequested{id}

**Operations**: MulticallErc20Meta{chain_id, addr}, ReadCustomTokens/WriteCustomToken/RemoveCustomToken, InvalidateTokenCache{address}, Render

**Invariants**: ①同 `${chainId}_${addr}` 绝不重复添加——手动与自动路径的 dedupe 语义现各自实现一遍，收敛为一处（AddTokenPanel.tsx:65-218; token-autoadd.ts:32-86）②symbol 解析不出的 token 绝不上架（'?' 不入列表）③新增后必须失效 fetchTokens 缓存使选币器立刻可见（ReceiveRequestControls.tsx:63-73）

**Sources**:

- `src/components/ui/AddTokenPanel.tsx`
- `src/screens/wallet/AddTokenScreen.tsx`
- `src/services/token-metadata.ts`
- `src/services/tokens.ts`

**Integration notes**: AddTokenPanel 13 个 useState 收进 Model。token 准入决定钱包信任集（喂给 transfer allowlist 与 simulation 信任）——写入路径统一经 token_trust 的准入判定，本机只做表单/探测编排。

---

### browser_history (P3)

**Scope**: 浏览历史策略机：按 origin 去重（一站一条）、新访问置顶、cap 40、保留旧 title/favicon、删除/清空。

**Model**: Model = { entries: Vec<{origin, url, host, title, favicon, last_visited}> }(≤40, 新到旧)

**Events**: VisitRecorded{url, title?, favicon?, now_ms}, DeleteOrigin{origin}, ClearAll, Loaded{entries}

**Operations**: KvOp{get|set|remove}(vela.browserHistory), Render

**Invariants**: ①只记真实 web origin（解析失败丢弃）②每 origin 一条——读作『用过的 dApp』而非页面日志③更新时保留旧 title/favicon（favicon 晚于 title 解析）④上限 40⑤时间由外部注入（browser-history.ts:9-105 已如此设计）

**Sources**:

- `src/services/browser-history.ts`
- `src/app/browser.tsx (322-326)`

**Integration notes**: 规则已纯化且时间注入，迁移成本极低——适合作 KV capability 通路的练手/试点机，验证新增 app 的完整 diff 清单（报告 9 notes 有逐步手册），但业务价值低，排最后。

---

### ext_cache (P3)

**Scope**: Safari 扩展 App Group 账户快照 + Universal Link 认证 TTL 机：公开账户快照写入/清理门控、UL 14 天 TTL 与安全回退（过期回退 velawallet:// scheme——失败的 UL 会导航走 dApp 标签页丢失待签请求，文件注释标为 fund-safety）。

**Model**: Model = { last_snapshot: Option<投影后公开字段>, ul_verified_at: Option<epoch>, ttl=14d, loading_gate: bool }

**Events**: AccountsChanged{accounts, active, theme, locale}, Foregrounded{now}, UniversalLinkOpened{url, now}, SessionEnded, AttestationRead{ts}

**Operations**: WriteAppGroupFile{path, json}, RemoveAppGroupFile, ReadAttestation/PersistAttestation{ts}, RequestExtensionSign{rid}(UL 携带 rid 时)

**Invariants**: ①快照绝不携带敏感字段——强制重投影为 {name, address}（app-group-account-sync.ts:148）②isLoading 窗口绝不 clear——会永久删掉已登录用户的缓存（AccountFileWriter.tsx:70 注释）③UL 认证必须随 TTL 过期失效（关联可能静默失效, 14d）；TTL 判定现在两处重复 Date.now（app-group-account-sync.ts:66, 175）——核内合一④UL 正则锚定 apex host 防伪（AccountFileWriter.tsx:48）⑤chainId 用稳定默认值 1，绝不取易变的 dApp 桥 chainId⑥扩展缓存必须随登出清空（经 session 机的 ClearExtensionCache）

**Sources**:

- `src/services/app-group-account-sync.ts`
- `src/components/AccountFileWriter.tsx`

**Integration notes**: 纯 iOS 平台分叉天然属 shell（AppGroup.isSupportedSync 非 iOS no-op），核只做 TTL/门控/投影决策——教科书式 core-decides/shell-executes。与 session 机联动（SessionEnded 事件）。headless 组件的 latest-ref 快照模式被显式事件替代。

---

## Not migrating (stays in the shell)

## 明确留在 shell（TS/平台层）的状态与理由

### 一、纯渲染状态（Crux 原则：渲染域不进核）

- **主题偏好 auto/light/dark**（constants/color-scheme.ts:24-131）：token 重建 + Appearance/DOM 副作用 + 整树 remount，纯外观；web 分叉 use-color-scheme.web.ts。
- **字号缩放 6 级**（constants/text-scale.ts:15-136）：无业务不变量，Reanimated 手势吸附是纯 UI。
- **头像风格偏好**（services/avatar-style.ts:15-55）：纯外观；但其 version-guard 竞态规则（迟到读不 clobber 新选择）可作 display_currency 核化时的参照测例。
- **复制反馈计时**（use-copy-feedback.ts）、入场动画/hasEntered、网络 chip 选中态、modal/sheet 开合、reveal/expanded、SlideToConfirm 手势、FlowArrow/ConfirmAssets 折叠、toast 动画（ReceiveToast.tsx 纯 reanimated）——全部渲染态。注意：『复制什么』（payLink vs 裸地址）是业务规则进 payment_request，计时留 shell。
- **locale 数字/日期/时间格式化**（locale-format.ts, localePrefs）：显示层规则，核输出结构化值+格式化提示，14 个 locale 与 Intl 探测留 shell（spec 011 铁律：文案 key 而非文案本体）。

### 二、平台 I/O 适配（executor 词汇的执行端）

- **passkey 模块**（modules/passkey, native/web 双实现）、**App Group 桥**（modules/app-group）、**WebView 桥**（modules/webview）。
- **transport 实现**：webview-transport / web-popup-transport / extension-bridge-transport 的收发管道。特别地：WebViewTransport 的 pending-Set『每 id 恰一个响应』幂等 gate **必须保留在 shell**，不能因『core 已保证』而删（报告 4 风险条）。
- **WalletPair 加密状态**：X25519 密钥、ChaCha20 消息计数器、加密快照**不过 JSON 边界**——core 只建模 phase 与句柄；『计数器先落盘再产密文』的 effect 顺序在 Command 序列显式表达但由 shell 执行（walletpair-protocol.ts:404）。
- **file-io.ts / file-io.web.ts**（文件挑选/保存）、**SheetJS xlsx 解析**（懒加载，文本解析路径进核）、**share-card.ts**（web navigator.share 必须手势内同步调用——预合成 blob + 引用相等检查是 shell 专属编排，误迁入核的异步 Event 往返会直接破坏 iOS 分享）。
- **payLinkBase() 的 window.location 探测**（eip681.ts:169-178）：从『纯』service 拆出为 shell origin capability。
- **platform.ts**（剪贴板/haptics/showAlert）、expo-router 导航、AppState/online/visibilitychange 事件源、字体加载、qrcode/identicon/favicon/image-decode 绘制。
- **net.ts 超时表与 AbortController**：shell HTTP capability 配置；『可退避/可重试的决策』留核（Wait op），单次 I/O 超时留 shell（spec 011 既定分工）。

### 三、值得留在 TS 的（有明确理由）

- **QUARANTINED 冻结 oracle**：abi-decode.ts、abi.ts、attestation-parser.ts、safe-address.ts、eth-crypto.ts、webauthn-verify.ts、p256-recovery.ts——真实现已在 vela-core（spec 001），TS 版仅供 Hermes native 运行与 dump-vectors 语料提取，禁止新增调用方（no-restricted-imports 强制）。不动。
- **onboarding-core 五件套与 copy.ts 语义→i18n 映射**：已是范式本体，新 app 照搬其结构而非迁移它。tit
- **readonly-rpc-gate.ts**（6 并发 + 512 队列 + 同 key 合流）：调度类逻辑，两份报告均判可留 shell——它管的是执行并发而非业务决策；其不变量（结果不跨时间缓存、签名路径永不节流）由 shell 测试维持。
- **bundler 错误文案正则分类**（parseBundlerUnderfunded、/dropped from the network/、AA 码匹配）：留在 shell 的 operation 结果映射层，映射为 typed variant 进核——绝不把正则匹配搬进核（措辞已漂移过一次），长期方案是推动 relay 返回结构化错误码。
- **bug-report.ts**：已是低耦合干净 service（脱敏/指纹/同意先行），Crux 化收益低，原地保留。
- **deployer-api.ts 的 mock 部分**（地址派生、requestDeployment 明确标注 mock）：不迁移死代码；资金阈值表待功能真实化再议。
- **extension-sign-bus.ts**：模块级 rid 缓冲与 expo-router 导航时序强耦合，作为 shell 事件源向 sign_request 发事件（『冷启动 rid 先于控制器订阅必须缓冲』规则留 shell）。
- **模块级执行层缓存**（8s in-band 报价缓存、identity memo/inflight 合并、selector-registry 会话缓存）：定位为 shell 执行 memo；**失效决策**归核（如 ClearTokenCache 是核下发的 operation）——这是缓存所有权的统一裁决。
- **native 端 use-create-wallet.ts / use-onboarding-login.ts 双实现**：在 native 采纳策略（open_questions #1）决出前保留，按 spec 011 D10 纪律『先改 Rust 再同步 TS』。
- **treasury 余额/推荐资助额视图**（SettingsScreen TreasuryModal，dev-only）与**开发者 6 连击解锁**：dev 表面，不值得核化。
- **RPC provider 密钥明文存 AsyncStorage**（storage.ts:289-297 自认）：存储层留 shell，记安全债，不因 Crux 迁移而改变。

## Open questions

1. 【native 策略，P1 前置】Hermes 无 WebAssembly：vela-core-uniffi 未开 crux feature（Cargo.toml 确认），现有每台 web 机器在 native 都是 TS 手写副本（use-create-wallet.ts 等，靠注释纪律防漂移）。send/sign_request 这类 P1 资金机器动工前必须决定：uniffi/JSI 原生绑定采纳 vs 接受双实现漂移扩大——每抽一台机就多一份镜像。
2. 【登出语义悬空】LOGOUT 只清内存，storage.clearAll()（storage.ts:565）全仓库仅测试引用——冷启动自动恢复登录。这是有意设计（passkey 钱包可辩护）还是缺陷？session 机的 SignOut 事件语义无法定稿，需产品确认。
3. 【授权/会话无过期】dApp grant 的 grantedAt 从不参与判断（永久有效直到显式撤销）；WalletPair/RemoteInject 会话无 TTL（仅被动发现过期）。Crux 化是引入显式过期不变量的时机，但属行为变更，需产品确认。
4. 【bigint JSON 编码规范】费用/余额/授权额度全用 bigint，JSON.stringify 直接抛异常。需在 spec 定十进制字符串（StoredAssetSim 已示范）vs hex 的统一约定，含 u64→bigint 的 ts-rs 已知坑（shell.rs Wait{ms:u32} 注释）。
5. 【数值保真定谱】displayTotal/tokenUsdValue 全程 f64（parseFloat）：Rust 用 f64 复现会固化现有精度问题；换定点/BigDecimal 则 JSON 边界与 TS 展示出现 ±1 分钱级 diff。迁移 balance_dashboard 前先定谱。
6. 【/pay 已验证缺陷，建议立即修不等迁移】PayScreen.tsx:65-66 不可信 query 直喂 toBaseUnits：amount='1e18'/'1,5' → BigInt SyntaxError 整页崩溃（实测复现）；'0x10' → 静默解析为 ≈7.5 万枚 token 预填锁定 Send；dec/sym/net display hint 可被伪造使 headline 与编码值脱钩。
7. 【bindings/wasm 基建泛化】per-app Effect 词汇 vs 共享 ShellOperation union？gen-onboarding-types.mjs 输出目录硬编码 onboarding-core/generated 且整目录删重写——两个 app 共用一个目录或各自生成入口需先决定。wasm 1MB 硬门槛（build-web.mjs:42, 现 ~535KB）：迁移 send 这类大域前先量 serde 单态化增量。cancelled_effect_ids 通道现恒空（onboarding.rs:31-34）——sign_request 的取消需要 shell 真 abort，要扩展 Bridge，是范式未验证路径。
8. 【缓存所有权与 core 生命周期】现有范式 core 生命周期=屏幕生命周期（Bridge 随 unmount free），而 session/balance/rpc_pool 需要常驻状态；模块级缓存（tokenCache/nonce/deployed/descriptorCache/banMap）挪进 Model 会改变失效语义（per-request 丢缓存 vs 进程级单例）。需为『常驻 core 实例』扩展范式并逐缓存显式决策。
9. 【测试改造与迁移同 PR】3 个源码 grep jest（send-same-fee-token / send-tempo-gate / currency-picker-scope）在逻辑进 Rust 时立即红，必须同 PR 重写为 core 状态机测试+薄 shell 守卫；e2e 用屏上英文文案定位（无 testID），Render 输出文案须逐字节保持；Safari 真机矩阵（4 条资金安全不变量）不在 CI，签名总线迁移后需手动重跑 run_matrix.py；手写 INITIAL_VIEW 镜像会静默过期一帧（ts-rs 不保证默认值），是否加 gate？
10. 【与预期不符的文件/功能（分析员标注，无文件缺失）】① src/services/accounts.ts 不是账户 CRUD 服务而是切换器纯排序辅助——账户持久化在 storage.ts:49-79；② 全仓库无账户级 rename/delete 功能（联系人有，账户没有）——是功能缺口还是有意为之？③ ReceiveToast.tsx 是 Home 收款 toast（纯动画）而非发送回执——发送回执在 components/ui/TransactionReceipt.tsx；④ 仓库没有 WalletConnect SDK——'WalletPair' 是自研协议，spec 用词勿写 WalletConnect；⑤ deployer-api.ts 大半为标注 mock；⑥ network-checker 的 REQUIRED_CONTRACTS 与 safe-address.ts 合约常量是两份手抄表——哪份是 canon？⑦ dex-price-test.ts 文件名不匹配 jest testMatch，不在自动化覆盖内。
11. 【deposit watcher 隐含语义裁决】无变化不前移基线 → 转出后再入账可能被旧高基线吞掉；时间戳硬编码 en-US——迁移前决定是 bug 还是特性并写入不变量测试。
12. 【契约变更需产品/设计确认】① ActivityItem 从预格式化字符串改结构化金额；② token-detail 从 route-param 字符串快照改为按 id 从 core store 取——改变导航契约，三个入口（HoldingsList/BalanceDetailSheet/未来 deep-link）需同步；③ 深链路由守卫收进 session view 模型会改变 web 直开深链行为，需逐路由回归；④ 端点/网络 override 健康检查从『徽章』改为『gate 保存』是行为变更。
13. 【封禁概念双真值】rpc-pool 的 EndpointStats.banned 布尔与 banMap 生命周期不同步（池 10min 重建保留旧 banned，isBanned 只在 collectUrls 过滤）——建模前先裁定单一真值语义。
14. 【readonly-rpc-gate 归属】本清单裁为留 shell（调度类），但报告 4 认为可选核化——若未来 dApp 读洪泛策略需要与签名优先级联动决策，再议。
15. 【wasm 体积红灯,017 前置】016 实测:三台小机器使 wasm 从 ≈820KB 涨到 982,770 字节(每台 ≈54KB,主因 per-app Core/serde 单态化),1MB 硬门只剩 ~17KB 余量。下一台机器装不下。spec 017 动工前必须先做体积专项(共享 serde 路径 / wasm 构建裁剪 wire 类型的 Debug+PartialEq / wasm-opt -Oz / 核心分 chunk 加载),绝不抬高 MAX_WASM_BYTES(011 FR-030)。
