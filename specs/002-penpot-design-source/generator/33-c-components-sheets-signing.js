// 33-c-components-sheets-signing.js — signing internals (split c/3): C/Signing/BodyView
// (5 representative request-type views), C/Signing/BalanceChangePreview, C/Signing/WarningBanner,
// C/Primitives/RecipientTypeBadge.
// Visual truth: inv:03 §2.2–§2.10 (views/eyebrow/summary/approve-card), §2.9 (preview), §2.6 (banner),
// §5.7 (badge), §0.6 (color grammar).
// Idempotency: family-level skip-if-exists. Final x=2800, families y 5500/6400/7300/8200;
// scratch row y=8000 from x=5000 (final containers end < x5000, so no overlap).
if (!storage.lib) throw new Error('run 10-lib.js first');
const lib = storage.lib;
await lib.open('03 Components');

const FINAL_X = 2800, SCRATCH_Y = 8000;
let sx = 5000;
const summary = { built: {}, skipped: [], variantErrors: 0 };
const exists = (fam) => penpot.library.local.components.some(c => c.name === lib.norm(fam));
const bind = (shape, token, props) => { try { lib.bindToken(shape, token, props); } catch (e) {} };
const B = (name, w, h, fill) => {
  const b = penpot.createBoard();
  b.name = name;
  b.x = sx; b.y = SCRATCH_Y; sx += w + 60;
  b.resize(w, h);
  b.fills = fill ? [{ fillColor: fill, fillOpacity: 1 }] : [];
  return b;
};
const T = (b, name, s) => lib.upsertText(b, name, s).text;
const R = (b, name, s) => lib.upsertRect(b, name, s).rect;
const I = (b, lucide, size, sw, color, x, y) => {
  const r = R(b, 'icon:' + lucide + ' ' + size + '/' + sw, { x, y, w: size, h: size, stroke: color, strokeWidth: sw });
  r.fills = [];
  return r;
};
const E = (b, name, size, fill, x, y) => {
  const e = penpot.createEllipse();
  e.name = name;
  b.appendChild(e);
  e.resize(size, size);
  e.fills = fill ? [{ fillColor: fill, fillOpacity: 1 }] : [];
  e.x = b.x + x; e.y = b.y + y;
  return e;
};
const combine = async (comps, family, axes, finalY) => {
  await lib.sleep(400);
  const container = penpot.createVariantFromComponents(comps.map(c => c.mainInstance()));
  await lib.sleep(500);
  container.name = family;
  container.x = FINAL_X; container.y = finalY;
  const vv = container.variants;
  vv.renameProperty(0, axes[0]);
  if (axes.length > 1) {
    for (let i = 1; i < axes.length; i++) vv.addProperty();
    await lib.sleep(300);
    for (let i = 1; i < axes.length; i++) vv.renameProperty(i, axes[i]);
    await lib.sleep(200);
    for (const vc of container.variants.variantComponents()) {
      const parts = String(Object.values(vc.variantProps)[0] || '').split(' ');
      if (parts.length === axes.length) parts.forEach((p, i) => vc.setVariantProperty(i, p));
    }
  }
  await lib.sleep(300);
  summary.variantErrors += container.variants.variantComponents().filter(vc => vc.variantError).length;
  summary.built[family] = comps.length;
  return container;
};
// eyebrow: uppercase kicker, sm semibold ls1.4, fg.subtle unless tinted — inv:03 §2.2
const eyebrow = (b, text, color) => {
  const t = T(b, 'eyebrow', { text, size: 11, weight: 600, color: color || '#8C887E', x: 0, y: 8 });
  t.letterSpacing = '1.4';
  return t;
};

