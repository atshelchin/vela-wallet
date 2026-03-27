# Vela Wallet 产品设计

## 一句话描述

基于 Passkey 的以太坊 Safe 智能钱包，通过蓝牙 Chrome 插件连接 dApp。

## 架构总览

```
┌─────────────────────────────────────────────┐
│                 用户                         │
│            （生物识别）                       │
└──────────────────┬──────────────────────────┘
                   │
          ┌────────▼────────┐
          │   Passkey 签名   │
          │ (WebAuthn P256)  │
          │ iCloud / Google  │
          │   云端同步       │
          └────────┬────────┘
                   │
     ┌─────────────┼─────────────┐
     │             │             │
     ▼             ▼             ▼
  iOS App     Android App   Vela Connect
 (SwiftUI)    (Kotlin)     (Chrome 插件)
     │             │             │
     └─────────────┤             │
                   │         蓝牙 BLE
                   │             │
                   ▼             ▼
          ┌─────────────────────────┐
          │    ERC-4337 UserOp      │
          │   Bundler → EntryPoint  │
          └────────────┬────────────┘
                       │
                       ▼
          ┌─────────────────────────┐
          │  Safe 1.4.1 (CREATE2)   │
          │  + SafeWebAuthnSigner   │
          │  + Safe4337Module       │
          │  所有 EVM 链同地址       │
          └─────────────────────────┘
```

## 核心设计决策

### 1. 纯 Passkey，无 SecureEnclave/StrongBox

不使用设备本地的 TEE/SecureEnclave/StrongBox P256 密钥，不需要 Recovery Module。

**理由：**
- 手机丢失很常见，Passkey 丢失极不常见（绑定 Apple/Google 账号）
- 去掉设备本地密钥后，换手机零成本（Passkey 自动同步）
- 无需多链恢复同步、无需可重放签名、无需 Recovery Module
- 架构极致简化，不需要编写任何新合约

**接受的 trade-off：**
- 安全性 = Apple/Google 账号安全性
- 定位为日常使用钱包，非冷存储

### 2. Passkey 永不更换

Passkey 公钥决定 CREATE2 地址。一旦更换，地址就变了，未部署的链上旧地址将失去控制。

因此 Passkey 设定为**永久不变、不可更换**。

### 3. 不支持 WebView / WalletConnect

连接 dApp 的唯一方式：通过蓝牙连接 Vela Connect Chrome 插件。

插件作为 EIP-1193 Provider 注入网页，交易请求通过蓝牙推送到手机签名。

## 合约架构

**无需编写新合约。** 全部使用已部署的基础设施：

| 合约 | 地址 | 用途 |
|------|------|------|
| SafeProxyFactory | `0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67` | CREATE2 部署 Safe Proxy |
| SafeL2 Singleton | `0x29fcB43b46531BcA003ddC8FCB67FFE91900C762` | Safe 逻辑合约 |
| SafeWebAuthnSharedSigner | `0x94a4F6affBd8975951142c3999aEAB7ecee555c2` | Passkey P256 签名验证 |
| Safe4337Module | `0x75cf11467937ce3F2f357CE24ffc3DBF8fD5c226` | ERC-4337 支持 |
| SafeModuleSetup | `0x2dd68b007B46fBe91B9A7c3EDa5A7a1063cB5b47` | 模块初始化 |
| MultiSend | `0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526` | 批量交易 |
| EntryPoint (v0.7) | `0x0000000071727De22E5E9d8BAf0edAc6f37da032` | ERC-4337 入口 |

以上地址在所有 EVM 链上一致。

### Safe 初始化流程

```
Passkey 公钥 (x, y)
    │
    ├── saltNonce = keccak256(abi.encode(x, y))
    │
    ├── setup() 参数:
    │   ├── owners = [SafeWebAuthnSharedSigner]
    │   ├── threshold = 1
    │   ├── to = MultiSend (delegatecall)
    │   ├── data = multiSend([
    │   │     enableModules([Safe4337Module]),
    │   │     configure({x, y, verifiers: 0x100})  // RIP-7212 P256 预编译
    │   │   ])
    │   └── fallbackHandler = Safe4337Module
    │
    └── CREATE2 地址 = f(factory, salt(setupData, saltNonce), proxyCreationCode + singleton)
```

参考实现：`biubiu-monorepo/apps/biubiu.tools/src/lib/auth/compute-safe-address.ts`

## 用户流程

### 创建钱包

```
打开 App → 注册 Passkey（生物识别）
         → 本地计算 Safe 地址（无需上链）
         → 显示地址，可以收款
         → 首笔交易时通过 ERC-4337 懒部署 Safe
```

### 日常交易

```
发起转账 → 构建 ERC-4337 UserOperation
         → Passkey 生物识别签名
         → 发送到 Bundler → 上链
```

### 连接 dApp（Vela Connect）

```
Chrome 安装 Vela Connect 插件
         → 手机 App 通过蓝牙配对插件
         → 网页 dApp 调用 EIP-1193 Provider（插件注入）
         → 插件通过蓝牙将请求推送到手机
         → 手机 Passkey 签名 → 蓝牙回传 → 插件返回结果给 dApp
```

### 换手机

```
新手机登录同一个 Apple/Google 账号
         → Passkey 自动同步
         → App 计算出同一个 Safe 地址
         → 完成，零成本
```

### 多链使用

```
切换到新链 → 同一个 Passkey → 同一个 Safe 地址
           → 首笔交易时懒部署
```

## 开发组件

| 组件 | 技术栈 | 核心职责 |
|------|--------|---------|
| iOS App | SwiftUI + Swift | Passkey 注册/签名、Safe 地址计算、UserOp 构建、蓝牙外设模式 |
| Android App | Kotlin + Jetpack Compose | 同上，统一概念和 API 命名，适配器模式封装平台差异 |
| Vela Connect | WXT + Svelte + TypeScript | Chrome 插件，蓝牙中心设备，EIP-1193 Provider 注入 |

### 开发顺序

1. iOS App（先行实现，验证所有流程）
2. Vela Connect Chrome 插件（配合 iOS 调试蓝牙 + dApp 连接）
3. Android App（复用 iOS 的概念和命名，仅替换平台 API）

### 跨平台统一原则

iOS 和 Android 使用**同一套概念、API 命名、函数名**，差异仅在：
- 语言语法（Swift vs Kotlin）
- 平台 API（通过适配器模式封装）

目标：阅读 iOS 代码的人能直接理解 Android 代码，反之亦然。
