// 31-b-components-controls.js — control families, part 2 of 2 (part 1 = 31-a):
//   C/Rows/GasFeeCard          6 variants  // inv:02 C6
//   C/Rows/FeeTokenSelector    4 variants  // inv:02 C5, inv:02 Z-4
//   C/Primitives/Input         6 variants  // inv:02 A7 + appendix (input recipe)
//   C/Controls/WaveDock        4 variants  // inv:02 B4, inv:01 §19 §20
// Motion-only behavior collapsed into motion: chips (WaveDock manifest state axis default/pressed
// is press-scale-only → collapsed, recorded in a note: chip). Family-level skip-if-exists.
// Scratch row y=6000; final slots y=4600/5500/6400/7300 (continues 31-a's +900 sequence).
if (!storage.lib) throw new Error('run 10-lib.js first');
const lib = storage.lib;
await lib.open('03 Components');

const results = {};
const SCRATCH_Y = 6000; // assigned scratch row for this agent
let x = 5000;           // scratch x advances across all families in this file

const famExists = (family) => penpot.library.local.components.some(c => c.name === lib.norm(family));
const board = (name, w, h, fill) => {
  const b = penpot.createBoard();
  b.name = name;
  b.x = x; b.y = SCRATCH_Y; x += w + 60;
  b.resize(w, h);
  b.fills = fill ? [{ fillColor: fill, fillOpacity: 1 }] : [];
  return b;
};
const txt = (parent, name, spec) => lib.upsertText(parent, name, spec).text;
const rct = (parent, name, spec) => lib.upsertRect(parent, name, spec).rect;
const circ = (parent, name, d, dx, dy, o) => {
  const e = penpot.createEllipse();
  e.name = name;
  parent.appendChild(e);
  e.resize(d, d);
  e.x = parent.x + dx; e.y = parent.y + dy;
  e.fills = (o && o.fill) ? [{ fillColor: o.fill, fillOpacity: 1 }] : [];
  if (o && o.stroke) e.strokes = [{ strokeColor: o.stroke, strokeWidth: o.sw || 2 }];
  if (o && o.opacity !== undefined) e.opacity = o.opacity;
  return e;
};
const bind = (shape, token, props) => { try { lib.bindToken(shape, token, props); } catch (e) {} };
const CORNERS = ['borderRadiusTopLeft', 'borderRadiusTopRight', 'borderRadiusBottomRight', 'borderRadiusBottomLeft'];

const combine = async (family, comps, props, finalY) => {
  await lib.sleep(400);
  const container = penpot.createVariantFromComponents(comps.map(c => c.mainInstance()));
  await lib.sleep(500);
  container.name = family;
  container.x = 0; container.y = finalY;
  const vv = container.variants;
  vv.renameProperty(0, props[0]);
  for (let i = 1; i < props.length; i++) vv.addProperty();
  if (props.length > 1) {
    await lib.sleep(300);
    for (let i = 1; i < props.length; i++) vv.renameProperty(i, props[i]);
    await lib.sleep(200);
    // initial Property-1 value = board name "a b c" → split back out (template pattern)
    for (const vc of container.variants.variantComponents()) {
      const parts = String(Object.values(vc.variantProps)[0] || '').split(' ');
      if (parts.length === props.length) {
        for (let i = 0; i < parts.length; i++) vc.setVariantProperty(i, parts[i]);
      }
    }
  }
  await lib.sleep(300);
  return container;
};
const errCount = (c) => c.variants.variantComponents().filter(vc => vc.variantError).length;

// Shared fee-asset row — the de-boxed FeeTokenSelector row recipe: gap 8, padV 8, TokenLogo 32;
// left col symbol 13/600 fg.base + "Balance …" 10 fg.subtle; right col cost 13/600 numeric +
// "this tx spends" 10 fg.subtle; trailing 22 slot check/spinner/empty. — inv:02 C5
const feeRow = (b, dy, o) => {
  const lg = circ(b, 'logo:' + o.sym + ' 32', 32, 0, dy + 8, { fill: '#F5F3EF' }); // TokenLogo 32 placeholder — inv:02 C5
  bind(lg, 'color.bg.sunken', ['fill']);
  txt(b, 'symbol ' + o.sym, { text: o.sym, size: 13, weight: 600, color: '#1A1A18', x: 40, y: dy + 8 });
  txt(b, 'balance ' + o.sym, { text: 'Balance ' + o.bal, size: 10, weight: 400, color: '#8C887E', x: 40, y: dy + 27 });
  txt(b, 'cost ' + o.sym, { text: o.cost, size: 13, weight: 600, color: '#1A1A18', x: 228, y: dy + 8 }); // cost of THIS tx is the emphasis — inv:02 C5
  txt(b, 'spendlabel ' + o.sym, { text: 'this tx spends', size: 10, weight: 400, color: '#8C887E', x: 250, y: dy + 27 });
  if (o.trailing === 'check') {
    const ck = rct(b, 'icon:Check 18/2.6', { x: 318, y: dy + 15, w: 18, h: 18, stroke: '#E8572A', strokeWidth: 2.6 }); // accent check, NO filled tint — inv:02 C5
    ck.fills = [];
  } else if (o.trailing === 'spinner') {
    circ(b, 'spinner 16', 16, 319, dy + 16, { stroke: '#E8572A', sw: 2 }); // 16 accent spinner while applying — inv:02 C5
  }
};

