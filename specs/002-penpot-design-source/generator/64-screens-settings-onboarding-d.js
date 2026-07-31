if (!storage.lib) (new Function('storage','penpot','penpotUtils', penpot.currentFile.getPluginData('velaLib')))(storage, penpot, penpotUtils);
// 64-screens-settings-onboarding-d.js — page '07 Screens · Settings & Onboarding', screen row 2
// (S/onboarding, y 1900), states 3-6:
//   create-ceremony (x 1350) · create-resume (x 1800) · create-success (x 2250) · sync-failure (x 2700)
// Source of visual truth: inv:06 §2.4 (CreateWalletScreen States A/B/C + resume escape hatch),
// §2.1 (emotional arc: tense blue-narrated ceremony -> green success with the address as the
// reward -> a CALM, fixable failure branch that is never scary).
const lib = storage.lib;
const PAGE = '07 Screens · Settings & Onboarding';

const INK = '#1A1A18', MUTED = '#6E6B62', SUBTLE = '#8C887E', BG = '#FAFAF8';
const RAISED = '#FFFFFF', SUNKEN = '#F5F3EF', BORDER = '#ECEBE4';
const ACCENT = '#E8572A', ACCENT_SOFT = '#FFF0EB';
const SUCCESS = '#2D8E5F', SUCCESS_SOFT = '#EDFAF2', INFO = '#4267F4';

let missing = 0;
const T = (b, name, s) => lib.upsertText(b, name, s).text;
const R = (b, name, s) => { const r = lib.upsertRect(b, name, s).rect; if (!s.fill) r.fills = []; return r; };
const E = (b, name, s) => {
  const n = lib.norm(name);
  let e = penpotUtils.findShape(sh => sh.name === n && sh.type === 'ellipse', b);
  if (!e) { e = penpot.createEllipse(); e.name = name; b.appendChild(e); }
  if (Math.round(e.width) !== s.d || Math.round(e.height) !== s.d) e.resize(s.d, s.d);
  penpotUtils.setParentXY(e, s.x, s.y);
  e.fills = s.fill ? [{ fillColor: s.fill, fillOpacity: 1 }] : [];
  e.strokes = s.stroke ? [{ strokeColor: s.stroke, strokeWidth: s.sw || 2 }] : [];
  if (s.opacity !== undefined) e.opacity = s.opacity;
  return e;
};
const ICON = (b, lucide, size, sw, color, x, y, key) =>
  R(b, 'icon:' + lucide + ' ' + size + '/' + sw + ' · ' + key, { x, y, w: size, h: size, stroke: color, strokeWidth: sw });
const lh = (t, mult) => { try { t.lineHeight = String(mult); } catch (e) {} return t; };

const instAt = (b, key, family, props, x, y, w, h) => {
  const nm = lib.norm(key);
  const found = penpotUtils.findShape(s => s.name === nm, b);
  if (found) { penpotUtils.setParentXY(found, x, y); return found; }
  const i = lib.instance(family, props, b, x, y);
  if (!i) {
    missing++;
    R(b, 'MISSING:' + family + ' · ' + key, { x, y, w, h, fill: '#FEF2F2', stroke: '#C62828', strokeWidth: 1, radius: 8 });
    return null;
  }
  try { i.name = key; } catch (e) {}
  return i;
};
const setTexts = (inst, pairs) => {
  try {
    const ts = penpotUtils.findShapes(s => s.type === 'text', inst) || [];
    const used = {};
    for (const p of pairs) {
      const t = ts.find(s => !used[s.id] && Math.round(Number(s.fontSize)) === p.size);
      if (t) { used[t.id] = 1; if (t.characters !== p.text) t.characters = p.text; }
    }
  } catch (e) {}
};
const cta = (b, key, y, label, state) => {
  const i = instAt(b, 'cta/' + key, 'C/Primitives/VelaButton',
    { variant: 'primary', size: 'default', state: state || 'default' }, 24, y, 342, 53);
  if (i && state !== 'loading') setTexts(i, [{ size: 15, text: label }]);
  return i;
};

