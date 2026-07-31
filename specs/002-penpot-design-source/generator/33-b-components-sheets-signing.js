// 33-b-components-sheets-signing.js — signing frame (split b/3): C/Signing/SigningSheet.
// THE single render path (security mandate): production dApp modal + clear-signing harness +
// read-only replay all render this one sheet — inv:03 §1/§1.1, inv:07 §3.2.
// Axes: phase(default|signing|submitted-pending|error|read-only-replay); the 9-view `view` axis is
// collapsed → C/Signing/BodyView (chunk 33-c) + O/signing-sheet state boards (manifest note).
// Color grammar chips (inv:03 §0.6) live on this container — the signing crown jewel.
// Idempotency: family-level skip-if-exists. Final x=2800 y=4600; scratch row y=8000 from x=5000.
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
const E = (b, name, size, fill, x, y, strokeColor) => {
  const e = penpot.createEllipse();
  e.name = name;
  b.appendChild(e);
  e.resize(size, size);
  e.fills = fill ? [{ fillColor: fill, fillOpacity: 1 }] : [];
  if (strokeColor) e.strokes = [{ strokeColor, strokeWidth: 2 }];
  e.x = b.x + x; e.y = b.y + y;
  return e;
};

if (exists('C/Signing/SigningSheet')) summary.skipped.push('C/Signing/SigningSheet');
else {
  const comps = [];
  const PHASES = ['default', 'signing', 'submitted-pending', 'error', 'read-only-replay']; // inv:03 §1.1 states + manifest phase axis
  for (const ph of PHASES) {
    const live = ph !== 'read-only-replay';
    const b = B(ph, 390, 620, '#FAFAF8'); // container flex:1, padding space.3xl 24 on bg.base — inv:03 §1.1
    bind(b, 'color.bg.base', ['fill']);

    // 1. DAppBanner — "who's asking", de-containered, 1px bottom hairline — inv:03 §2.1
    const logo = R(b, 'dapp logo', { x: 24, y: 20, w: 36, h: 36, fill: '#FFF0EB', radius: 10 }); // 36×36 r10, monogram fallback accent.soft — inv:03 §2.1
    bind(logo, 'color.accent.soft', ['fill']);
    T(b, 'dapp monogram', { text: 'U', size: 15, weight: 700, color: '#E8572A', x: 36, y: 28 }); // first letter, text.lg bold accent.base — inv:03 §2.1
    T(b, 'dapp name', { text: 'Uniswap', size: 13, weight: 700, color: '#1A1A18', x: 72, y: 22 }); // text.base bold fg.base — inv:03 §2.1
    T(b, 'dapp domain', { text: 'app.uniswap.org', size: 10, weight: 500, zone: 'mono', color: '#6E6B62', x: 72, y: 40 }); // text.xs mono medium fg.muted — inv:03 §2.1
    T(b, 'chain name', { text: 'Ethereum', size: 10, weight: 600, color: '#1A1A18', x: 318, y: 30 }); // chain cluster right (ChainLogo 16 collapsed into name) — inv:03 §2.1
    R(b, 'banner hairline', { x: 24, y: 72, w: 342, h: 1, fill: '#ECEBE4' }); // border.base — inv:03 §2.1

    // 2. History note — read-only replay only — inv:03 §1.1.2
    if (ph === 'read-only-replay') {
      const note = R(b, 'history note', { x: 24, y: 84, w: 342, h: 32, fill: '#F5F3EF', radius: 12 }); // bg.sunken radius.lg padV8/H12 — inv:03 §1.1.2
      bind(note, 'color.bg.sunken', ['fill']);
      I(b, 'Pen', 15, 2, '#6E6B62', 36, 92);
      T(b, 'history text', { text: 'A past signature — exactly what you approved.', size: 11, weight: 500, color: '#6E6B62', x: 58, y: 94 }); // sm medium fg.muted — inv:07 §3.2.2
    }

    // 3. Body slot — exactly one of 9 mutually-exclusive views — inv:03 §1.1.3
    const slot = R(b, 'body slot', { x: 24, y: 130, w: 342, h: 210, fill: '#F5F3EF', radius: 12 });
    bind(slot, 'color.bg.sunken', ['fill']);
    T(b, 'body slot label', { text: 'body — 1 of 9 views → C/Signing/BodyView', size: 11, weight: 500, color: '#8C887E', x: 84, y: 228 });

    if (live) {
      // 6. GasFeeCard collapsed row (tx/batch, live only), no horizontal inset — inv:03 §1.1.6/§3.1
      T(b, 'gas label', { text: 'Est. fee', size: 11, weight: 500, color: '#6E6B62', x: 24, y: 352 }); // sm medium fg.muted — inv:03 §3.1
      T(b, 'gas value', { text: '~0.0042 ETH', size: 11, weight: 600, color: '#1A1A18', x: 288, y: 348 }); // token-first sm semibold ink — inv:03 §3.1
      T(b, 'gas fiat', { text: '≈ $15.90', size: 10, weight: 400, color: '#8C887E', x: 306, y: 364 }); // ≈ fiat xs subtle (≥$0.005 only) — inv:03 §3.1
      // 8. SigningAccountRow — quiet FROM row above the confirm, live only — inv:03 §1.1.8/§2.1
      R(b, 'account hairline', { x: 24, y: 388, w: 342, h: 1, fill: '#ECEBE4' }); // top hairline border.base — inv:03 §2.1
      T(b, 'account label', { text: 'Signing account', size: 11, weight: 500, color: '#6E6B62', x: 24, y: 402 }); // sm medium fg.muted — inv:03 §2.1
      E(b, 'ContactAvatar 18', 18, '#F5F3EF', 276, 400); // avatar 18 — inv:03 §2.1
      T(b, 'account name', { text: 'Main Wallet', size: 11, weight: 600, color: '#1A1A18', x: 300, y: 403 }); // sm semibold fg.base — inv:03 §2.1
      I(b, 'ChevronDown', 13, 2, '#8C887E', 352, 403); // 13 fg.subtle, rotates 180° open — inv:03 §2.1
    }

    // 9./10. Pending / error cards — inv:03 §1.1.9/§1.1.10
    if (ph === 'submitted-pending') {
      const pc = R(b, 'pending card', { x: 24, y: 436, w: 342, h: 40, fill: '#EDF0FF', radius: 12 }); // info.soft radius.lg padV12/H16 — inv:03 §1.1.9
      bind(pc, 'color.info.soft', ['fill']);
      E(b, 'spinner 14', 14, null, 36, 449, '#4267F4'); // small ActivityIndicator info.base — inv:03 §1.1.9
      T(b, 'pending text', { text: 'Submitted — waiting · 0x1234567890…abcdef', size: 11, weight: 500, zone: 'mono', color: '#4267F4', x: 58, y: 450 }); // mono sm info.base, hash 10+6 mid-ellipsis — inv:03 §1.1.9
    }
    if (ph === 'error') {
      const ec = R(b, 'error card', { x: 24, y: 436, w: 342, h: 40, fill: '#FEF2F2', radius: 12 }); // error.soft radius.lg — inv:03 §1.1.10
      bind(ec, 'color.error.soft', ['fill']);
      I(b, 'AlertTriangle', 16, 2, '#C62828', 36, 448); // AlertTriangle 16 error.base — inv:03 §1.1.10
      T(b, 'error text', { text: 'User rejected: passkey prompt was cancelled', size: 11, weight: 400, color: '#C62828', x: 60, y: 450 }); // sm regular error.base (raw error string) — inv:03 §1.1.10
    }

    // Footer — hairline top border, ONE control only — inv:03 §1.1 footer / inv:07 §3.2
    R(b, 'footer hairline', { x: 24, y: 492, w: 342, h: 1, fill: '#ECEBE4' }); // border.base, padTop 16 — inv:03 §1.1
    if (ph === 'error' || ph === 'read-only-replay') {
      // signError → secondary "Dismiss"; read-only → secondary "Close" — inv:03 §1.1
      const btn = R(b, 'footer button', { x: 24, y: 508, w: 342, h: 53, radius: 16, stroke: '#D8D6CE', strokeWidth: 1.5 }); // VelaButton secondary — inv:02 A1 (30-chunk)
      btn.fills = [];
      T(b, 'footer button label', { text: ph === 'error' ? 'Dismiss' : 'Close', size: 15, weight: 600, color: '#1A1A18', x: 167, y: 524 });
    } else {
      // SlideToConfirmButton — uniform for EVERY live request, benign or dangerous — inv:03 §1.1
      const committed = ph !== 'default'; // commit settles track to success.soft + rgba(45,142,95,0.3) border — inv:07 §3.2
      const track = R(b, 'slide track', {
        x: 24, y: 508, w: 342, h: 60, radius: 30, // track 60 tall r30 — inv:07 §3.2
        fill: committed ? '#EDFAF2' : '#FFFFFF', // bg.raised → success.soft on commit — inv:07 §3.2
        stroke: committed ? '#C0DDCF' : '#ECEBE4', strokeWidth: 1, // #C0DDCF ≈ rgba(45,142,95,0.3) flattened on light bg.raised — inv:07 §3.2 (dark theme composites differently)
      });
      bind(track, committed ? 'color.success.soft' : 'color.bg.raised', ['fill']);
      const knobX = committed ? 24 + 342 - 56 : 28; // knob 52 accent circle inset 4 — inv:07 §3.2
      const knob = E(b, 'slide knob 52', 52, '#E8572A', knobX, 512);
      bind(knob, 'color.accent.base', ['fill']);
      bind(knob, 'shadow.md', ['shadow']);
      I(b, 'ArrowRight', 22, 2.2, '#FFFFFF', knobX + 15, 527); // white arrow — inv:07 §3.2
      if (ph === 'default') {
        T(b, 'slide label', { text: 'Slide to confirm', size: 15, weight: 600, color: '#6E6B62', x: 138, y: 528 }); // label text.lg semibold fg.muted, centered; copy slideToConfirm — inv:03 §1.1 / 07 §3.2
      } else if (ph === 'signing') {
        T(b, 'slide label', { text: 'Signing…', size: 15, weight: 600, color: '#6E6B62', x: 160, y: 528 }); // buttonLabel() while signing — inv:03 §1.1
      }
    }
    comps.push(penpot.library.local.createComponent([b]));
  }

  await lib.sleep(400);
  const container = penpot.createVariantFromComponents(comps.map(c => c.mainInstance()));
  await lib.sleep(500);
  container.name = 'C/Signing/SigningSheet';
  container.x = FINAL_X; container.y = 4600;
  container.variants.renameProperty(0, 'phase');
  await lib.sleep(300);
  summary.variantErrors += container.variants.variantComponents().filter(vc => vc.variantError).length;
  summary.built['C/Signing/SigningSheet'] = comps.length;

  // ---- signing color grammar + behavior chips (the load-bearing notes) ----
  lib.chip(container, 'note', 'ONE render path: production dApp modal + clear-signing harness + read-only replay all render this sheet (security mandate)'); // inv:03 §1 / 07 §3.2
  lib.chip(container, 'note', 'dismiss = reject (EIP-1193 4001) pre-submit; once submitting/submitted or errored = dismiss only — deliberately NO Reject button'); // inv:03 §1.1 / 07 §1.7-6
  lib.chip(container, 'note', 'color grammar: orange accent ONLY on the slide control/CTAs — never a headline hue on this sheet'); // inv:03 §0.6
  lib.chip(container, 'note', 'color grammar: a colored headline/eyebrow is always RED = "this can lose you money"; green eyebrow only for a revoke; amber lives only inside WarningBanner'); // inv:03 §0.6
  lib.chip(container, 'note', 'confirm disabled: descriptor resolving · gas estimating/failed · fee re-quote busy · approval unchosen · any batch leg unchosen'); // inv:03 §1.1
  lib.chip(container, 'note', 'confirm label ≤ ~15 chars: Signing…/Revoke/Approve/Sign/Confirm {intent}/Confirm Send — never "Approve" for a non-approval'); // inv:03 §1.1
  lib.chip(container, 'note', 'axes collapsed: manifest view×phase — the 9-view axis → C/Signing/BodyView + O/signing-sheet boards; phases resolving/gas-estimating/fee-busy/estimate-failed/funding-swap boarded at O/signing-sheet'); // manifest C/Signing/SigningSheet note
  lib.chip(container, 'motion', 'haptics: warning buzz on danger open (eth_sign, unbounded approval, SIWE mismatch) · light on slide commit · success on opHash · error on signError; idle knob peeks right until first grab'); // inv:03 §1.1 / 07 §3.2
  lib.chip(container, 'motion', 'slide: commit ≥80% or flick ≥45%+v900; tick haptic 60%; overdrag rubber-bands; keep ≥48pt clearance below (home-indicator band)'); // inv:07 §3.2
  lib.chip(container, 'edge', 'funding-needed → BundlerFundingView content-swap in the SAME sheet (never stacked) → O / bundler-funding'); // inv:07 §3.1/§1.7-1
}

return lib.done('33-b-components-sheets-signing', summary);
