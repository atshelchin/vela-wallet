// 24-type-specimens.js — T011b: typography specimens + scale visualizations on `02 Tokens & Type`.
// inv:01 §5-§13.
if (!storage.lib) throw new Error('run 10-lib.js first');
const lib = storage.lib;
const PAGE = '02 Tokens & Type';
let created = 0;
const track = (r) => { if (r.created) created++; return r; };

// Board: typography
{
  const { board: b } = await lib.upsertBoard(PAGE, 'D/tokens/type', lib.docGeom(0, 1, 900));
  track(lib.upsertText(b, 'TYPE/title', { text: 'Typography — Plus Jakarta Sans (code export name: `inter`)', size: 20, weight: 700, x: 24, y: 24 }));
  const SIZES = [['text.xs',10],['text.sm',11],['text.base',13],['text.lg',15],['text.xl',17],['text.2xl',20],['text.3xl',26],['text.4xl',32],['text.5xl',40]];
  let y = 72;
  for (const [name, px] of SIZES) {
    track(lib.upsertText(b, 'TYPE/s/' + name, { text: name + ' · ' + px + 'px — Send 0.042 ETH to vitalik.eth', size: px, weight: 400, x: 24, y }));
    y += px + 22;
  }
  y += 12;
  const WEIGHTS = [['weight.regular',400],['weight.medium',500],['weight.semibold',600],['weight.bold',700]];
  for (const [name, w] of WEIGHTS) {
    track(lib.upsertText(b, 'TYPE/w/' + name, { text: name + ' (' + w + ') — Balance $12,847.20', size: 15, weight: w, x: 24, y }));
    y += 34;
  }
  y += 12;
  track(lib.upsertText(b, 'TYPE/mono', { text: 'font.mono — 0x1F98431c8aD98523631AE4a59f267346ea31F984', size: 12, zone: 'mono', weight: 500, x: 24, y }));
  lib.chip(b, 'note', 'font.mono depicted in IBM Plex Mono; runtime = iOS Menlo / Android monospace / web ui-monospace stack');
  lib.chip(b, 'note', 'font.numeric = Plus Jakarta 400 (tabular figures); rebuilds SHOULD use tabular alignment for balance columns');
  lib.chip(b, 'note', 'rendered px = base × user scale 0.82–1.35 × web 1.2 boost (× OS scale on native)');
}

// Board: spacing / radius / shadows / icon sizes
{
  const { board: b } = await lib.upsertBoard(PAGE, 'D/tokens/scales', lib.docGeom(1000, 0, 760));
  track(lib.upsertText(b, 'SC/title', { text: 'Scales — 4px spacing grid · radius · shadows · icon sizes', size: 20, weight: 700, x: 24, y: 24 }));
  const SPACE = [['space.xs',2],['space.sm',4],['space.md',8],['space.lg',12],['space.xl',16],['space.2xl',20],['space.3xl',24],['space.4xl',32],['space.5xl',48]];
  let y = 72;
  for (const [name, v] of SPACE) {
    track(lib.upsertRect(b, 'SC/sp/' + name, { x: 130, y: y + 2, w: Math.max(v * 6, 4), h: 10, radius: 2, fill: '#E8572A' }));
    track(lib.upsertText(b, 'SC/spl/' + name, { text: name + ' · ' + v, size: 10, weight: 500, x: 24, y }));
    y += 26;
  }
  y += 18;
  track(lib.upsertText(b, 'SC/rtitle', { text: 'radius', size: 12, weight: 600, x: 24, y })); y += 24;
  const RAD = [['none',0],['sm',4],['md',8],['lg',12],['xl',16],['2xl',20],['full',9999]];
  RAD.forEach(([n, v], i) => {
    track(lib.upsertRect(b, 'SC/r/' + n, { x: 24 + i * 104, y, w: 56, h: 56, radius: Math.min(v, 28), fill: '#F5F3EF', stroke: '#D8D6CE' }));
    track(lib.upsertText(b, 'SC/rl/' + n, { text: 'radius.' + n, size: 9, weight: 500, color: '#6E6B62', x: 24 + i * 104, y: y + 62 }));
  });
  y += 96;
  track(lib.upsertText(b, 'SC/shtitle', { text: 'shadows (ink fixed #1A1A18 both modes)', size: 12, weight: 600, x: 24, y })); y += 24;
  const SH = [['shadow.sm','0 1 3 @ 4%'],['shadow.md','0 2 8 @ 6%'],['shadow.lg','0 4 16 @ 8%']];
  SH.forEach(([n, d], i) => {
    const r = track(lib.upsertRect(b, 'SC/sh/' + n, { x: 24 + i * 170, y, w: 140, h: 72, radius: 16, fill: '#FFFFFF' }));
    try { lib.bindToken(r.rect, n, ['shadow']); } catch (e) {}
    track(lib.upsertText(b, 'SC/shl/' + n, { text: n + ' · ' + d, size: 9, weight: 500, color: '#6E6B62', x: 24 + i * 170, y: y + 78 }));
  });
  y += 120;
  track(lib.upsertText(b, 'SC/ictitle', { text: 'icon sizes (Lucide only, stroke 2 default)', size: 12, weight: 600, x: 24, y })); y += 24;
  const IC = [['xs',12],['sm',14],['base',16],['md',18],['lg',20],['xl',26],['2xl',30],['3xl',36]];
  let ix = 24;
  for (const [n, v] of IC) {
    track(lib.upsertRect(b, 'SC/ic/' + n, { x: ix, y: y + (36 - v), w: v, h: v, radius: 3, fill: '#FFFFFF', stroke: '#1A1A18', strokeWidth: 2 }));
    track(lib.upsertText(b, 'SC/icl/' + n, { text: String(v), size: 8.5, weight: 500, color: '#6E6B62', x: ix, y: y + 44 }));
    ix += v + 34;
  }
  lib.chip(b, 'note', 'hit target ≥44×44 · hitSlop 8 · empty-state icon = 28-32px in 56px sunken circle');
}
return lib.done('24-type-specimens', { created });