// ============================================================ C/Rows/GasFeeCard
// inv:02 C6 (collapsed row + expandable fee-asset picker)
{
  const FAMILY = 'C/Rows/GasFeeCard';
  if (famExists(FAMILY)) results.GasFeeCard = { skipped: 'family exists' };
  else {
    // state × expandable × expanded — invalid cross-product cells skipped (note chip records the collapse)
    const plan = [
      ['estimating', 'no', 'no'],
      ['ready', 'no', 'no'],
      ['ready', 'yes', 'no'],
      ['ready', 'yes', 'yes'],
      ['refreshing', 'yes', 'no'],
      ['failed', 'no', 'no'],
    ];
    const comps = [];
    for (const [st, expandable, expanded] of plan) {
      // w 342 = sheet content width (390 − 2×24 gutters, inv:01 §19); row shares the sheet's left edge (no horizontal inset) — inv:02 C6
      const b = board(st + ' ' + expandable + ' ' + expanded, 342, expanded === 'yes' ? 184 : 52);
      // collapsed row: padV 12, space-between — inv:02 C6
      txt(b, 'label', { text: 'Est. Fee', size: 11, weight: 500, color: '#6E6B62', x: 0, y: 12 }); // text.sm medium fg.muted — inv:02 C6
      if (expandable === 'yes') {
        txt(b, 'subline', { text: 'Paid with USDC', size: 10, weight: 400, color: '#8C887E', x: 0, y: 30 }); // only when selectable — inv:02 C6
      }
      if (st === 'estimating') {
        txt(b, 'value', { text: 'Estimating…', size: 11, weight: 600, color: '#1A1A18', x: 250, y: 12 }); // inv:02 C6
      } else if (st === 'failed') {
        txt(b, 'value', { text: 'Estimate failed', size: 11, weight: 600, color: '#92600A', x: 216, y: 12 }); // warning.base — inv:02 C6
        const ic = rct(b, 'icon:RefreshCw 16/2', { x: 326, y: 10, w: 16, h: 16, stroke: '#92600A', strokeWidth: 2 }); // single warning refresh; tapping row retries — inv:02 C6
        ic.fills = [];
      } else {
        txt(b, 'value', { text: '~0.0012 POL', size: 11, weight: 600, color: '#1A1A18', x: 232, y: 12 }); // native amount is primary — inv:02 C6
        txt(b, 'fiat', { text: '≈ $0.003', size: 10, weight: 400, color: '#8C887E', x: 252, y: 30 }); // hidden below $0.005 — inv:02 C6
        if (st === 'refreshing') {
          circ(b, 'spinner 14', 14, 300, 11, { stroke: '#6E6B62', sw: 2 }); // spinner replaces refresh icon — inv:02 C6
        } else {
          const rc = rct(b, 'icon:RefreshCw 14/2', { x: 300, y: 11, w: 14, h: 14, stroke: '#6E6B62', strokeWidth: 2 }); // fg.muted — inv:02 C6
          rc.fills = [];
        }
        if (expandable === 'yes') {
          const ch = rct(b, expanded === 'yes' ? 'icon:ChevronUp 16/2' : 'icon:ChevronDown 16/2',
            { x: 322, y: 10, w: 16, h: 16, stroke: '#8C887E', strokeWidth: 2 }); // chevron only when >1 fee asset — inv:02 C6
          ch.fills = [];
        }
      }
      if (expanded === 'yes') {
        // expanded = FeeTokenSelector container below: 1px top hairline + UPPERCASE header — inv:02 C6, inv:02 C5
        const hl = rct(b, 'hairline-top', { x: 0, y: 52, w: 342, h: 1, fill: '#ECEBE4' }); // border.base — inv:02 C5
        bind(hl, 'color.border.base', ['fill']);
        const hd = txt(b, 'header', { text: 'PAY FEES WITH', size: 10, weight: 600, color: '#6E6B62', x: 0, y: 66 }); // 10/600 UPPERCASE ls 0.8 — inv:02 C5 (literal string not in inventory — depiction)
        hd.letterSpacing = '0.8';
        feeRow(b, 82, { sym: 'USDC', bal: '124.02', cost: '~0.021 USDC', trailing: 'check' });
        feeRow(b, 132, { sym: 'POL', bal: '12.4', cost: '~0.0012 POL', trailing: 'none' });
      }
      comps.push(penpot.library.local.createComponent([b]));
    }
    const container = await combine(FAMILY, comps, ['state', 'expandable', 'expanded'], 4600);
    lib.chip(container, 'note', 'axes collapsed: expanded=yes drawn only with expandable=yes + state=ready; estimating/failed drawn collapsed non-expandable'); // manifest cross-product prune
    lib.chip(container, 'note', 'auto-expands ONCE when a fee-asset choice first exists; auto-defaults to first affordable asset; fiat hidden below $0.005'); // inv:02 C6
    lib.chip(container, 'motion', 'failed: tapping the whole row retries the estimate'); // inv:02 C6
    results.GasFeeCard = { variants: comps.length, variantErrors: errCount(container) };
  }
}

