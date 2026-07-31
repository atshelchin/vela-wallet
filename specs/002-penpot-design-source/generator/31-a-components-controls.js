// 31-a-components-controls.js — control families, part 1 of 2 (part 2 = 31-b):
//   C/Controls/SegmentedToggle       7 variants  // inv:02 B1, inv:01 §20, inv:01 §22-12
//   C/Controls/SlideToConfirmButton  5 variants  // inv:02 B2, inv:02 Z-7
//   C/Controls/VelaRefresh           6 variants  // inv:02 B3
//   C/Controls/FilterChip            2 variants  // inv:02 C4 chip recipe (NOT in manifest components[] — note chip records this)
// Motion-only behavior (press scale, idle nudge, chip spring, pull physics) is collapsed into
// motion: chips, never variants. Idempotency: family-level skip-if-exists (variant containers
// are not field-upsertable). Scratch row y=6000; final slots y=1000/1900/2800/3700.
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

// ============================================================ C/Controls/SegmentedToggle
// inv:02 B1 (anatomy/states) + inv:01 §20 (token bindings) + inv:01 §22-12 (raised-chip WCAG fix)
{
  const FAMILY = 'C/Controls/SegmentedToggle';
  if (famExists(FAMILY)) results.SegmentedToggle = { skipped: 'family exists' };
  else {
    const POS = ['first', 'second', 'third'];
    // realistic label sets from usage list — inv:02 B1 (HomeScreen tabs; ContactsManager)
    const SETS = { two: ['All', 'Favorites'], three: ['Activity', 'Assets', 'Connections'] };
    const ICONS = { All: 'icon:List 16/2', Favorites: 'icon:Star 16/2', Activity: 'icon:List 16/2', Assets: 'icon:Coins 16/2', Connections: 'icon:Link 16/2' };
    // segments(two/three) × active position; manifest badge/icon axes folded into `adorn`
    const plan = [
      ['two', 0, 'none'], ['two', 1, 'none'],
      ['three', 0, 'none'], ['three', 1, 'none'], ['three', 2, 'none'],
      ['three', 2, 'badge'], ['three', 0, 'icon'],
    ];
    const comps = [];
    for (const [setName, activeIdx, adorn] of plan) {
      const labels = SETS[setName];
      // width = padH 16×2 (inv:02 B1) + ~7px/char at text.base semibold (depiction estimate)
      const widths = labels.map((l, i) =>
        32 + Math.round(l.length * 7) + (adorn === 'icon' ? 22 : 0) + (adorn === 'badge' && i === activeIdx ? 24 : 0));
      const totalW = widths.reduce((a, w) => a + w, 0) + (labels.length - 1) * 2; // gap 2 (space.xs) — inv:02 B1
      const b = board(setName + ' ' + POS[activeIdx] + ' ' + adorn, totalW, 44); // transparent track, minHeight 44 WCAG floor — inv:02 B1, inv:01 §18
      let sx = 0;
      labels.forEach((label, i) => {
        const active = i === activeIdx;
        // active chip = bg.raised + 1px border.strong + shadow.sm + radius.full (drawn h/2=22)
        // — the WCAG 1.4.1 fix: bg.sunken chip measured ~1.04:1, invisible — inv:02 B1, inv:01 §22-12
        const seg = rct(b, 'segment ' + label, {
          x: sx, y: 0, w: widths[i], h: 44, radius: 22,
          fill: active ? '#FFFFFF' : undefined,
          stroke: active ? '#D8D6CE' : undefined, strokeWidth: 1, // border.strong — inv:02 B1
        });
        if (!active) seg.fills = []; // inactive segment is transparent — inv:02 B1
        if (active) { bind(seg, 'color.bg.raised', ['fill']); bind(seg, 'shadow.sm', ['shadow']); }
        let cx = sx + 16; // padH 16 (space.xl) — inv:02 B1
        if (adorn === 'icon') {
          // leading icon render-prop; SIZE UNSPECCED in inv:02 B1 → icon.base 16 / stroke 2 chosen (inv:01 §17)
          const ic = rct(b, ICONS[label] + ' ' + label, { x: cx, y: 14, w: 16, h: 16, stroke: active ? '#1A1A18' : '#6E6B62', strokeWidth: 2 });
          ic.fills = [];
          cx += 22;
        }
        // label text.base(13) semibold; inactive fg.muted → active fg.base, COLOR-ONLY change — inv:02 B1
        txt(b, 'label ' + label, { text: label, size: 13, weight: 600, color: active ? '#1A1A18' : '#6E6B62', x: cx, y: 14 });
        if (adorn === 'badge' && active) {
          // badge 18×18 r9 padX5 minW18, fill fg.base, text.xs(10) bold fg.inverse — inv:02 B1, inv:01 §20
          const bx = cx + Math.round(label.length * 7) + 6;
          const bd = rct(b, 'badge', { x: bx, y: 13, w: 18, h: 18, radius: 9, fill: '#1A1A18' });
          bind(bd, 'color.fg.base', ['fill']);
          txt(b, 'badge-count', { text: '2', size: 10, weight: 700, color: '#FFFFFF', x: bx + 6, y: 16 });
        }
        sx += widths[i] + 2; // gap 2 — inv:02 B1
      });
      comps.push(penpot.library.local.createComponent([b]));
    }
    const container = await combine(FAMILY, comps, ['segments', 'active', 'adorn'], 1000);
    lib.chip(container, 'motion', 'active chip springs position+width motion.spring; selection haptic; active auto-scrolls into view (-24); first placement instant'); // inv:02 B1
    lib.chip(container, 'note', 'manifest axes badge+icon folded into adorn; icon size unspecced in inv -> 16/2 chosen; labels never truncate, track h-scrolls'); // inv:02 B1
    lib.chip(container, 'note', 'active chip bg.raised+border.strong+shadow.sm is the WCAG 1.4.1 fix (bg.sunken ~1.04:1 invisible)'); // inv:01 §22-12
    results.SegmentedToggle = { variants: comps.length, variantErrors: errCount(container) };
  }
}

