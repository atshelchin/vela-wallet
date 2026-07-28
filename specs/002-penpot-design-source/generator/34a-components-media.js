// 34a-components-media.js — media components 1/4: C/Media/ChainLogo + C/Media/TokenLogo.
// ChainLogo: circular network logo (default 32, transparent bg); fallback = colored disc from the
// network's iconBg/iconColor + label 0.3×size bold — inv:03 §7.7. Size axis ADDED from documented
// usages (manifest axis is fallback-only): 16 (inv:02 D9 line 615, inv:03 §2.1 line 126) · 18
// (inv:02 C2 line 384, inv:03 §7.4) · 22 (inv:06 line 253) · 26 (inv:02 D18 line 738) · 32
// (inv:03 §7.7 default, inv:02 D15 line 705) · 36 (inv:02 D6 line 563, inv:06 line 148) · 40
// (inv:02 D14 line 689, inv:07 line 336).
// TokenLogo: ordered-fallback image → letter disc (hsl hash of symbol, NOT dark-aware — flagged)
// + optional chain badge at 45% of size, 2px bg.base ring, bottom-right (−2,−2) — inv:03 §7.6.
// badge×fallback×size cross-product (2×2×10 = 40) trimmed to 17 documented combos (note chip).
// Idempotency: family-level skip-if-exists (variant containers are not field-upsertable).
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
  // initial Property-1 value = board name "v1 v2 …" → split back out (template pattern, 30-*.js)
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

// ---------------------------------------------------------------- ChainLogo
{
  const FAMILY = 'C/Media/ChainLogo';
  if (penpot.library.local.components.some(c => c.name === lib.norm(FAMILY))) {
    summary.chainLogo = 'skipped: exists';
  } else {
    const SIZES = [16, 18, 22, 26, 32, 36, 40]; // documented usages, header comment anchors
    const comps = [];
    for (const fb of ['image', 'colored-disc']) {
      for (const s of SIZES) {
        const b = penpot.createBoard();
        b.name = fb + ' ' + s;
        b.x = sx; b.y = SY; sx += Math.max(s, 40) + 40;
        b.resize(s, s);
        b.fills = []; // transparent bg, always circular — inv:03 §7.7
        if (fb === 'image') {
          // remote logo depiction; brand color = Ethereum iconColor — src/models/chains.ts:46
          disc(b, 'image:chain-logo Ethereum', s, '#627EEA', 0, 0);
        } else {
          // fallback disc: network iconBg + iconColor label — inv:03 §7.7 (Gnosis sample, chains.ts:88)
          disc(b, 'disc', s, '#E8F5F0', 0, 0);
          const fs = Math.max(5, Math.round(s * 0.3)); // label 0.3×size bold — inv:03 §7.7
          lib.upsertText(b, 'label', {
            text: 'xDAI', size: fs, weight: 700, color: '#04795B',
            x: Math.max(0, Math.round(s * 0.5 - fs * 1.1)), y: Math.max(0, Math.round(s * 0.5 - fs * 0.7)),
          });
        }
        comps.push(penpot.library.local.createComponent([b]));
      }
    }
    const container = await combine(comps, FAMILY, ['fallback', 'size'], 1000);
    lib.chip(container, 'note', 'size axis added from documented usages (manifest axis = fallback only); default size 32');
    lib.chip(container, 'note', 'custom networks store fixed light grays iconColor #888888 / iconBg #F0F0F0 (SettingsScreen.tsx:658-659) — bright disc in dark mode; flagged inv:02 Z.7 + inv:09');
    summary.chainLogo = comps.length;
  }
}

// ---------------------------------------------------------------- TokenLogo
{
  const FAMILY = 'C/Media/TokenLogo';
  if (penpot.library.local.components.some(c => c.name === lib.norm(FAMILY))) {
    summary.tokenLogo = 'skipped: exists';
  } else {
    // [badge, fallback, size] — manifest axis order; combos = documented usages only
    const COMBOS = [];
    for (const s of [20, 24, 28, 30, 32, 36, 40, 44, 46, 52]) COMBOS.push(['none', 'image', s]); // manifest sizes
    for (const s of [20, 32, 44, 52]) COMBOS.push(['chain', 'image', s]); // chain-badged hosts — inv:03 §7.5/§7.6, inv:02 C1
    COMBOS.push(['none', 'letter-disc', 32], ['none', 'letter-disc', 44], ['chain', 'letter-disc', 44]);
    const comps = [];
    for (const [badge, fb, s] of COMBOS) {
      const b = penpot.createBoard();
      b.name = badge + ' ' + fb + ' ' + s;
      b.x = sx; b.y = SY; sx += Math.max(s, 40) + 40;
      b.resize(s, s);
      b.fills = [];
      if (fb === 'image') {
        // remote token image depiction (USDC sample); load placeholder = bg.sunken — inv:03 §7.6
        disc(b, 'image:token-logo USDC', s, '#2775CA', 0, 0);
      } else {
        // letter disc: bg hsl(H,30%,93%), letter hsl(H,45%,55%) bold 0.42×size — inv:03 §7.6 (sample H=210)
        disc(b, 'disc', s, '#E8EDF3', 0, 0);
        const fs = Math.round(s * 0.42);
        lib.upsertText(b, 'letter', {
          text: 'U', size: fs, weight: 700, color: '#598CC0',
          x: Math.max(0, Math.round(s * 0.5 - fs * 0.36)), y: Math.max(0, Math.round(s * 0.5 - fs * 0.7)),
        });
      }
      if (badge === 'chain') {
        const bd = Math.round(s * 0.45); // ChainLogo at 45% of size — inv:03 §7.6
        // 2px ring in bg.base so it reads as a separate disc; true offset (−2,−2) bleeds 2px past
        // the circle — board clips, offset recorded here — inv:03 §7.6
        disc(b, 'badge-ring', bd + 4, '#FAFAF8', s - bd - 2, s - bd - 2);
        disc(b, 'image:chain-logo Ethereum badge', bd, '#627EEA', s - bd, s - bd); // chains.ts:46
      }
      comps.push(penpot.library.local.createComponent([b]));
    }
    const container = await combine(comps, FAMILY, ['badge', 'fallback', 'size'], 1900);
    lib.chip(container, 'note', 'axes collapsed: badge×fallback×size 2×2×10=40 → 17 documented combos (letter-disc only at 32/44, chain badge at 20/32/44/52)');
    lib.chip(container, 'note', 'letter-disc hue = hash(symbol), NOT dark-mode-aware (flagged inv:03 §7.6 open question); image placeholder bg.sunken while loading');
    summary.tokenLogo = comps.length;
  }
}

return lib.done('34a-components-media', summary);
