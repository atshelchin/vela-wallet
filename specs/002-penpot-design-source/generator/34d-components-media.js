// 34d-components-media.js — media components 4/4: C/Media/ReceiveShareCard +
// C/Sheets/ExtensionSignSheet + C/Media/ParallelSpaceBadge.
// ReceiveShareCard: ALWAYS-light hardcoded 360w screenshot/share card (white, r28, padH28
// padTop24 padBottom22); brand header, bordered QR box (pad 18, QR 196), name, request|address
// content, getvela.app footer — inv:03 §7.4. Web canvas twin must stay in sync (canvas font
// "Inter" drift flagged inv:02 Z.7).
// ExtensionSignSheet: Safari-extension hand-off confirmation — custom bottom-sheet overlay
// (deliberately NOT an RN Modal), bg.raised top-r24 + top hairline, glyph disc 56 + outcome
// color grammar, Done accent only for positive outcomes — inv:03 §7.8. Copy = signHandoff.* (en).
// ParallelSpaceBadge: floating test-env pill, hardcoded violet #7c3aed, DELIBERATELY off-brand
// and untokenized — inv:03 §6. Single component (no axes).
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

// --------------------------------------------------------- ReceiveShareCard
{
  const FAMILY = 'C/Media/ReceiveShareCard';
  if (penpot.library.local.components.some(c => c.name === lib.norm(FAMILY))) {
    summary.receiveShareCard = 'skipped: exists';
  } else {
    const comps = [];
    for (const variant of ['request', 'address']) {
      const b = penpot.createBoard();
      b.name = variant;
      b.x = sx; b.y = SY; sx += 360 + 40;
      b.resize(360, variant === 'request' ? 448 : 528);
      b.fills = [{ fillColor: '#FFFFFF', fillOpacity: 1 }]; // always-light white — inv:03 §7.4
      b.borderRadius = 28; // inv:03 §7.4
      // brand header: app icon 24 (r6) + "Vela Wallet" text.base bold #16161A — inv:03 §7.4
      lib.upsertRect(b, 'image:app-icon vela', { x: 126, y: 24, w: 24, h: 24, radius: 6, fill: '#E8572A' });
      lib.upsertText(b, 'brand', { text: 'Vela Wallet', size: 13, weight: 700, color: '#16161A', x: 158, y: 29 });
      // QR box: 1px #ECEBE4 border, radius.xl, pad 18, white; QR 196 — inv:03 §7.4
      lib.upsertRect(b, 'qr-plate', { x: 64, y: 64, w: 232, h: 232, radius: 16, fill: '#FFFFFF', stroke: '#ECEBE4', strokeWidth: 1 });
      lib.upsertRect(b, 'qr-matrix', { x: 82, y: 82, w: 196, h: 196, fill: '#000000' }); // black-on-white — inv:03 §7.2
      lib.upsertText(b, 'name', { text: 'Alex Chen', size: 20, weight: 700, color: '#16161A', x: 133, y: 310 }); // text.2xl bold — inv:03 §7.4
      if (variant === 'request') {
        // summary line text.base semibold accent + short address — inv:03 §7.4 (example verbatim from inventory)
        lib.upsertText(b, 'summary', { text: 'Request 12 ETH · Ethereum', size: 13, weight: 600, color: '#E8572A', x: 98, y: 348 });
        lib.upsertText(b, 'address', { text: '0x8Ba1f109…d64DBA72', size: 11, weight: 500, zone: 'mono', color: '#8A8A96', x: 116, y: 374 }); // 10…8 sm mono medium — inv:03 §7.4
        lib.upsertText(b, 'footer', { text: 'getvela.app', size: 11, weight: 600, color: '#B5B5BE', x: 150, y: 410 }); // sm semibold mt18 — inv:03 §7.4
      } else {
        lib.upsertText(b, 'address', { text: '0x8Ba1f109…d64DBA72', size: 11, weight: 500, zone: 'mono', color: '#8A8A96', x: 116, y: 348 });
        lib.upsertText(b, 'networks-label', { text: '12 supported networks', size: 10, weight: 500, color: '#B0ADA5', x: 128, y: 372 }); // xs medium — inv:03 §7.4
        // 2-col wrap grid of network chips: 48.5% w, #F5F3EF, radius.full, padH10 padV7, ChainLogo 18 + name xs semibold — inv:03 §7.4
        const CHIPS = [['Ethereum', '#627EEA'], ['Base', '#0052FF'], ['Arbitrum', '#28A0F0'], ['Gnosis', '#04795B']]; // brand colors src/models/chains.ts
        for (let i = 0; i < CHIPS.length; i++) {
          const cx = 28 + (i % 2) * 157, cy = 394 + Math.floor(i / 2) * 40;
          lib.upsertRect(b, 'net-chip-' + i, { x: cx, y: cy, w: 147, h: 32, radius: 16, fill: '#F5F3EF' });
          disc(b, 'image:chain-logo ' + CHIPS[i][0] + ' 18', 18, CHIPS[i][1], cx + 10, cy + 7);
          lib.upsertText(b, 'net-chip-label-' + i, { text: CHIPS[i][0], size: 10, weight: 600, color: '#16161A', x: cx + 34, y: cy + 10 });
        }
        lib.upsertText(b, 'footer', { text: 'getvela.app', size: 11, weight: 600, color: '#B5B5BE', x: 150, y: 492 });
      }
      comps.push(penpot.library.local.createComponent([b]));
    }
    const container = await combine(comps, FAMILY, ['variant'], 7300);
    lib.chip(container, 'note', 'ALWAYS light, values hardcoded (screenshot/share asset); web draws twin on canvas — keep in sync (canvas font "Inter" drift flagged inv:02 Z.7)');
    lib.chip(container, 'note', 'chip width 48.5%; "N supported networks" = live chain count (12); 4 of 12 chips depicted');
    summary.receiveShareCard = comps.length;
  }
}

