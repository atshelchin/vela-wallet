# 022 — Explore + dApp signing UI · data model

The canon four clients transliterate. Source of truth for the visuals is
`design/explore/` (60 mocks + 4 SPEC boards); source of truth for copy is the
i18n corpus (`rust/crates/vela-core/i18n/locales/**`). Everything below is
**display-ready** — no service types, no formatting, no fetching, exactly as
spec 015/018 established.

Two vocabularies, one shared shell:

- **Explore** — the browser home, the browsing chrome, tabs, and three sheets.
- **Signing** — one universal renderer (`SigningSheet`) that draws all 33 CS
  scenarios out of an ordered block list, plus the desktop third-column form.

Mock inventory: E1–E7 (phone explore), DE1–DE3 (desktop explore), CS1–CS33
(phone signing), DCS1–DCS8 + DE4 (desktop signing).

**One client is exempt from Explore.** The web app runs *inside* a browser and
cannot host another site's dApp with a wallet injected into it, so it ships no
探索 destination at all — three tabs, not a fourth that opens nothing (founder
call, 2026-09-02). Its explore/signing components and fixtures still ship and
still render in the gallery: that gallery is the design source the three native
clients are reviewed against, and the signing vocabulary serves the web the day
a connection path other than an in-app browser exists.

---

## 1. Geometry (measured off the mocks, not estimated)

Phone frame 392×844. Screen padding 24 (`layout.screenPaddingX`).

| Element | Value | Measured from |
| --- | --- | --- |
| Search field height | 48 | E2L y116–163 |
| Search field radius | 12 (`radius.lg`) | E1L |
| Favorite tile avatar | 56 | E2L y222–277, x33–88 |
| Favorite tile grid | 4 columns, pitch 90, space-between | E2L row y=250 |
| Favorite tile row pitch | 96 | E2L 222→318 |
| Site row avatar | 40 | E2L 最近的 dApp rows |
| Tab strip favicon (phone tab card) | 20 | E5L |
| Tab card | 2 columns, preview 4:3, radius 16 | E5L |
| Sheet corner radius | 20 (`radius.2xl`) | E3L/E6L/E7L |
| Sheet grab handle | 40×4, `border.strong` | E3L y≈460 |
| Address bar pill height | 40 | E4L y50–90 |
| Browser toolbar height | 56 + safe area | E4L |
| Signing sheet top (CS1) | y289 → 555 tall | CS1 col x=30 |
| Signing dApp avatar | 36 | CS1 row y=345, x24–59 |
| Network chip | h 26, radius full, 96 wide at "Ethereum" | CS1 |
| Slide-to-confirm track | 342×56, knob 44 | CS1 row y=770 |
| Desktop third column | 400 | DE3L/DCS1L |
| Desktop signing content column | 360 (400 − 2×20) | DCS1L |
| Desktop tab strip height | 36 | DE3L |
| Desktop toolbar height | 56 | DE3L |

Below `BREAKPOINT_CONTACTS_OVERLAY` (1120) the desktop third column overlays
the content column instead of splitting it — the rule spec 018 already set,
reused verbatim (SPEC 探索 桌面: 窄窗 <1080 变覆层抽屉; we keep the existing
1120 constant rather than introduce a second breakpoint).

---

## 2. Explore models

```
ExploreStateId  = e1 | e2 | e3 | e4 | e5 | e6 | e7
ExploreDesktopStateId = de1 | de2 | de3 | de4

SiteModel {
  id, name, host, letter, tint (hex), subtitle?, meta?    // meta = "刚刚" / "昨天"
}

TileModel = site(SiteModel) | add                        // "+ 添加" is a tile
GroupKind = favorites | recent | custom                  // first two are system
GroupModel {
  id, title, kind, action?: GroupAction, sites[], hidden
}
GroupAction = edit | clear | menu                        // 编辑 / 清空 / ⋯

ExploreHomeModel {
  title, tabCount, search: { placeholder },
  empty?: { title, caption, cta },                       // E1 only
  favorites?: { title, action, tiles[] },
  groups: GroupModel[],
  tabs: TabModel[],
  sheet?: ExploreSheet
}

TabModel { id, title, site?: SiteModel, selected, startPage }

BrowserModel {
  url, host, secure, connected,
  canBack, canForward,
  account: { name, identiconSeed },
  tabCount,
  page: DemoPageModel                                    // the stub site
}

DemoPageModel — the fake dApp the mocks draw: a card with a title, two amount
fields and one accent CTA, then two skeleton bars. It is FIXTURE CONTENT, not
app chrome, so its strings are verbatim from the mock and never translated
(the same rule spec 015 applied to 大表哥).

ExploreSheet =
  | groupManage { title, rows: [{ id, title, meta?, system, hidden }], newGroup }
  | siteMenu    { site, items: [{ id, icon, label, danger }] }
  | connection  { site, account, network, explainer, disconnect, footnote }
```

