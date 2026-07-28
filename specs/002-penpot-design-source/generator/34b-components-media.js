// 34b-components-media.js — media components 2/4: C/Media/ContactAvatar + C/Media/WalletAvatar
// + C/Media/QRCode.
// ContactAvatar: 8-hue tinted initial (H hashed from address→name) or identicon (pref + VALID
// address only), optional 'account' badge — inv:03 §5.1. mode×size×badge 2×9×2=36 trimmed to 13
// documented combos (note chip). WalletAvatar: initial (accent.soft circle + bold accent letter,
// letterSize round(0.34×size), size-20 pill uses 11) or identicon — inv:02 A9. QRCode: black-on-white
// hardcoded, EC level M, single merged SVG path; hosts pin a #FFFFFF plate — inv:03 §7.2; plate
// depicted at the receive spec (pad 20, radius 16, 1px border.base) — inv:05 line 223.
// Idempotency: family-level skip-if-exists.
if (!storage.lib) throw new Error('run 10-lib.js first');
const lib = storage.lib;
await lib.open('03 Components');

const FX = 4200; // this agent's final X column
const SY = 9000; // this agent's scratch Y
let sx = 5000;   // scratch x cursor

function disc(board, name, size, fill, dx, dy, o) {
  const e = penpot.createEllipse();
  e.name = name;
  e.resize(size, size);
  e.fills = [{ fillColor: fill, fillOpacity: (o && o.fillOpacity) != null ? o.fillOpacity : 1 }];
  if (o && o.stroke) e.strokes = [{ strokeColor: o.stroke, strokeWidth: o.strokeWidth || 1, strokeAlignment: 'inner' }];
  board.appendChild(e);
  e.x = board.x + dx; e.y = board.y + dy;
  return e;
}
function icon(board, lucide, size, sw, color, dx, dy, opa) {
  const e = disc(board, 'icon:' + lucide + ' ' + size + '/' + sw, size, '#000000', dx, dy);
  e.fills = [];
  e.strokes = [{ strokeColor: color, strokeWidth: sw }];
  if (opa != null) e.opacity = opa;
  return e;
}

async function combine(comps, family, props, fy) {
  await lib.sleep(400);
  const container = penpot.createVariantFromComponents(comps.map(c => c.mainInstance()));
  await lib.sleep(500);
  container.name = family;
  container.x = FX; container.y = fy;
  const vv = container.variants;
  vv.renameProperty(0, props[0]);
  for (let i = 1; i < props.length; i++) vv.addProperty();
  if (props.length > 1) {
    await lib.sleep(300);
    for (let i = 1; i < props.length; i++) vv.renameProperty(i, props[i]);
  }
  await lib.sleep(200);
  for (const vc of container.variants.variantComponents()) {
    const parts = String(Object.values(vc.variantProps)[0] || '').split(' ');
    if (parts.length === props.length) {
      for (let i = 0; i < props.length; i++) vc.setVariantProperty(i, parts[i]);
    }
  }
  await lib.sleep(300);
  return container;
}

const summary = {};

// ------------------------------------------------------------ ContactAvatar
{
  const FAMILY = 'C/Media/ContactAvatar';
  if (penpot.library.local.components.some(c => c.name === lib.norm(FAMILY))) {
    summary.contactAvatar = 'skipped: exists';
  } else {
    // [mode, size, badge] — manifest axis order; sizes from manifest / inv:03 §5.1-§5.4 usages
    const COMBOS = [18, 20, 28, 32, 36, 38, 40, 42, 64].map(s => ['tinted-initial', s, 'none']);
    COMBOS.push(['identicon', 40, 'none'], ['identicon', 64, 'none'],
                ['tinted-initial', 40, 'account'], ['identicon', 40, 'account']);
    const comps = [];
    for (const [mode, s, badge] of COMBOS) {
      const b = penpot.createBoard();
      b.name = mode + ' ' + s + ' ' + badge;
      b.x = sx; b.y = SY; sx += Math.max(s, 40) + 40;
      b.resize(s, s);
      b.fills = [];
      if (mode === 'tinted-initial') {
        // light: bg hsl(H,32%,91%), letter hsl(H,40%,36%) bold 0.42×N ls −0.5 — inv:03 §5.1 (H=18 terracotta sample)
        disc(b, 'disc', s, '#EFE5E1', 0, 0);
        const fs = Math.round(s * 0.42);
        const { text: t } = lib.upsertText(b, 'letter', {
          text: 'A', size: fs, weight: 700, color: '#804D37',
          x: Math.max(0, Math.round(s * 0.5 - fs * 0.36)), y: Math.max(0, Math.round(s * 0.5 - fs * 0.7)),
        });
        t.letterSpacing = '-0.5'; // inv:03 §5.1
      } else {
        // nimiq-style Identicon, address-derived colors (identical both themes) — inv:03 §5.1, inv:02 A8
        disc(b, 'identicon:nimiq 0x8Ba1…BA72', s, '#E9B213', 0, 0);
      }
      if (badge === 'account') {
        // 16×16 circle info.base, 1.5px ring bg.raised, Wallet 9 white — bottom-right (−1,−1) — inv:03 §5.1
        const bg = disc(b, 'badge-account', 16, '#4267F4', s - 15, s - 15, { stroke: '#FFFFFF', strokeWidth: 1.5 });
        try { lib.bindToken(bg, 'color.info.base', ['fill']); } catch (e) {}
        icon(b, 'Wallet', 9, 2, '#FFFFFF', s - 15 + 3.5, s - 15 + 3.5);
      }
      comps.push(penpot.library.local.createComponent([b]));
    }
    const container = await combine(comps, FAMILY, ['mode', 'size', 'badge'], 2800);
    lib.chip(container, 'note', '8-hue set H∈{18 terracotta,210 slate,150 sage,340 rose,42 ochre,268 violet,122 green,190 cyan} hashed addr→name; dark: bg hsl(H,24%,22%) letter hsl(H,38%,74%)');
    lib.chip(container, 'note', 'identicon gated on pref + VALID address (partial input keeps tinted initial); enlargeable wraps Pressable, no nested button role');
    lib.chip(container, 'note', 'axes collapsed: mode×size×badge 2×9×2=36 → 13 documented combos (identicon at 40/64, account badge at 40)');
    summary.contactAvatar = comps.length;
  }
}