// ============================================================================
// Family 1 — C/Signing/BodyView: 5 representatives of the 9-view body. inv:03 §2.10
// ============================================================================
if (exists('C/Signing/BodyView')) summary.skipped.push('C/Signing/BodyView');
else {
  const comps = [];
  { // eth-transfer — plain native send: hero TokenCard (hideSign) + SummaryLine + auto recipient — inv:03 §2.10 (send) / §2.4
    const b = B('eth-transfer', 342, 220, '#FAFAF8'); bind(b, 'color.bg.base', ['fill']);
    eyebrow(b, 'SEND'); // intent word, ink/subtle (benign) — inv:03 §2.2/§0.6
    const amt = T(b, 'hero amount', { text: '0.42', size: 40, weight: 700, color: '#1A1A18', x: 0, y: 34 }); // text.5xl bold ls −1.2, ink for outgoing — inv:03 §2.4
    amt.letterSpacing = '-1.2';
    E(b, 'TokenLogo 24 · ETH', 24, '#F5F3EF', 108, 58); // unit group bottom-aligned, logo LEFT of ticker — inv:03 §2.4
    T(b, 'hero ticker', { text: 'ETH', size: 20, weight: 700, color: '#6E6B62', x: 138, y: 56 }); // ticker text.2xl bold fg.muted — inv:03 §2.4
    T(b, 'summary', { text: 'Send 0.42 ETH to vitalik.eth', size: 15, weight: 500, color: '#1A1A18', x: 0, y: 98 }); // one-sentence read, 15/23 medium ink — inv:03 §2.3
    R(b, 'bar hairline', { x: 0, y: 144, w: 342, h: 1, fill: '#ECEBE4' }); // ContractBar top hairline — inv:03 §2.5
    E(b, 'ContactAvatar 36', 36, '#F5F3EF', 0, 156); // wallet recipient → ContactAvatar 36 — inv:03 §2.5
    T(b, 'recipient name', { text: 'vitalik.eth', size: 11, weight: 600, color: '#1A1A18', x: 46, y: 158 }); // name sm semibold, neutral ink (green = descriptor-verified only) — inv:03 §2.5
    T(b, 'first-time note', { text: 'First time sending to this address', size: 10, weight: 500, color: '#6E6B62', x: 46, y: 176 }); // grey, deliberately NOT amber — inv:03 §2.5
    comps.push(penpot.library.local.createComponent([b]));
  }
  { // erc20-transfer — ClearSignView send + identity chip — inv:03 §2.10 / §2.5
    const b = B('erc20-transfer', 342, 220, '#FAFAF8'); bind(b, 'color.bg.base', ['fill']);
    eyebrow(b, 'SEND');
    const amt = T(b, 'hero amount', { text: '250', size: 40, weight: 700, color: '#1A1A18', x: 0, y: 34 }); // inv:03 §2.4
    amt.letterSpacing = '-1.2';
    E(b, 'TokenLogo 24 · USDC', 24, '#F5F3EF', 92, 58);
    T(b, 'hero ticker', { text: 'USDC', size: 20, weight: 700, color: '#6E6B62', x: 122, y: 56 });
    T(b, 'summary', { text: 'Send 250 USDC to alice.base.eth', size: 15, weight: 500, color: '#1A1A18', x: 0, y: 98 }); // summarySend {amount,to} — inv:03 §2.3
    R(b, 'bar hairline', { x: 0, y: 144, w: 342, h: 1, fill: '#ECEBE4' });
    E(b, 'ContactAvatar 36', 36, '#F5F3EF', 0, 156);
    T(b, 'recipient name', { text: 'alice.base.eth', size: 11, weight: 600, color: '#1A1A18', x: 46, y: 158 });
    const chip = R(b, 'identity chip', { x: 46, y: 176, w: 52, h: 18, fill: '#EDF0FF', radius: 999 }); // 「Wallet」 info.soft pill r.full — inv:03 §2.5
    bind(chip, 'color.info.soft', ['fill']);
    T(b, 'identity chip label', { text: 'Wallet', size: 10, weight: 600, color: '#4267F4', x: 57, y: 179 }); // info.base, ls 0.2 — inv:03 §2.5
    comps.push(penpot.library.local.createComponent([b]));
  }
  { // erc20-approve — ApprovalView + EditableApproveCard, the never-unlimited mandate — inv:03 §2.8/§2.10
    const b = B('erc20-approve', 342, 250, '#FAFAF8'); bind(b, 'color.bg.base', ['fill']);
    const ey = eyebrow(b, 'APPROVE', '#C62828'); // unbounded request → RED eyebrow — inv:03 §2.10 / §0.6
    bind(ey, 'color.error.base', ['fill']);
    T(b, 'summary', { text: 'Let Permit2 spend your USDC', size: 15, weight: 500, color: '#C62828', x: 0, y: 32 }); // danger tone only for unbounded grant — inv:03 §2.3/§2.10
    E(b, 'TokenLogo 28 · USDC', 28, '#F5F3EF', 0, 66); // header: TokenLogo 28 + symbol bold — inv:03 §2.8
    T(b, 'approve symbol', { text: 'USDC', size: 13, weight: 700, color: '#1A1A18', x: 36, y: 72 });
    const cap = T(b, 'cap label', { text: 'SPENDING CAP', size: 10, weight: 600, color: '#8C887E', x: 254, y: 74 }); // 10 semibold uppercase subtle ls 0.4 — inv:03 §2.8
    cap.letterSpacing = '0.4';
    const val = T(b, 'cap value', { text: '250.00', size: 26, weight: 700, color: '#1A1A18', x: 0, y: 102 }); // amount text.3xl bold ls −0.5 — inv:03 §2.8
    val.letterSpacing = '-0.5';
    I(b, 'Pencil', 15, 2, '#8C887E', 104, 112); // edit affordance — inv:03 §2.8
    T(b, 'cap fiat', { text: '≈ $250.00', size: 11, weight: 500, color: '#6E6B62', x: 0, y: 136 }); // ≈ fiat sm medium fg.muted — inv:03 §2.8
    // preset chips: pills r.full, bg.raised + 1px border.base; active = fg.base fill + inverse text;
    // NO "Requested" chip for an unbounded request (forced custom) — inv:03 §2.8
    R(b, 'chip Balance', { x: 0, y: 158, w: 64, h: 24, fill: '#FFFFFF', radius: 999, stroke: '#ECEBE4', strokeWidth: 1 });
    T(b, 'chip Balance label', { text: 'Balance', size: 11, weight: 600, color: '#6E6B62', x: 12, y: 163 });
    const active = R(b, 'chip Custom', { x: 70, y: 158, w: 62, h: 24, fill: '#1A1A18', radius: 999 });
    bind(active, 'color.fg.base', ['fill']);
    T(b, 'chip Custom label', { text: 'Custom', size: 11, weight: 600, color: '#FFFFFF', x: 82, y: 163 });
    R(b, 'chip Revoke', { x: 138, y: 158, w: 62, h: 24, fill: '#FFFFFF', radius: 999, stroke: '#ECEBE4', strokeWidth: 1 }); // active-safe Revoke = success.base fill — inv:03 §2.8
    T(b, 'chip Revoke label', { text: 'Revoke', size: 11, weight: 600, color: '#6E6B62', x: 150, y: 163 });
    I(b, 'AlertTriangle', 13, 2, '#C62828', 0, 194); // inline error row — inv:03 §2.8
    T(b, 'guard error', { text: 'Unlimited approvals are disabled here', size: 11, weight: 500, color: '#C62828', x: 18, y: 194 }); // unlimitedDisabled: NO unlimited path — inv:03 §2.8
    T(b, 'cap summary', { text: 'Permit2 will be able to spend up to 250 USDC', size: 11, weight: 400, color: '#6E6B62', x: 0, y: 218 }); // capSummary sm regular muted — inv:03 §2.8
    comps.push(penpot.library.local.createComponent([b]));
  }
  { // typed-data — BlindTypedDataView: honest-raw rows + "Signing for" + caution banner — inv:03 §2.10
    const b = B('typed-data', 342, 240, '#FAFAF8'); bind(b, 'color.bg.base', ['fill']);
    eyebrow(b, 'SIGN TYPED DATA'); // neutral eyebrow — inv:03 §2.10
    T(b, 'row1 label', { text: 'Type', size: 11, weight: 500, color: '#6E6B62', x: 0, y: 44 }); // GenericFieldRow label sm medium fg.muted — inv:03 §2.6
    T(b, 'row1 value', { text: 'OrderComponents', size: 11, weight: 500, zone: 'mono', color: '#1A1A18', x: 200, y: 44 }); // value sm mono ink, right-aligned — inv:03 §2.6
    R(b, 'row hairline 1', { x: 0, y: 68, w: 342, h: 1, fill: '#ECEBE4' });
    T(b, 'row2 label', { text: 'offerer', size: 11, weight: 500, color: '#6E6B62', x: 0, y: 78 });
    T(b, 'row2 value', { text: '0x7F3a…C21d', size: 11, weight: 500, zone: 'mono', color: '#1A1A18', x: 226, y: 78 }); // one-line mid-truncated, no decimal/timestamp guessing — inv:03 §2.10
    R(b, 'row hairline 2', { x: 0, y: 102, w: 342, h: 1, fill: '#ECEBE4' });
    R(b, 'contract glyph', { x: 0, y: 116, w: 36, h: 36, fill: '#F5F3EF', radius: 12 }); // contract → rounded-square glyph, NEVER an identicon — inv:03 §2.5
    I(b, 'FileText', 17, 2, '#8C887E', 9, 125);
    const lbl = T(b, 'bar label', { text: 'SIGNING FOR', size: 10, weight: 600, color: '#8C887E', x: 48, y: 116 }); // signingFor label, 10 semibold uppercase ls 0.3 — inv:03 §2.5
    lbl.letterSpacing = '0.3';
    T(b, 'bar name', { text: 'Seaport 1.6', size: 11, weight: 600, color: '#1A1A18', x: 48, y: 130 }); // domain name, neutral ink — inv:03 §2.10
    T(b, 'bar addr', { text: '0x0000000000…7C5b', size: 10, weight: 500, zone: 'mono', color: '#6E6B62', x: 48, y: 146 }); // verifyingContract — inv:03 §2.10
    const wb = R(b, 'warning banner', { x: 0, y: 172, w: 342, h: 44, fill: '#FFF8F0', radius: 16, stroke: '#F0DCC8', strokeWidth: 1 }); // caution WarningBanner — inv:03 §2.6
    bind(wb, 'color.warning.soft', ['fill']);
    I(b, 'AlertTriangle', 14, 2, '#92600A', 14, 187);
    T(b, 'warning text', { text: "Can't decode this data — only sign if you trust this site.", size: 11, weight: 600, color: '#92600A', x: 36, y: 188 }); // blindTypedWarning — inv:03 §2.6/§2.10
    comps.push(penpot.library.local.createComponent([b]));
  }
  { // personal-sign — MessageSignView plain message bubble — inv:03 §2.10
    const b = B('personal-sign', 342, 130, '#FAFAF8'); bind(b, 'color.bg.base', ['fill']);
    eyebrow(b, 'SIGN MESSAGE');
    R(b, 'bubble hairline top', { x: 0, y: 44, w: 342, h: 1, fill: '#ECEBE4' }); // msgBubble framed by top+bottom hairlines — inv:03 §2.10
    T(b, 'message', { text: 'Welcome! Click to sign in to app.opensea.io.', size: 13, weight: 400, color: '#1A1A18', x: 40, y: 66 }); // text.base regular ink, centered — inv:03 §2.10
    R(b, 'bubble hairline bottom', { x: 0, y: 100, w: 342, h: 1, fill: '#ECEBE4' });
    comps.push(penpot.library.local.createComponent([b]));
  }
  const c = await combine(comps, 'C/Signing/BodyView', ['view'], 5500);
  lib.chip(c, 'note', '5 representatives of the 9-view body (priority order in 03 §1.1.3); permit, batch, eth-sign danger, blind-tx + SIWE variants are boarded at O/signing-sheet states');
  lib.chip(c, 'note', 'never-unlimited: unbounded approve pre-selects NOTHING, forces a finite custom entry, typing unlimited is refused; off-chain permits are the sole sign-verbatim exception (03 §2.8/§2.10)');
  lib.chip(c, 'note', 'eyebrow tint = red only when money can be lost, green only for revoke; counterparty name green ONLY when descriptor-verified (03 §0.6/§2.5)');
  lib.chip(c, 'note', 'sign convention: + green inbound, − neutral ink outbound (MetaMask/Rainbow estimated-changes grammar, 03 §2.4)');
}