Desktop adds:

```
TabStripModel { tabs: TabModel[], newTabLabel }
DesktopToolbarModel { back, forward, reload, url, bookmarked, menu, account }
ThirdPanelModel = connection(ExploreSheet.connection) | signing(SigningModel)
ContextMenuModel { items: [{ id, icon, label, danger }] }    // DE2 tile menu
```

### Explore fixture canon

Sites (letter / tint):

| id | name | host | letter | tint |
| --- | --- | --- | --- | --- |
| uniswap | Uniswap | app.uniswap.org | U | #FF007A |
| aave | Aave | app.aave.com | A | #8B6DFF |
| pancake | PancakeSwap | pancakeswap.finance | P | #1FC7D4 |
| polymarket | Polymarket | polymarket.com | P | #4267F4 |
| opensea | OpenSea | opensea.io | O | #2081E2 |
| lido | Lido | stake.lido.fi | L | #F0616D |
| ens | ENS | app.ens.domains | E | #5284FF |
| hyperliquid | Hyperliquid | app.hyperliquid.xyz | H | #50D2C1 |
| curve | Curve | curve.fi | C | #7B7BE8 |
| limitless | Limitless | limitless.exchange | L | #8B6DFF |

Groups: `favorites` (8 tiles + add, action = edit), `recent` (system, action =
clear; E2 shows Hyperliquid 刚刚, DE2 adds Uniswap / Polymarket 昨天 / OpenSea
昨天), `交易` (Curve 稳定币兑换, Hyperliquid 永续合约交易), `预测市场`
(Polymarket 事件预测市场, Limitless 预测市场). Custom group titles and site
subtitles are fixture content, verbatim from the mock.

Tabs (E5/DE3): Uniswap (selected), Polymarket, 起始页 · start page, then the
"new tab" affordance.

---

## 3. Signing models — the universal block renderer

One scenario = header + **ordered blocks** + footer. Every CS mock is
expressible this way; nothing in the renderer is scenario-specific. This is the
六级降级阶梯 made structural: a deeper degradation just emits more warning
blocks and fewer decoded ones.

```
Tone = neutral | accent | success | caution | danger

SigningModel {
  id,                                   // "cs1" … "cs33"
  dapp: { name, host, letter, tint },
  network: { name, dot },
  blocks: Block[],
  tech: TechModel,                      // the 技术细节 disclosure
  techOpen,                             // CS29 ships it open
  fee: FeeModel,
  signer: { name, identiconSeed },
  confirm: { label, enabled }           // 滑动以确认 · {label}
}

Block =
  | intent      { text, tone }                       // eyebrow, CS5 danger etc.
  | amount      { sign?, value, symbol, token?: {letter,tint}, fiat?, caption?, tone, card? }
  | swap        { pay: AmountLine, receive: AmountLine }     // ↓ badge between
  | nft         { id, collection }
  | sentence    { text, tone }
  | allowance   { label, value, valueTone, chips[], note?, resultingTotal? }
  | party       { label, name, address?, badge?: { text, tone } }
  | rows        { rows: [{ label, value, valueTone, mono }] }
  | warning     { tone: caution|danger, text }
  | positive    { text }
  | code        { lines[], note? }                   // message / hex / json / calldata
  | card        { title?, rows[], tone }             // batch step, Safe inner call
  | balances    { title, rows: [{ symbol, delta, tone }], note?, noteTone }

AllowanceChip { id, label, state: idle | selected | disabled }
  // never-unlimited mandate: `requested` is DISABLED whenever the request is
  // unlimited (CS5, CS10, CS16) — permanently, not merely unselected.

AmountLine { sign, value, symbol, token, fiat?, caption? }

TechModel {
  fn?,                                   // "transfer(address to, uint256 value)"
  params: [{ label, value }],
  identities: [{ role, name, address }], // copy + explorer affordances
  simResult?,
  raw?: { bytes, hex }
}

FeeModel =
  | onchain  { label, value, fiat, selector?: FeeSelector }
  | offchain { note }                    // ✓ 无网络费用 — 链下签名
  | hidden                               // CS20–CS22: nothing at all
FeeSelector { title, options: [{ letter, tint, name, balance, fee, selected }] }
```

Block order per scenario is the mock's own top-to-bottom order. The footer is
always: tech disclosure → fee → signer → slide.

### Scenario catalog (33)