// ------------------------------------------------------------- WalletAvatar
{
  const FAMILY = 'C/Media/WalletAvatar';
  if (penpot.library.local.components.some(c => c.name === lib.norm(FAMILY))) {
    summary.walletAvatar = 'skipped: exists';
  } else {
    const comps = [];
    for (const style of ['initial', 'identicon']) {
      for (const s of [20, 32, 38, 40, 44]) { // manifest; size 20 per 05 §11.3 correction (browser pill)
        const b = penpot.createBoard();
        b.name = style + ' ' + s;
        b.x = sx; b.y = SY; sx += Math.max(s, 40) + 40;
        b.resize(s, s);
        b.fills = [];
        if (style === 'initial') {
          // circle accent.soft, letter = first char uppercased (fallback V) bold accent.base — inv:02 A9
          const c = disc(b, 'disc', s, '#FFF0EB', 0, 0);
          try { lib.bindToken(c, 'color.accent.soft', ['fill']); } catch (e) {}
          const fs = s === 20 ? 11 : Math.round(s * 0.34); // letterSize 11 at size 20 (browser.tsx:476) — inv:02 A9
          lib.upsertText(b, 'letter', {
            text: 'V', size: fs, weight: 700, color: '#E8572A',
            x: Math.max(0, Math.round(s * 0.5 - fs * 0.36)), y: Math.max(0, Math.round(s * 0.5 - fs * 0.7)),
          });
        } else {
          disc(b, 'identicon:nimiq 0x8Ba1…BA72', s, '#E9B213', 0, 0); // inv:02 A8 address-derived
        }
        comps.push(penpot.library.local.createComponent([b]));
      }
    }
    const container = await combine(comps, FAMILY, ['style', 'size'], 3700);
    lib.chip(container, 'note', 'usages: 44 Home account button · 40 switcher rows (enlargeable) · 38 receipt from-party · 20 browser pill letterSize 11 — inv:02 A9');
    lib.chip(container, 'note', 'enlargeable + valid address → IdenticonViewerSheet, selection haptic; deliberately NOT role=button (nested-button guard) — inv:02 A9');
    summary.walletAvatar = comps.length;
  }
}

// ------------------------------------------------------------------- QRCode
{
  const FAMILY = 'C/Media/QRCode';
  if (penpot.library.local.components.some(c => c.name === lib.norm(FAMILY))) {
    summary.qrCode = 'skipped: exists';
  } else {
    const comps = [];
    for (const s of [72, 120, 132, 140, 180, 196, 200]) { // manifest sizes
      const b = penpot.createBoard();
      b.name = String(s);
      b.x = sx; b.y = SY; sx += s + 40 + 40;
      b.resize(s + 40, s + 40); // quiet-zone plate pad 20 — inv:05 line 223 (receive)
      b.fills = [{ fillColor: '#FFFFFF', fillOpacity: 1 }]; // literal white in BOTH themes — inv:03 §7.2
      b.borderRadius = 16; // inv:05 line 223
      b.strokes = [{ strokeColor: '#ECEBE4', strokeWidth: 1, strokeAlignment: 'inner' }]; // 1px border.base — inv:05 line 223
      try { lib.bindToken(b, 'radius.xl', ['borderRadiusTopLeft', 'borderRadiusTopRight', 'borderRadiusBottomRight', 'borderRadiusBottomLeft']); } catch (e) {}
      const { rect } = lib.upsertRect(b, 'qr-matrix', { x: 20, y: 20, w: s, h: s, fill: '#000000' }); // color #000000 hardcoded — inv:03 §7.2
      rect.name = 'qr-matrix';
      comps.push(penpot.library.local.createComponent([b]));
    }
    const container = await combine(comps, FAMILY, ['size'], 4600);
    lib.chip(container, 'note', 'component itself = bare QR (single merged-h-run SVG path, EC level M); plate depicted at receive spec pad20 r16 1px border.base — inv:03 §7.2 + inv:05');
    lib.chip(container, 'note', 'share-card host plate differs: pad 18, radius.xl, 1px #ECEBE4 — inv:03 §7.4; QR must stay black-on-white for scanability (hosts always pin a white plate)');
    summary.qrCode = comps.length;
  }
}

return lib.done('34b-components-media', summary);
