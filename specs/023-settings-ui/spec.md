# Feature Specification: Settings UI Components & Real-App Wiring

**Feature Branch**: `023-settings`

**Created**: 2026-09-02

**Status**: Implemented

**Input**: Founder description: "Implement the settings UI from `design/settings/`
on all four clients (`app-android/vela-wallet`, `app-ios/VelaWallet`,
`app-web/vela-wallet`, `app-desktop/vela-wallet`). There are dozens of mocks but
very few patterns — the same handful of components reassembled — so build the
components once per platform and compose the screens from them. Wire them into
the REAL app, not only into a gallery. Business state can wait."

## Why

Spec 015 built the wallet vocabulary and spec 018 the list-management one.
Settings is the third and last screen family a person touches routinely, and it
is where a specific product problem lives: **until this feature, tapping the
设置 tab signed you out.** There was no settings screen, so the tab was wired
straight to `signOut()` on all four clients — which meant somebody reaching for
"change my language" logged themselves out instead.

So this feature is not only "draw forty mocks". It is:

1. the settings component vocabulary, once per platform;
2. every mock reachable and reviewable through the existing gallery mechanism;
3. **the settings tab actually opening settings**, with 退出登录 moved onto the
   row a person would look for it on.

## Design Authority

`design/settings/` is the visual authority — 42 PNGs plus two SPEC sheets.

| Group | Mocks | What they define |
|---|---|---|
| ST1, ST1b | 2 | Phone settings home; 高级 collapsed / expanded |
| ST2–ST8 | 7 | Account switcher, sign-out (+ pending-upload variant), language, currency, number, date, time |
| ST9, ST9b | 2 | Network list; network detail with the chain-ID mismatch |
| ST10, ST10b, ST10c | 3 | Add network: search, compatible, incompatible |
| ST11–ST14 | 4 | RPC providers, service endpoints, device storage, about |
| ST13b, ST15, ST16 | 3 | Clear-caches confirm, feedback, erase-device confirm |
| SR1–SR5 | 6 | The rescue set: RPC-down banner, fix RPC (failing/restored), balance breakdown, relayer bootstrap, passkey-index unreachable |
| DST1–DST8, DST4b | 9 | Desktop: eight panels behind a 216px second-level nav, plus the add-network dialog |
| DSR1 | 1 | Desktop fix-RPC dialog over the wallet |

## The vocabulary (what "few patterns" turned out to mean)

Every one of the forty screens is assembled from these, per platform:

`SettingsRow` · `SectionLabel` · `AccountRow` · `SegmentedControl` ·
`TextScaleSlider` · `SelectRow` · `StatusPill` · `Callout` · `ChainMark` ·
`NetworkRow` · `UrlField` · `CheckList` · `StorageBar` · `StorageGroup` ·
`KeyValueRow` · `DangerCard` · `ConfirmSheet` · `RpcBanner`

plus, on the desktop only: `SettingsNavList` · `FormRow` · `Dropdown` · `Dialog`.

Seven panels (`networks`, `network-detail`, `add-network`, `rpc-providers`,
`endpoints`, `storage`, `about`) are shared between the phone's pushed pages and
the desktop's panels: same data, different container.

## Scope

**In**: the components, all 38 phone/desktop states behind fixtures, the gallery
entries, and the real-app wiring (tab → screen, 退出登录 → `session.signOut()`,
identity swapped onto the account block).

**Out** (deliberate, per the founder's "业务状态可以先不接入"): reading or writing
any preference, probing an RPC, measuring storage, editing an endpoint, adding a
network. Every value on these screens is canon fixture data.

## Requirements

- **FR-001** One component vocabulary per platform; no screen owns a bespoke row.
- **FR-002** Every mock is one state id, and each state builds from fixtures alone.
- **FR-003** All copy resolves through the vela-core corpus; endonyms and
  provider-supplied currency names are data, not translations.
- **FR-004** Every state is reachable from that platform's existing gallery.
- **FR-005** The 设置 tab opens the settings screen; 退出登录 signs out.
- **FR-006** The signed-in name/address/identicon replace the fixture ones; the
  other two accounts stay fixtures (the core exposes no account list).
- **FR-007** Accent is reserved for value-moving actions. Destructive confirms
  are the error colour; navigation links are info blue.
- **FR-008** A failed compatibility check keeps all four rows and offers a way
  forward rather than a disabled CTA.