| id | intent (tone) | shape | degradation rung |
| --- | --- | --- | --- |
| cs1 | Send | amount + sentence + party(contact) | 1 descriptor |
| cs2 | Send | amount + sentence + party(first-time) | 1 |
| cs3 | Send | amount + positive(self) + party(wallet) | 1 |
| cs4 | Send | amount + sentence + rows(from) + party | 1 |
| cs5 | Approve (danger) | allowance(unlimited, requested disabled) + party + danger | 1 |
| cs6 | Approve | allowance(balance) + sentence + party | 1 |
| cs7 | Approve | allowance(+100, resulting total) + party | 1 |
| cs8 | Revoke | allowance(revoke) + sentence + party | 1 |
| cs9 | Transfer NFT | nft + sentence + party(contact) | 1 |
| cs10 | Approve all (danger) | allowance(all NFTs) + sentence + 2 parties + caution | 1 |
| cs11 | Swap | swap + sentence + party(verified) | 1 |
| cs12 | Swap | swap + sentence + party | 1 |
| cs13 | Swap | swap + rows(deadline) + caution + danger | 1 |
| cs14 | Deposit | swap(asset→shares) + caution + party | 1 |
| cs15 | Withdraw | amount(+) + sentence + party | 1 |
| cs16 | Permit (danger) | sentence + party + rows + danger + offchain fee | 1 |
| cs17 | Permit | sentence + party + rows + offchain fee | 1 |
| cs18 | Sign typed data | caution + rows + code + offchain fee | 6 (typed, blind) |
| cs19 | Sign in | rows + code + positive(siwe ok) + offchain fee | 1 |
| cs20 | Sign in (danger) | danger + rows + code, fee hidden | phishing |
| cs21 | Sign message | caution + code + rows, fee hidden | blind |
| cs22 | Blind signature (danger) | sentence + code + danger, fee hidden | hard-danger |
| cs23 | Contract call | caution(no descriptor) + rows + party + balances | 4 sim |
| cs24 | Contract call (danger) | sentence + balances(danger) + party + danger | 5 drain |
| cs25 | Deploy | sentence + rows | 1 |
| cs26 | Batch | sentence + card ×2 + balances | 1 |
| cs27 | Safe execution | sentence + card(inner) + party | 1 |
| cs28 | Send (danger) | amount(danger card) + party(contract) + danger | burn intercept |
| cs29 | Send | = cs1 with `techOpen` | 1 |
| cs30 | Contract call | sentence + caution + rows + party + balances | 3 4byte |
| cs31 | Contract call | sentence + rows + party + caution + balances | 2 verified ABI |
| cs32 | Contract call | caution + danger + rows + party + code | 6 deepest |
| cs33 | Swap | = cs11 with the fee selector expanded | 1 |

Desktop covers the same 33 through the third column; DCS1–8 + DE4 are the
mocks that pinned the form (`cs1, cs5, cs11, cs16, cs24, cs26, cs32, cs33` and
`cs12`).

---

## 4. Interaction contract (from the two SPEC boards)

- **Confirmation is a slide, always.** `SlideToConfirm`, ≥88% travel commits,
  spring damping 15 / stiffness 150 on release. There is NO reject button —
  closing the sheet rejects (product contract, restated by the founder in
  SPEC 签名 · 桌面第三栏).
- **Never-unlimited.** An unlimited request may never be confirmed as
  requested: the `requested` chip is disabled and the slider is disabled until
  a finite chip is chosen (cs5). `setApprovalForAll` (cs10) and Permit2
  (cs16) get the danger treatment instead, since neither can be capped.
- **Warning ladder.** Every rung down adds warning weight and removes certainty
  from the wording; facts stay fully on display at every rung.
- **Start page → browsing**: 250 ms ease-out push; the address bar's elements
  collapse into the domain pill.
- **Sheets**: 220 ms up / 180 ms down, spring damping 15 · stiffness 150.
  Drag-down or scrim tap closes. Scrim 0.35.
- **Tabs**: zoom-out grid 250 ms; the "+" card springs in 150 ms; ≤10 tabs,
  after which "+" goes grey.
- **Connection dot**: account chip's green dot scales 0→1 in 240 ms;
  disconnecting fades it grey.
- **Pull to refresh** while browsing: 72 px triggers the branded sail.
- `prefers-reduced-motion` / accessibility-reduce-motion degrades every slide
  and zoom to a cross-fade; nothing exceeds 400 ms; every affordance is
  reachable by tap/click and keyboard.
- Desktop keys: ⌘L address bar, ⌘T new tab, ⌘W close tab, ⌘1–9 switch tab,
  Esc closes the third column or the open menu, full Tab ring at 2 px accent.

---

## 5. i18n

New namespace `explore.json` (55 keys) plus 30 additions under
`componentsUi.signing` / `componentsUi.signingApprove`. Registered in three
places that must agree: `scripts/gen-i18n.mjs`, `scripts/lint-i18n-corpus.mjs`
and `src/__tests__/i18n/resources-generated.test.ts` (which also pins the leaf
count). `{{count}}` is banned in new keys — the corpus lint's A5 rule fires on
any `{{count}}` without plural siblings, so templated counts use `{{n}}`.

Fixture content (site names, hosts, group titles, demo page copy, 大表哥,
addresses, amounts) is NOT translated — it is mock content, per spec 015.