// ============================================================ C/Rows/FeeTokenSelector
// inv:02 C5 (per-token fee row) + inv:02 Z-4 (check-only selected convention)
{
  const FAMILY = 'C/Rows/FeeTokenSelector';
  if (famExists(FAMILY)) results.FeeTokenSelector = { skipped: 'family exists' };
  else {
    const plan = [
      ['default', { sym: 'POL', bal: '12.4', cost: '~0.0012 POL', trailing: 'none' }],   // inv:02 C5
      ['selected', { sym: 'USDC', bal: '124.02', cost: '~0.021 USDC', trailing: 'check' }],
      ['pending', { sym: 'USDT', bal: '86.10', cost: '~0.021 USDT', trailing: 'spinner' }],
      ['insufficient', { sym: 'DAI', bal: '0.002', cost: '~0.021 DAI', trailing: 'none', dim: true }],
    ];
    const comps = [];
    for (const [st, row] of plan) {
      const b = board(st, 342, 48); // row: gap 8, padV 8, logo 32 → 48 tall — inv:02 C5
      feeRow(b, 0, row);
      if (row.dim) b.opacity = 0.4; // insufficient/busy rows opacity 0.4, taps blocked — inv:02 C5
      comps.push(penpot.library.local.createComponent([b]));
    }
    const container = await combine(FAMILY, comps, ['row'], 5500);
    lib.chip(container, 'note', 'container recipe (not per-row): 1px top hairline border.base, marginBottom 12; header 10/600 UPPERCASE ls0.8 fg.muted marginTop 12 / bottom 2'); // inv:02 C5
    lib.chip(container, 'note', 'selected = accent check ONLY, never a filled tint (app-wide picker convention; conflicting card-row styles flagged for ruling)'); // inv:02 C5, inv:02 Z-4
    lib.chip(container, 'note', 'cost formats: dust "< 0.0001", unknown "—"; shared by Send confirm AND dApp GasFeeCard'); // inv:02 C5
    results.FeeTokenSelector = { variants: comps.length, variantErrors: errCount(container) };
  }
}