// ============================================================================
// Family 2 — C/Signing/BalanceChangePreview. inv:03 §2.9
// ============================================================================
if (exists('C/Signing/BalanceChangePreview')) summary.skipped.push('C/Signing/BalanceChangePreview');
else {
  const comps = [];
  const failCard = (b, text) => { // loud failCard: error.soft + 1px error.base, r16, padV12/H16 — inv:03 §2.9.1
    const r = R(b, 'fail card', { x: 0, y: 8, w: 342, h: 44, fill: '#FEF2F2', radius: 16, stroke: '#C62828', strokeWidth: 1 });
    bind(r, 'color.error.soft', ['fill']);
    I(b, 'AlertTriangle', 16, 2, '#C62828', 14, 22);
    T(b, 'fail text', { text, size: 11, weight: 600, color: '#C62828', x: 40, y: 24 }); // sm semibold error.base — inv:03 §2.9
  };
  { const b = B('expected-fail no', 342, 70, '#FAFAF8'); bind(b, 'color.bg.base', ['fill']);
    failCard(b, 'This transaction is expected to fail.'); // simWillFail — inv:03 §2.9.1
    comps.push(penpot.library.local.createComponent([b])); }
  { const b = B('underfunded no', 342, 70, '#FAFAF8'); bind(b, 'color.bg.base', ['fill']);
    failCard(b, "You don't have enough ETH for this transaction."); // balanceUnderfundedNative {symbol} — inv:03 §2.9.2
    comps.push(penpot.library.local.createComponent([b])); }
  { const b = B('quiet-ok no', 342, 50, '#FAFAF8'); bind(b, 'color.bg.base', ['fill']); // okRow: ShieldCheck 13 + xs medium green — inv:03 §2.9.3
    I(b, 'ShieldCheck', 13, 2, '#2D8E5F', 0, 18);
    T(b, 'ok text', { text: 'Simulated: −250 USDC · no other changes', size: 10, weight: 500, color: '#2D8E5F', x: 18, y: 19 }); // simResultNoOther phrasing — inv:03 §2.9/§2.7.1
    comps.push(penpot.library.local.createComponent([b])); }
  const changes = (b) => { // open block, top hairline, received-first ordering — inv:03 §2.9.4
    R(b, 'list hairline', { x: 0, y: 8, w: 342, h: 1, fill: '#ECEBE4' });
    const ti = T(b, 'list title', { text: 'BALANCE CHANGES', size: 10, weight: 600, color: '#8C887E', x: 0, y: 18 }); // 10 semibold uppercase subtle ls 0.3 — inv:03 §2.9
    ti.letterSpacing = '0.3';
    E(b, 'TokenLogo 28 · ETH', 28, '#F5F3EF', 0, 38);
    const inn = T(b, 'row in', { text: '+0.12 ETH', size: 13, weight: 600, color: '#2D8E5F', x: 40, y: 44 }); // + green — inv:03 §2.9
    bind(inn, 'color.success.base', ['fill']);
    E(b, 'TokenLogo 28 · USDC', 28, '#F5F3EF', 0, 74);
    T(b, 'row out', { text: '−250 USDC', size: 13, weight: 600, color: '#1A1A18', x: 40, y: 80 }); // − ink — inv:03 §2.9
  };
  { const b = B('changes-list no', 342, 116, '#FAFAF8'); bind(b, 'color.bg.base', ['fill']);
    changes(b);
    comps.push(penpot.library.local.createComponent([b])); }
  { const b = B('changes-list yes', 342, 150, '#FAFAF8'); bind(b, 'color.bg.base', ['fill']);
    changes(b);
    I(b, 'ArrowDownLeft', 13, 2, '#92600A', 7, 112); // unverified: direction arrow in warning.base, NEVER a scaled amount — inv:03 §2.9
    T(b, 'unverified tag', { text: 'Unverified token', size: 11, weight: 600, color: '#92600A', x: 28, y: 112 }); // sm semibold amber — inv:03 §2.9
    T(b, 'unverified addr', { text: '0x9aF2…44b1', size: 10, weight: 500, color: '#6E6B62', x: 128, y: 113 }); // short address xs medium fg.muted — inv:03 §2.9
    comps.push(penpot.library.local.createComponent([b])); }
  const c = await combine(comps, 'C/Signing/BalanceChangePreview', ['state', 'unverified'], 6400);
  lib.chip(c, 'note', 'single render path shared by Send confirm + connection detail + signing sheet (03 §2.9)');
  lib.chip(c, 'note', 'on SigningSheet hideReassurance: quiet-ok moves into the AdvancedPanel — only LOUD states render in the sheet body (03 §1.1.4)');
  lib.chip(c, 'note', 'corroboration invariant: collapses to the quiet ✓ ONLY when every sim change matches a declared hero flow and none is unverified; outflow-only wording — the received side is spoofable (03 §2.9)');
  lib.chip(c, 'note', 'unverified-decimals rows show arrow + tag + address only — a scaled amount is never fabricated (03 §2.9)');
}