// ============================================================ C/Controls/SlideToConfirmButton
// inv:02 B2 (anatomy/states) + inv:02 Z-7 (raw committed border rgba)
{
  const FAMILY = 'C/Controls/SlideToConfirmButton';
  if (famExists(FAMILY)) results.SlideToConfirmButton = { skipped: 'family exists' };
  else {
    const W = 342, H = 60; // track h 60 — inv:02 B2; width unspecced (full parent) → 390 − 2×24 gutters (inv:01 §19)
    const plan = ['idle', 'dragging', 'committed', 'disabled', 'loading']; // manifest state axis
    const comps = [];
    for (const st of plan) {
      // track: full pill r30, bg.raised, 1px border.base; NEVER red — inv:02 B2
      // committed: fill success.soft + border rgba(45,142,95,0.30) (raw — inv:02 Z-7) depicted as composite #B3DAC6
      const b = board(st, W, H, st === 'committed' ? '#EDFAF2' : '#FFFFFF');
      b.borderRadius = 30; // radius.full drawn as h/2 — inv:02 B2
      b.strokes = [{ strokeColor: st === 'committed' ? '#B3DAC6' : '#ECEBE4', strokeWidth: 1, strokeAlignment: 'inner' }];
      bind(b, st === 'committed' ? 'color.success.soft' : 'color.bg.raised', ['fill']);
      if (st === 'disabled' || st === 'loading') b.opacity = 0.45; // opacity.disabled — inv:02 B2
      // label 15 semibold fg.muted, optically centered (insets 60); fades+drifts right with drag — inv:02 B2
      if (st === 'idle' || st === 'disabled') {
        txt(b, 'label', { text: 'Slide to send', size: 15, weight: 600, color: '#6E6B62', x: 122, y: 21 });
      } else if (st === 'dragging') {
        const t = txt(b, 'label', { text: 'Slide to send', size: 15, weight: 600, color: '#6E6B62', x: 136, y: 21 }); // +14px drift — inv:02 B2
        t.opacity = 0.3; // mid-fade (gone by 55% travel) — inv:02 B2
      }
      // knob 52 circle inset 4, accent fill, shadow.md; dragging ×1.06 (≈55) — inv:02 B2
      const kd = st === 'dragging' ? 55 : 52;
      const kx = (st === 'idle' || st === 'disabled') ? 4 : (st === 'dragging' ? 145 : W - 4 - 52); // parks far end when committed/loading
      const ky = st === 'dragging' ? 2 : 4;
      const knob = rct(b, 'knob', { x: kx, y: ky, w: kd, h: kd, radius: Math.round(kd / 2), fill: '#E8572A' });
      bind(knob, 'color.accent.base', ['fill']);
      bind(knob, 'shadow.md', ['shadow']);
      if (st === 'loading') {
        circ(b, 'spinner', 18, kx + 17, ky + 17, { stroke: '#FFFFFF', sw: 2 }); // small white spinner in parked knob — inv:02 B2
      } else {
        const ic = rct(b, 'icon:ArrowRight 22/2.6', { x: kx + 15, y: ky + 15, w: 22, h: 22, stroke: '#FFFFFF', strokeWidth: 2.6 }); // inv:02 B2
        ic.fills = [];
      }
      comps.push(penpot.library.local.createComponent([b]));
    }
    const container = await combine(FAMILY, comps, ['state'], 1900);
    lib.chip(container, 'motion', 'idle knob peeks 9px x3 (2.2s delay, killed on first grab); drag rubber-bands 12%/+10px, haptic at 60%; commit >=80% or flick v>900 past 45% -> 110ms to end + success haptic; track->success.soft 220ms; re-arm springs home'); // inv:02 B2
    lib.chip(container, 'note', 'committed border = raw rgba(45,142,95,0.30) escaping the token system (depicted #B3DAC6 composite)'); // inv:02 Z-7
    lib.chip(container, 'note', 'never red track (risk signaled above, not by commit surface); keep >=48pt above screen bottom (iOS app-switcher band); width = full parent'); // inv:02 B2
    results.SlideToConfirmButton = { variants: comps.length, variantErrors: errCount(container) };
  }
}