// ============================================================ C/Primitives/Input
// inv:02 A7 (AutoGrow behavior + canonical caller "input recipe") + appendix axis row
{
  const FAMILY = 'C/Primitives/Input';
  if (famExists(FAMILY)) results.Input = { skipped: 'family exists' };
  else {
    const plan = [
      ['single', 'empty'], ['single', 'filled'], ['single', 'error'],
      ['multiline', 'empty'], ['multiline', 'filled'], ['multiline', 'error'],
    ];
    const comps = [];
    for (const [kind, st] of plan) {
      // recipe: bg.sunken, radius 12 (radius.lg), 1px border.base, padding 12–16 — inv:02 A7
      // single resting h 44 = AutoGrow minHeight default; multiline 96 (BugReport steps) — inv:02 A7
      const b = board(kind + ' ' + st, 342, kind === 'single' ? 44 : 96, '#F5F3EF');
      b.borderRadius = 12;
      // error styling UNSPECCED in inv:02 A7 — 1px color.error.base border chosen, flagged in note chip
      b.strokes = [{ strokeColor: st === 'error' ? '#C62828' : '#ECEBE4', strokeWidth: 1, strokeAlignment: 'inner' }];
      bind(b, 'color.bg.sunken', ['fill']);
      bind(b, 'radius.lg', CORNERS);
      if (kind === 'single') {
        if (st === 'empty') {
          txt(b, 'placeholder', { text: 'Address or name', size: 13, weight: 400, color: '#8C887E', x: 12, y: 14 }); // placeholder fg.subtle — inv:02 A7
        } else if (st === 'filled') {
          txt(b, 'value', { text: 'vitalik.eth', size: 13, weight: 500, color: '#1A1A18', x: 12, y: 14 }); // text base medium fg.base — inv:02 A7
        } else {
          txt(b, 'value', { text: '0x7a2E4c8B19f3', size: 13, weight: 500, zone: 'mono', color: '#1A1A18', x: 12, y: 14 }); // truncated/invalid address, mono
        }
      } else {
        if (st === 'empty') {
          txt(b, 'placeholder', { text: 'Describe what happened…', size: 13, weight: 400, color: '#8C887E', x: 12, y: 12 }); // BugReport description — inv:02 A7 usage
        } else {
          txt(b, 'value', { text: 'Fee shows "—" on Gnosis after retry.\nSend still works on Base and Arbitrum.', size: 13, weight: 400, color: '#1A1A18', x: 12, y: 12 });
        }
      }
      comps.push(penpot.library.local.createComponent([b]));
    }
    const container = await combine(FAMILY, comps, ['kind', 'state'], 6400);
    lib.chip(container, 'note', 'error visual UNSPECCED in inventory (axis exists, no styling documented) — depicted 1px color.error.base border; needs a ruling'); // inv:02 A7 + appendix
    lib.chip(container, 'platform', 'focus = web focus ring (2px inner bg gap + 4px accent outer), no border swap; input font >=16px on iOS web prevents Safari zoom'); // inv:01 §3, inv:02 C3
    lib.chip(container, 'note', 'AutoGrow: grows with content from minHeight 44, shrinks back; beyond maxHeight scrolls internally; text top-aligned'); // inv:02 A7
    results.Input = { variants: comps.length, variantErrors: errCount(container) };
  }
}