// ============================================================================
// Family 3 — C/Signing/WarningBanner. inv:03 §2.6
// ============================================================================
if (exists('C/Signing/WarningBanner')) summary.skipped.push('C/Signing/WarningBanner');
else {
  const comps = [];
  { // caution: warning.soft + 1px warning.border, amber text — inv:03 §2.6
    const b = B('caution', 342, 60, '#FAFAF8'); bind(b, 'color.bg.base', ['fill']);
    const r = R(b, 'banner', { x: 0, y: 8, w: 342, h: 44, fill: '#FFF8F0', radius: 16, stroke: '#F0DCC8', strokeWidth: 1 }); // r.xl, padV12/H16, marginV8 — inv:03 §2.6
    bind(r, 'color.warning.soft', ['fill']);
    I(b, 'AlertTriangle', 14, 2, '#92600A', 14, 22); // AlertTriangle 14 severity color — inv:03 §2.6
    const t = T(b, 'banner text', { text: "Couldn't estimate the gas fee — submitting may fail.", size: 11, weight: 600, color: '#92600A', x: 36, y: 24 }); // gasEstimateFailed, sm semibold lh18 — inv:03 §2.6 / 07 §3.2.7
    bind(t, 'color.warning.base', ['fill']);
    comps.push(penpot.library.local.createComponent([b]));
  }
  { // danger: error.soft + 1px error.base — inv:03 §2.6
    const b = B('danger', 342, 60, '#FAFAF8'); bind(b, 'color.bg.base', ['fill']);
    const r = R(b, 'banner', { x: 0, y: 8, w: 342, h: 44, fill: '#FEF2F2', radius: 16, stroke: '#C62828', strokeWidth: 1 });
    bind(r, 'color.error.soft', ['fill']);
    I(b, 'AlertTriangle', 14, 2, '#C62828', 14, 22);
    const t = T(b, 'banner text', { text: 'This grants unlimited access to your USDC.', size: 11, weight: 600, color: '#C62828', x: 36, y: 24 }); // unlimitedWarning — inv:03 §2.6
    bind(t, 'color.error.base', ['fill']);
    comps.push(penpot.library.local.createComponent([b]));
  }
  const c = await combine(comps, 'C/Signing/WarningBanner', ['severity'], 7300);
  lib.chip(c, 'note', 'amber lives ONLY here and in small "Expired ·" tags — never headlines (03 §0.6)');
  lib.chip(c, 'note', 'warnings stack danger→caution, never most-severe-only (03 §2.10 Zone 3)');
  lib.chip(c, 'note', 'copy inventory (14 keys): unlimited · tokenToContract · expired · bestEffort(+Simulated) · partial · unverified · blindTyped · blindDecode{bytes} · blindButSimulated · hexMessage · siweMismatch{domain,origin} · ethSign · gasEstimateFailed (03 §2.6)');
}