// -------------------------------------------------------- ExtensionSignSheet
{
  const FAMILY = 'C/Sheets/ExtensionSignSheet';
  if (penpot.library.local.components.some(c => c.name === lib.norm(FAMILY))) {
    summary.extensionSignSheet = 'skipped: exists';
  } else {
    // outcome color grammar — inv:03 §7.8 + copy signHandoff.* (en)
    const OUTCOMES = {
      'signed':          { disc: '#EDFAF2', glyph: 'Check', gcol: '#2D8E5F', title: 'Signed', accent: true },
      'rejected':        { disc: '#F5F3EF', glyph: 'X', gcol: '#8C887E', title: 'Cancelled', accent: false },
      'expired':         { disc: '#F5F3EF', glyph: 'AlertTriangle', gcol: '#8C887E', title: 'This signing request expired', accent: false },
      'unknown':         { disc: '#FFF8F0', glyph: 'AlertTriangle', gcol: '#92600A', title: 'Check this in Vela Activity', accent: false },
      'one-tap-enabled': { disc: '#EDFAF2', glyph: 'Check', gcol: '#2D8E5F', title: 'One-tap signing enabled', accent: true },
    };
    const comps = [];
    for (const [outcome, o] of Object.entries(OUTCOMES)) {
      const b = penpot.createBoard();
      b.name = outcome;
      b.x = sx; b.y = SY; sx += 390 + 40;
      b.resize(390, 300);
      b.fills = [{ fillColor: '#FFFFFF', fillOpacity: 1 }]; // bg.raised — inv:03 §7.8
      b.borderRadius = 24; // top radius 24 (Penpot single value; top-only in app — note chip)
      b.strokes = [{ strokeColor: '#ECEBE4', strokeWidth: 1, strokeAlignment: 'inner' }]; // hairline top border.base — inv:03 §7.8
      try { lib.bindToken(b, 'color.bg.raised', ['fill']); } catch (e) {}
      // grab handle 36×5 r3 border.strong@80% — inv:03 §7.8
      const { rect: handle } = lib.upsertRect(b, 'handle', { x: 177, y: 8, w: 36, h: 5, radius: 3, fill: '#D8D6CE' });
      handle.opacity = 0.8;
      // glyph disc 56 r28 + glyph 26 strokeWidth 2.75 — inv:03 §7.8
      disc(b, 'glyph-disc', 56, o.disc, 167, 36);
      icon(b, o.glyph, 26, 2.75, o.gcol, 182, 51);
      lib.upsertText(b, 'title', { text: o.title, size: 17, weight: 700, color: '#1A1A18', x: 195 - Math.round(o.title.length * 4.4), y: 110 }); // text.xl bold ink — inv:03 §7.8
      // hint text.base regular muted centered lh20 maxW300 — inv:03 §7.8
      if (outcome === 'one-tap-enabled') {
        lib.upsertText(b, 'hint', { text: 'Signing in Safari will now open Vela directly.', size: 13, weight: 400, color: '#6E6B62', x: 55, y: 142 }); // signHandoff.oneTapHint (wrapped)
        lib.upsertText(b, 'hint-2', { text: 'Tap ‹ Safari (top-left) to go back.', size: 13, weight: 400, color: '#6E6B62', x: 90, y: 162 });
      } else {
        lib.upsertText(b, 'hint', { text: 'Return to Safari — this page won’t refresh', size: 13, weight: 400, color: '#6E6B62', x: 68, y: 142 }); // signHandoff.returnHint
      }
      // Done: stretch padV16 r15 — accent+white ONLY for positive outcomes; neutral bg.sunken+ink otherwise — inv:03 §7.8
      lib.upsertRect(b, 'btn-done', { x: 32, y: 208, w: 326, h: 53, radius: 15, fill: o.accent ? '#E8572A' : '#F5F3EF' });
      lib.upsertText(b, 'btn-done-label', { text: 'Done', size: 15, weight: 600, color: o.accent ? '#FFFFFF' : '#1A1A18', x: 178, y: 225 }); // signHandoff.done
      comps.push(penpot.library.local.createComponent([b]));
    }
    const container = await combine(comps, FAMILY, ['outcome'], 8200);
    lib.chip(container, 'motion', 'signed auto-dismisses after 2.6s, other outcomes persist; Done pressed opacity 0.92; haptics matched per outcome');
    lib.chip(container, 'note', 'custom overlay, deliberately NOT RN Modal (modal-over-modal guard); dim rgba(0,0,0,0.4) tap-outside dismiss; shadow y-8 blur24 op0.14; radius is TOP-only 24 + top hairline');
    lib.chip(container, 'note', 'headless while idle/connecting/signing (offscreen status line only); color never overstates: accent Done only for signed/one-tap-enabled');
    summary.extensionSignSheet = comps.length;
  }
}