// ============================================================ C/Controls/VelaRefresh
// inv:02 B3 (indicator + pull physics)
{
  const FAMILY = 'C/Controls/VelaRefresh';
  if (famExists(FAMILY)) results.VelaRefresh = { skipped: 'family exists' };
  else {
    // manifest axis pulling-25%/75% collapsed to one `pulling` board (note chip); caption drawn where it reads
    const plan = [['idle', 'none'], ['pulling', 'none'], ['pulling', 'status'], ['armed', 'none'], ['refreshing', 'none'], ['refreshing', 'status']];
    // wrapper scales 0.55→1 with the pull; arc sweep 8%→70%, refreshing fixed 72% — inv:02 B3
    const GEO = {
      idle: { scale: 0.55, sweep: '8%' },
      pulling: { scale: 0.8, sweep: '40%' },
      armed: { scale: 1, sweep: '70%' },
      refreshing: { scale: 1, sweep: '72% spinning' },
    };
    const comps = [];
    for (const [st, cap] of plan) {
      const g = GEO[st];
      const b = board(st + ' ' + cap, 72, cap === 'status' ? 92 : 72); // 72 = trigger distance, used as the stage — inv:02 B3
      const plate = Math.round(44 * g.scale); // plate = RING+14 = 44 circle — inv:02 B3
      const ring = Math.round(30 * g.scale);  // ring 30, stroke 3 — inv:02 B3
      const pl = circ(b, 'plate 44@' + g.scale, plate, (72 - plate) / 2, (72 - plate) / 2, { fill: '#FFFFFF' }); // native bg.raised plate — inv:02 B3
      bind(pl, 'color.bg.raised', ['fill']);
      circ(b, 'ring-track 30/3 @60%', ring, (72 - ring) / 2, (72 - ring) / 2, { stroke: '#ECEBE4', sw: 3, opacity: 0.6 }); // border.base at 60% — inv:02 B3
      circ(b, 'arc:accent ' + g.sweep + ' caps-round', ring, (72 - ring) / 2, (72 - ring) / 2, { stroke: '#E8572A', sw: 3 }); // accent arc from 12 o'clock — inv:02 B3
      if (cap === 'status') {
        txt(b, 'caption', { text: 'Updated 2m ago', size: 10, weight: 500, color: '#8C887E', x: 2, y: 76 }); // text.xs medium fg.subtle — inv:02 B3
      }
      comps.push(penpot.library.local.createComponent([b]));
    }
    const container = await combine(FAMILY, comps, ['state', 'caption'], 2800);
    lib.chip(container, 'motion', 'trigger 72px: 1:1 track then 0.4 resistance (the resistance change IS the threshold); haptic on crossing, re-arms; spring-back under threshold; rests at 72 refreshing; arc 8-70% w/ pull then 72% spin 360deg/750ms; wrapper scale .55-1 rot 0-130deg'); // inv:02 B3
    lib.chip(container, 'platform', 'native plate bg.raised + raw shadow 0,2/0.08/6 (approx shadow.md, not token-bound); web plate transparent'); // inv:02 B3
    lib.chip(container, 'note', 'arc depicted as full ring — sweep % encoded in shape name; manifest pulling-25/75 collapsed to one pulling board; engages only at list top'); // inv:02 B3
    results.VelaRefresh = { variants: comps.length, variantErrors: errCount(container) };
  }
}