// ============================================================================
// Family 4 — C/Primitives/RecipientTypeBadge. inv:03 §5.7
// ============================================================================
if (exists('C/Primitives/RecipientTypeBadge')) summary.skipped.push('C/Primitives/RecipientTypeBadge');
else {
  const comps = [];
  { const b = B('contact', 44, 24, null); // saved contact → BadgeCheck success.base — inv:03 §5.7
    I(b, 'BadgeCheck', 15, 2, '#2D8E5F', 2, 4);
    comps.push(penpot.library.local.createComponent([b])); }
  { const b = B('vela-user', 44, 24, null); // Vela passkey user → app-icon image, size+1, circular — inv:03 §5.7
    E(b, 'VelaAppIcon 16', 16, '#E8572A', 2, 4);
    comps.push(penpot.library.local.createComponent([b])); }
  { const b = B('name-service', 44, 24, null); // ENS/name-service → Globe info.base (calm blue, deliberately not accent) — inv:03 §5.7
    I(b, 'Globe', 15, 2, '#4267F4', 2, 4);
    comps.push(penpot.library.local.createComponent([b])); }
  { const b = B('unknown-contract', 44, 24, null); // unknown → HelpCircle fg.subtle + kind glyph FileText — inv:03 §5.7
    I(b, 'HelpCircle', 15, 2, '#8C887E', 2, 4);
    I(b, 'FileText', 15, 2, '#8C887E', 24, 4);
    comps.push(penpot.library.local.createComponent([b])); }
  { const b = B('unknown-eoa', 44, 24, null); // unknown EOA → HelpCircle + Wallet glyph — inv:03 §5.7
    I(b, 'HelpCircle', 15, 2, '#8C887E', 2, 4);
    I(b, 'Wallet', 15, 2, '#8C887E', 24, 4);
    comps.push(penpot.library.local.createComponent([b])); }
  const c = await combine(comps, 'C/Primitives/RecipientTypeBadge', ['kind'], 8200);
  lib.chip(c, 'note', 'renders NOTHING until the contact lookup resolves — a saved contact never flashes "unknown" (03 §5.7)');
  lib.chip(c, 'note', 'default size 15 (Vela app icon = size+1, circular); trails the recipient name and derives from the SAME cached identity as RecipientName (03 §5.5/§5.7)');
}

return lib.done('33-c-components-sheets-signing', summary);
