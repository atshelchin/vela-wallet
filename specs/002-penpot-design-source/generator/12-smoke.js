// 12-smoke.js — foundational asserts (T008): fonts, name-normalization idempotency,
// interaction round-trip, page-aware removal. Self-cleaning; safe to re-run.
if (!storage.lib) throw new Error('run 10-lib.js first');
const lib = storage.lib;
const out = { fonts: {}, interactions: {}, libSelfTest: {} };

// 1. Fonts (research R3)
const jakarta = penpot.fonts.findByName('Plus Jakarta Sans');
const plexMono = penpot.fonts.findByName('IBM Plex Mono');
out.fonts.jakartaWeights = ['400', '500', '600', '700'].every(w => jakarta?.variants.some(v => v.fontWeight === w && v.fontStyle === 'normal'));
out.fonts.plexMono = !!plexMono;
if (!out.fonts.jakartaWeights || !out.fonts.plexMono) throw new Error('font assert failed');

// 2. Lib self-test on the dev page: upsert twice → second pass creates nothing
const mk = async () => {
  const b = await lib.upsertBoard('10 Dev & Parallel Space', 'SMOKE/board', { x: 5000, y: 5000, w: 300, h: 200, fill: '#FAFAF8' });
  const t = lib.upsertText(b.board, 'SMOKE/text', { text: 'smoke', size: 13, weight: 600, x: 20, y: 20 });
  const m = lib.upsertText(b.board, 'SMOKE/mono', { text: '0xAbCd…1234', size: 11, zone: 'mono', weight: 500, x: 20, y: 48 });
  const c = lib.chip(b.board, 'edge', 'smoke-condition → SMOKE/board2');
  return { b, created: [b.created, t.created, m.created, c.created] };
};
const first = await mk();
const second = await mk();
out.libSelfTest.firstRunCreated = first.created;
out.libSelfTest.secondRunCreated = second.created; // must be all false
if (second.created.some(Boolean)) throw new Error('idempotency assert failed');

// 3. Interaction round-trip (FR-005a)
const b2 = await lib.upsertBoard('10 Dev & Parallel Space', 'SMOKE/board2', { x: 5400, y: 5000, w: 300, h: 200 });
const src = first.b.board;
const inter = src.addInteraction('click', { type: 'navigate-to', destination: b2.board });
out.interactions.added = !!inter && inter.trigger === 'click';
out.interactions.readBack = (src.interactions || []).some(i => i.action?.type === 'navigate-to' && i.action?.destination?.id === b2.board.id);
if (!out.interactions.readBack) throw new Error('interaction round-trip failed');
inter.remove();

// 4. Page-aware cleanup (removeWhere iterates all pages — Penpot rule 4)
out.removed = (await lib.removeWhere(sh => sh.name && sh.name.includes('SMOKE'))).removed;
out.cleaned = !penpotUtils.findShape(s => s.name && s.name.includes('SMOKE'));
if (!out.cleaned) throw new Error('cleanup failed');

return lib.done('12-smoke', out);