// ------------------------------------------------------- ParallelSpaceBadge
{
  const FAMILY = 'C/Media/ParallelSpaceBadge';
  if (penpot.library.local.components.some(c => c.name === lib.norm(FAMILY))) {
    summary.parallelSpaceBadge = 'skipped: exists';
  } else {
    const b = penpot.createBoard();
    b.name = 'pill';
    b.x = sx; b.y = SY; sx += 300;
    b.resize(252, 24); // row gap6 padH12 padV5 — inv:03 §6
    b.fills = [{ fillColor: '#7c3aed', fillOpacity: 1 }]; // hardcoded violet, deliberately off-brand — inv:03 §6
    b.borderRadius = 12; // radius 999 pill — inv:03 §6
    icon(b, 'FlaskConical', 12, 2, '#FFFFFF', 12, 6); // FlaskConical 12 white — inv:03 §6
    const { text: t1 } = lib.upsertText(b, 'label', { text: 'PARALLEL SPACE', size: 11, weight: 800, color: '#FFFFFF', x: 30, y: 6 }); // 11px w800 ls0.6 white — inv:03 §6
    t1.letterSpacing = '0.6';
    const { text: t2 } = lib.upsertText(b, 'sub', { text: 'mock passkey · test', size: 10, weight: 600, color: '#FFFFFF', x: 146, y: 7 }); // 10px w600 white@80% — inv:03 §6
    t2.opacity = 0.8;
    const comp = penpot.library.local.createComponent([b]);
    comp.name = FAMILY;
    await lib.sleep(300);
    const mi = comp.mainInstance();
    mi.x = FX; mi.y = 9100; // single-component page slot
    lib.chip(mi, 'note', 'hardcoded violet #7c3aed DELIBERATELY off-brand + untokenized: must look identical and alien in BOTH themes (test-env marker); shadow y2 blur8 op0.25');
    lib.chip(mi, 'note', 'absolute top safeTop+6 centered zIndex 9999, wrapper pointerEvents box-none; tap opens /parallel hub; renders null unless global flag set');
    summary.parallelSpaceBadge = 1;
  }
}

return lib.done('34d-components-media', summary);