// ── State-A form shell (header + name field + acknowledgment checklist) ─────
// inv:06 §2.4 State A. Reused by the ceremony and resume boards, which keep the form on screen
// underneath their status line — the ceremony never navigates away from it.
const formShell = (b, o) => {
  T(b, 'hd/title', { text: o.title, size: 17, weight: 700, color: INK, x: o.titleX, y: 75 });
  if (o.back) ICON(b, 'ArrowLeft', 20, 2.5, ACCENT, 36, 73, 'back');
  const al = T(b, 'lbl/account-name', { text: 'ACCOUNT NAME', size: 11, weight: 600, color: MUTED, x: 24, y: 139 });
  try { al.letterSpacing = '0.8'; } catch (e) {}
  const fr = R(b, 'field/name', { x: 24, y: 161, w: 342, h: 52, radius: 16, fill: RAISED, stroke: BORDER, strokeWidth: 1 });
  const fv = T(b, 'field/name-value', { text: 'Main Account', size: 15, weight: 400, color: INK, x: 44, y: 179 });
  if (o.inputDisabled) { fr.opacity = 0.45; fv.opacity = 0.45; }   // disabled while loading / pending resume — inv:06 §2.4
  lh(T(b, 'field/name-hint', {
    text: 'This name is stored with your public key on-chain\nfor cross-device sign-in.',
    size: 11, weight: 400, color: SUBTLE, x: 24, y: 221,
  }), 1.6);

  const ACK = [
    [281, 'This is a self-custodial wallet. Your passkey private\nkey is managed by your device’s password manager\n(iCloud Keychain / Google Password Manager). Vela\nWallet cannot access or recover it.'],
    [377, 'If you lose your device, you can restore your wallet\non a new device through your iCloud or Google account.'],
    [433, 'If your iCloud or Google account is compromised, your\nwallet control may also be compromised. Protect it\nwith a strong password and 2FA.'],
  ];
  ACK.forEach(([y, copy], i) => {
    ICON(b, 'CheckSquare', 18, 2, ACCENT, 24, y, 'ack-' + i);
    lh(T(b, 'ack/copy-' + i, { text: copy, size: 11, weight: 400, color: MUTED, x: 50, y: y }), 1.8);
  });
  ICON(b, 'CheckSquare', 18, 2, ACCENT, 24, 509, 'ack-3');
  T(b, 'ack/copy-3a', { text: 'I agree to the', size: 11, weight: 400, color: MUTED, x: 50, y: 509 });
  T(b, 'ack/link-privacy', { text: 'Privacy Policy', size: 11, weight: 600, color: ACCENT, x: 136, y: 509 });
  R(b, 'deco:underline · privacy', { x: 136, y: 523, w: 78, h: 1, fill: ACCENT });
  T(b, 'ack/copy-3b', { text: 'and', size: 11, weight: 400, color: MUTED, x: 220, y: 509 });
  T(b, 'ack/link-terms', { text: 'Terms of Service', size: 11, weight: 600, color: ACCENT, x: 248, y: 509 });
  R(b, 'deco:underline · terms', { x: 248, y: 523, w: 91, h: 1, fill: ACCENT });
};
// status row: Loader 14 info.base + text.sm medium info.base — the ceremony's only narration
const statusRow = (b, x, text) => {
  ICON(b, 'Loader', 14, 2, INFO, x, 546, 'status');
  T(b, 'status/text', { text: text, size: 11, weight: 500, color: INFO, x: x + 22, y: 545 });
};

// ═══════════════════════════════════ S/onboarding/create-ceremony (state 3)
{
  const { board: b } = await lib.upsertBoard(PAGE, 'S/onboarding/create-ceremony', { x: 1350, y: 1900, w: 390, h: 844, fill: BG });
  formShell(b, { title: 'Create Wallet', titleX: 139, back: true, inputDisabled: true });
  statusRow(b, 115, 'Extracting public key...');
  cta(b, 'create', 589, 'Create Wallet', 'loading');

  lib.chip(b, 'note', 'the form STAYS on screen (disabled) under the status line — the ceremony never navigates away; all 4 boxes are checked, so the CTA was enabled before it went loading');
  lib.chip(b, 'note', 'the proof signature is mandatory by design: the passkey must prove it can SIGN before anything is persisted (inv 06 §2.4)');
  lib.chip(b, 'motion', 'staged status copy, in order: "Setting up secure identity..." -> (OS passkey sheet) -> "Verifying identity..." -> "Extracting public key..." -> "Computing wallet address..." -> "Syncing public key..." (fadeIn 0/200)');
  lib.chip(b, 'edge', 'ceremony completes + key synced -> S/onboarding/create-success');
  lib.chip(b, 'edge', 'registration ok but verification cancelled -> S/onboarding/create-resume');
  lib.chip(b, 'edge', 'index upload fails after 3 auto-retries (1s / 2s backoff) -> S/onboarding/sync-failure');
  lib.chip(b, 'edge', 'user cancels the passkey sheet -> S/onboarding/create-form with status "Setup was cancelled." / "Verification was cancelled. Please try again."');
  lib.chip(b, 'edge', 'non-discoverable credential / Safe-incompatible response -> O/app-alert ("Passkey Didn\'t Sync" — iCloud Keychain / Google Password Manager guidance, "nothing is lost" · "Device Not Compatible")');
  lib.chip(b, 'platform', 'the OS passkey sheet (Face ID / fingerprint) covers this board mid-ceremony — an OS surface, not a Vela board');
}