// ============================================================ C/Controls/WaveDock
// inv:02 B4 (anatomy) + inv:01 §19 (dockBarHeight/scanFabSize) + inv:01 §20 (token bindings)
{
  const FAMILY = 'C/Controls/WaveDock';
  if (famExists(FAMILY)) results.WaveDock = { skipped: 'family exists' };
  else {
    const comps = [];
    // pill geometry: padH 12 each side, center slot 56+8, gap 4 → pill w = (390−24−64−8)/2 = 147 — inv:02 B4
    // pill h = padV 16×2 + icon 22 = 54; row bottom = inset(0 depicted)+8 — inv:02 B4
    // --- bar (full assembly, FAB overhangs bar top by half) ---
    {
      const b = board('bar', 390, 114); // 114 = 86 bar + 28 FAB overhang — inv:01 §19, inv:02 B4
      const bar = rct(b, 'bar-surface', { x: 0, y: 28, w: 390, h: 86, fill: '#FFFFFF' }); // bg.raised full-bleed — inv:02 B4
      bind(bar, 'color.bg.raised', ['fill']);
      const hl = rct(b, 'hairline-top', { x: 0, y: 28, w: 390, h: 1, fill: '#ECEBE4' }); // 1px top border.base — inv:02 B4
      bind(hl, 'color.border.base', ['fill']);
      const send = rct(b, 'pill-send', { x: 12, y: 52, w: 147, h: 54, fill: '#E8572A', radius: 16, stroke: '#E8572A', strokeWidth: 1 }); // accent fill+border, radius.xl — inv:02 B4, inv:01 §20
      bind(send, 'color.accent.base', ['fill']); bind(send, 'radius.xl', CORNERS);
      const si = rct(b, 'icon:ArrowUpRight 22/2.2', { x: 50, y: 68, w: 22, h: 22, stroke: '#FFFFFF', strokeWidth: 2.2 }); si.fills = []; // icon matches label color — inv:02 B4
      txt(b, 'label-send', { text: 'Send', size: 17, weight: 700, color: '#FFFFFF', x: 80, y: 69 }); // text.xl BOLD for white-on-accent 3:1 — inv:02 B4
      const recv = rct(b, 'pill-receive', { x: 231, y: 52, w: 147, h: 54, fill: '#FAFAF8', radius: 16, stroke: '#D8D6CE', strokeWidth: 1 }); // bg.base + border.strong (NOT sunken) — inv:02 B4
      bind(recv, 'color.bg.base', ['fill']); bind(recv, 'radius.xl', CORNERS);
      const ri = rct(b, 'icon:ArrowDownLeft 22/2.2', { x: 259, y: 68, w: 22, h: 22, stroke: '#1A1A18', strokeWidth: 2.2 }); ri.fills = [];
      txt(b, 'label-receive', { text: 'Receive', size: 17, weight: 600, color: '#1A1A18', x: 289, y: 69 }); // text.xl semibold fg.base — inv:02 B4
      const fab = circ(b, 'fab-circle', 56, 167, 0, { fill: '#FFFFFF', stroke: '#ECEBE4', sw: 1 }); // 56 circle bg.raised + border.base + shadow.md — inv:02 B4, inv:01 §19
      bind(fab, 'color.bg.raised', ['fill']); bind(fab, 'shadow.md', ['shadow']);
      const fi = rct(b, 'icon:ScanLine 26/2', { x: 182, y: 15, w: 26, h: 26, stroke: '#1A1A18', strokeWidth: 2 }); fi.fills = []; // icon-only, no label — inv:02 B4
      comps.push(penpot.library.local.createComponent([b]));
    }
    // --- send pill alone ---
    {
      const b = board('send', 147, 54, '#E8572A');
      b.borderRadius = 16;
      b.strokes = [{ strokeColor: '#E8572A', strokeWidth: 1, strokeAlignment: 'inner' }]; // both pills carry a border so heights match — inv:02 B4
      bind(b, 'color.accent.base', ['fill']); bind(b, 'radius.xl', CORNERS);
      const ic = rct(b, 'icon:ArrowUpRight 22/2.2', { x: 38, y: 16, w: 22, h: 22, stroke: '#FFFFFF', strokeWidth: 2.2 }); ic.fills = [];
      txt(b, 'label', { text: 'Send', size: 17, weight: 700, color: '#FFFFFF', x: 68, y: 17 });
      comps.push(penpot.library.local.createComponent([b]));
    }
    // --- receive pill alone ---
    {
      const b = board('receive', 147, 54, '#FAFAF8');
      b.borderRadius = 16;
      b.strokes = [{ strokeColor: '#D8D6CE', strokeWidth: 1, strokeAlignment: 'inner' }]; // border.strong — inv:02 B4
      bind(b, 'color.bg.base', ['fill']); bind(b, 'radius.xl', CORNERS);
      const ic = rct(b, 'icon:ArrowDownLeft 22/2.2', { x: 28, y: 16, w: 22, h: 22, stroke: '#1A1A18', strokeWidth: 2.2 }); ic.fills = [];
      txt(b, 'label', { text: 'Receive', size: 17, weight: 600, color: '#1A1A18', x: 58, y: 17 });
      comps.push(penpot.library.local.createComponent([b]));
    }
    // --- scan fab alone ---
    {
      const b = board('fab', 56, 56, '#FFFFFF');
      b.borderRadius = 28; // circle — inv:02 B4
      b.strokes = [{ strokeColor: '#ECEBE4', strokeWidth: 1, strokeAlignment: 'inner' }]; // border.base — inv:02 B4
      bind(b, 'color.bg.raised', ['fill']); bind(b, 'shadow.md', ['shadow']);
      const ic = rct(b, 'icon:ScanLine 26/2', { x: 15, y: 15, w: 26, h: 26, stroke: '#1A1A18', strokeWidth: 2 }); ic.fills = [];
      comps.push(penpot.library.local.createComponent([b]));
    }
    const container = await combine(FAMILY, comps, ['element'], 7300);
    lib.chip(container, 'motion', 'press = haptic light + spring scale 0.97 (pills) / 0.92 (FAB), motion.spring'); // inv:02 B4
    lib.chip(container, 'note', 'manifest state axis (default/pressed) collapsed — press is scale-only motion, no rest-state visual delta'); // inv:02 B4 + chunk convention
    lib.chip(container, 'note', 'Receive = bg.base + border.strong NOT bg.sunken (sunken-on-raised ~1.15:1 in dark mode); bar h 86 + bottom safe inset; system tab bar hidden — WaveDock IS the bottom bar; screens reserve 86+inset scroll clearance'); // inv:01 §2.2 gotcha, inv:01 §19, inv:02 B4
    results.WaveDock = { variants: comps.length, variantErrors: errCount(container) };
  }
}

return lib.done('31-b-components-controls', results);