// ============================================================ C/Controls/FilterChip
// inv:02 C4 (TokenSelector category chips — the canonical soft filter pill; also inv:02 0b-10 accent discipline)
{
  const FAMILY = 'C/Controls/FilterChip';
  if (famExists(FAMILY)) results.FilterChip = { skipped: 'family exists' };
  else {
    const plan = [['selected', 'All'], ['unselected', 'Stable']]; // All/Stable/Gas/Other row — inv:02 C4
    const comps = [];
    for (const [st, label] of plan) {
      const sel = st === 'selected';
      // chip bg.sunken radius.full padH12 padV4; ACTIVE = NEUTRAL INK fill fg.base + label fg.inverse
      // (accent reserved for money-moving) — inv:02 C4, inv:02 0b-10
      const b = board(st, 24 + Math.round(label.length * 6), 22, sel ? '#1A1A18' : '#F5F3EF');
      b.borderRadius = 11; // radius.full drawn as h/2 — inv:02 C4
      bind(b, sel ? 'color.fg.base' : 'color.bg.sunken', ['fill']);
      txt(b, 'label', { text: label, size: 11, weight: 600, color: sel ? '#FFFFFF' : '#6E6B62', x: 12, y: 5 }); // text.sm semibold — inv:02 C4
      const fl = b.addFlexLayout();
      fl.dir = 'row'; fl.alignItems = 'center'; fl.justifyContent = 'center';
      comps.push(penpot.library.local.createComponent([b]));
    }
    const container = await combine(FAMILY, comps, ['state'], 3700);
    lib.chip(container, 'motion', 'selection haptic on change; vertical-only hitSlop 12'); // inv:02 C4
    lib.chip(container, 'note', 'NOT in manifest components[] — extracted as the canonical filter-pill recipe (TokenSelector category chips, inv:02 C4); selected is neutral ink NEVER accent'); // inv:02 0b-10
    results.FilterChip = { variants: comps.length, variantErrors: errCount(container) };
  }
}

return lib.done('31-a-components-controls', results);