// ═════════════════════════════════════ S/onboarding/create-resume (state 4)
{
  const { board: b } = await lib.upsertBoard(PAGE, 'S/onboarding/create-resume', { x: 1800, y: 1900, w: 390, h: 844, fill: BG });
  formShell(b, { title: 'Create Wallet', titleX: 139, back: true, inputDisabled: true });
  statusRow(b, 58, 'Verification was cancelled. Please try again.');
  cta(b, 'resume', 589, 'Finish Verification', 'default');

  // escape hatch — only appears once verification has failed; safe because nothing exists yet
  lh(T(b, 'escape/hint', {
    text: 'Verification keeps failing? Your device may not have\nsaved this passkey properly. It’s safe to start over —\nnothing has been created yet.',
    size: 11, weight: 400, color: SUBTLE, x: 36, y: 660,
  }), 1.7);
  T(b, 'escape/link', { text: 'Start over with a new passkey', size: 11, weight: 600, color: ACCENT, x: 112, y: 724 });
  R(b, 'deco:underline · start-over', { x: 112, y: 738, w: 165, h: 1, fill: ACCENT });

  lib.chip(b, 'note', 'the CTA RELABELS to "Finish Verification" and resumes with a SIGNATURE ONLY — it never mints a second passkey (inv 06 §2.4)');
  lib.chip(b, 'note', 'name input stays disabled while a registration is pending resume; the status line carries the cancel copy in info.base, not error red');
  lib.chip(b, 'note', 'escape hatch renders only after a failed verification — the copy is deliberately reassuring ("nothing has been created yet")');
  lib.chip(b, 'edge', '"Finish Verification" succeeds -> S/onboarding/create-success');
  lib.chip(b, 'edge', '"Finish Verification" upload fails -> S/onboarding/sync-failure');
  lib.chip(b, 'edge', '"Start over with a new passkey" -> S/onboarding/create-form (fresh passkey, nothing to clean up)');
  lib.chip(b, 'motion', 'status fadeIn 0/200; no entrance replay on re-render (hasEntered ref) — DESIGN-LANGUAGE rule 10');
}

// ════════════════════════════════════ S/onboarding/create-success (state 5)
{
  const { board: b } = await lib.upsertBoard(PAGE, 'S/onboarding/create-success', { x: 2250, y: 1900, w: 390, h: 844, fill: BG });
  T(b, 'hd/title', { text: 'Wallet Created', size: 17, weight: 700, color: INK, x: 135, y: 75 });
  ICON(b, 'ArrowLeft', 20, 2.5, ACCENT, 36, 73, 'back');

  E(b, 'success/disc', { d: 72, x: 159, y: 200, fill: SUCCESS_SOFT });
  ICON(b, 'CheckCircle2', 40, 1.5, SUCCESS, 175, 216, 'success');
  T(b, 'success/title', { text: 'Your wallet is ready!', size: 17, weight: 700, color: SUCCESS, x: 105, y: 296 });
  lh(T(b, 'success/message', { text: 'Your address works on all 12 supported networks.', size: 13, weight: 400, color: MUTED, x: 37, y: 328 }), 1.55);

  // address box — the reward: bg.sunken r12 padH16/V12, address text.sm medium mono middle-ellipsized
  R(b, 'address/box', { x: 24, y: 364, w: 342, h: 44, radius: 12, fill: SUNKEN });
  T(b, 'address/value', { text: '0x8Ba1f109551b…8f5e12A3BA72', size: 11, weight: 500, color: INK, zone: 'mono', x: 40, y: 380 });
  ICON(b, 'Copy', 14, 2, SUBTLE, 336, 379, 'copy-address');

  T(b, 'success/hint-1', { text: 'Your passkey is verified and your key is synced —', size: 11, weight: 400, color: SUBTLE, x: 55, y: 424 });
  T(b, 'success/hint-2', { text: 'you’re all set.', size: 11, weight: 400, color: SUBTLE, x: 152, y: 442 });

  cta(b, 'enter', 733, 'Enter Wallet', 'default');

  lib.chip(b, 'note', 'the ADDRESS is the reward, and the green title (text.xl bold success.base) is a deliberate one-off — no other Vela screen tints its title (inv 06 §2.4 State B)');
  lib.chip(b, 'note', 'copy flips the trailing icon to Check 14 success.base for 2s with a haptic; the address is middle-ellipsized mono');
  lib.chip(b, 'note', 'one address for every chain — the copy says "all {count} supported networks" from the live network count (12 shown)');
  lib.chip(b, 'edge', '"Enter Wallet" -> S/home/default (dispatches the account, replace to /(tabs)/wallet)');
  lib.chip(b, 'edge', 'embedded host (HTTPS dApp popup) passed onComplete -> finishes in place, no navigation');
  lib.chip(b, 'motion', 'fadeInDown 0/400 on the whole block (centred, gap 12) — iOS only; Android + web paint settled');
}

// ═════════════════════════════════════ S/onboarding/sync-failure (state 6)
{
  const { board: b } = await lib.upsertBoard(PAGE, 'S/onboarding/sync-failure', { x: 2700, y: 1900, w: 390, h: 844, fill: BG });
  // header title changes to "Cross-Device Sync"; the back arrow is deliberately ABSENT
  T(b, 'hd/title', { text: 'Cross-Device Sync', size: 17, weight: 700, color: INK, x: 122, y: 75 });

  E(b, 'fail/disc', { d: 72, x: 159, y: 170, fill: ACCENT_SOFT });
  ICON(b, 'AlertTriangle', 32, 2, ACCENT, 179, 190, 'sync-failed');
  T(b, 'fail/title', { text: 'Sync failed', size: 17, weight: 700, color: ACCENT, x: 148, y: 266 });
  lh(T(b, 'fail/message', {
    text: 'Wallet created, but your public key wasn’t synced to\nthe server. You won’t be able to sign in on other\ndevices until this is resolved.',
    size: 13, weight: 400, color: MUTED, x: 33, y: 298,
  }), 1.55);
  T(b, 'fail/hint', { text: 'Check your network, or configure a custom endpoint below.', size: 11, weight: 400, color: SUBTLE, x: 33, y: 368 });

  T(b, 'fail/link-settings', { text: 'Open Settings', size: 13, weight: 600, color: ACCENT, x: 149, y: 400 });
  R(b, 'deco:underline · open-settings', { x: 149, y: 416, w: 91, h: 1, fill: ACCENT });
  T(b, 'fail/link-report', { text: 'Report this error', size: 11, weight: 500, color: MUTED, x: 146, y: 436 });
  R(b, 'deco:underline · report', { x: 146, y: 450, w: 97, h: 1, fill: MUTED });
  T(b, 'fail/link-technical', { text: 'Technical details', size: 11, weight: 400, color: SUBTLE, x: 146, y: 464 });
  R(b, 'deco:underline · technical', { x: 146, y: 478, w: 97, h: 1, fill: SUBTLE });

  // expanded quiet disclosure — raw error in a mono bg.sunken box, kept deliberately un-alarming
  R(b, 'fail/technical-box', { x: 24, y: 492, w: 342, h: 60, radius: 12, fill: SUNKEN });
  lh(T(b, 'fail/technical-body', {
    text: 'POST /api/pubkey → 502 Bad Gateway\n3 attempts (1s / 2s backoff) · 2026-07-29T02:14:11Z',
    size: 10, weight: 400, color: MUTED, zone: 'mono', x: 36, y: 506,
  }), 1.6);

  cta(b, 'retry', 733, 'Retry Upload', 'default');

  lib.chip(b, 'note', 'failure is framed as FIXABLE, never scary: accent (not error red) disc + title, calm copy, raw error hidden behind a quiet disclosure (inv 06 §2.1 arc, §2.4 State C)');
  lib.chip(b, 'note', 'the back arrow is deliberately HIDDEN here — the account is NOT saved locally until the server confirms, so retreating would strand an unrecoverable wallet');
  lib.chip(b, 'note', 'reached only after 3 automatic retries at 1s / 2s backoff; the passkey itself is already verified');
  lib.chip(b, 'edge', '"Retry Upload" succeeds -> S/onboarding/create-success');
  lib.chip(b, 'edge', '"Open Settings" -> O/onboarding-settings/unreachable-warning (endpoint editor + HealthDot)');
  lib.chip(b, 'edge', '"Report this error" -> O/bug-report/compose prefilled with the raw error');
  lib.chip(b, 'motion', 'CTA shows the VelaButton loading state while retrying; no entrance replay on re-render');
}

return lib.done('64-screens-settings-onboarding-d', {
  page: PAGE,
  boards: ['S/onboarding/create-ceremony', 'S/onboarding/create-resume', 'S/onboarding/create-success', 'S/onboarding/sync-failure'],
  missingPlaceholders: missing,
});
