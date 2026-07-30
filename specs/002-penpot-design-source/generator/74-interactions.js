// 74-interactions.js — wire the boards into a traversable state machine (FR-005a, SC-007).
//
// Until now the file was a pile of correct pictures with no edges: the consumption contract told a
// rebuild agent that "what happens when I tap X" is answerable mechanically, and it was not.
//
// Each edge names the SOURCE board, the label a person taps, and the DESTINATION board. The trigger
// element is found by its rendered text — the boards are DOM-derived, so the label a user reads is
// also the only stable handle the shape has. Where no single element owns the transition (an
// automatic redirect, a background event), the edge is recorded as `vela.edge` plugin data instead,
// which is exactly the split the contract describes.
//
// Idempotent: interactions are cleared from a source shape before being re-added.
if (!storage.lib) (new Function('storage','penpot','penpotUtils', penpot.currentFile.getPluginData('velaLib')))(storage, penpot, penpotUtils);
const lib = storage.lib;

// [source board, tap label, destination board, action]
// `overlay` opens the destination on top; `nav` replaces the screen.
const EDGES = [
  ['S/home/activity', 'Send', 'S/send/select-token', 'nav'],
  ['S/home/activity', 'Receive', 'S/receive/safety-gate', 'nav'],
  ['S/home/activity', 'Assets', 'S/home/assets', 'nav'],
  ['S/home/activity', 'Connections', 'S/home/connections', 'nav'],
  ['S/home/activity', 'All', 'O/network-filter/default', 'overlay'],
  ['S/home/assets', 'Activity', 'S/home/activity', 'nav'],
  ['S/home/assets', 'Connections', 'S/home/connections', 'nav'],
  ['S/home/assets', 'Add', 'S/add-token/erc20', 'nav'],
  ['S/home/assets', 'Send', 'S/send/select-token', 'nav'],
  ['S/home/assets', 'Receive', 'S/receive/safety-gate', 'nav'],
  ['S/home/connections', 'Activity', 'S/home/activity', 'nav'],
  ['S/home/connections', 'Assets', 'S/home/assets', 'nav'],
  ['S/home/hidden-balance', 'Assets', 'S/home/assets', 'nav'],
  ['S/home/rate-limited', 'Activity', 'S/home/activity', 'nav'],
  ['S/home/rpc-trouble', 'Activity', 'S/home/activity', 'nav'],

  ['S/send/select-token', 'XDAI', 'S/send/details', 'nav'],
  ['S/send/select-token', 'Add Token', 'S/add-token/erc20', 'nav'],
  ['S/send/details', 'Continue', 'S/send/confirm', 'nav'],
  ['S/send/details', 'Add recipient', 'S/send/details-split', 'nav'],
  ['S/send/details', 'Import list', 'O/batch-import/default', 'overlay'],
  ['S/send/details-split', 'Import list', 'O/batch-import/default', 'overlay'],
  ['S/send/confirm', 'Confirm', 'O/signing-sheet/erc-20-transfer', 'overlay'],

  ['S/receive/safety-gate', 'I Understand', 'S/receive/address', 'nav'],
  ['S/receive/address', 'Request', 'S/receive/request', 'nav'],
  ['S/receive/request', 'Address', 'S/receive/address', 'nav'],

  ['S/add-token/erc20', 'Native Token', 'S/add-token/native', 'nav'],
  ['S/add-token/native', 'ERC-20 Token', 'S/add-token/erc20', 'nav'],

  ['S/settings/default', 'About', 'S/about/default', 'nav'],
  ['S/settings/default', 'Contacts', 'O/contacts-manager/default', 'overlay'],
  ['S/settings/default', 'Currency', 'O/currency/default', 'overlay'],
  ['S/settings/default', 'Safari Extension', 'S/safari-extension/default', 'nav'],

  ['S/onboarding/welcome', 'Create Wallet', 'S/onboarding/create', 'nav'],
  ['S/connect/disconnected', 'Connections', 'S/home/connections', 'nav'],
  ['S/token-detail/default', 'Send', 'S/send/select-token', 'nav'],
  ['S/token-detail/default', 'Receive', 'S/receive/safety-gate', 'nav'],

  // states added by the second capture sweep
  ['S/settings/default', 'Advanced', 'S/settings/advanced-expanded', 'nav'],
  ['S/settings/advanced-expanded', 'About', 'S/about/default', 'nav'],
  ['S/connect/connecting-verify', 'Cancel', 'S/connect/disconnected', 'nav'],
  ['S/connect/error', 'Scan Again', 'S/connect/disconnected', 'nav'],
  ['S/send/locked-network-not-supported', 'Cancel', 'S/home/activity', 'nav'],
  ['S/send/locked-unknown-token', 'Cancel', 'S/home/activity', 'nav'],
  ['S/onboarding/create-form-ready', 'Account Name', 'S/onboarding/create', 'nav'],
];

// Transitions no single element owns — recorded as plugin data, per the contract.
const NON_POINTER = [
  ['S/onboarding/create', 'passkey ceremony resolves → wallet created', 'S/home/activity'],
  ['S/send/confirm', 'user operation lands on chain', 'O/transaction-detail/single-confirmed'],
  ['S/home/activity', 'every chain returns 429 → cached balance kept, no RPC banner', 'S/home/rate-limited'],
  ['S/home/activity', 'RPC hard-fails on every chain', 'S/home/rpc-trouble'],
  ['S/home/activity', 'tap the balance hero → all figures masked', 'S/home/hidden-balance'],
  ['S/pay/default', 'link is missing a recipient or an unknown chain', 'S/pay/invalid-link'],
  ['S/connect/disconnected', 'paste a pairing URI → local fingerprint gate, no peer needed', 'S/connect/connecting-verify'],
  ['S/connect/disconnected', 'paste a malformed pairing URI', 'S/connect/error'],
  ['S/connect/connecting-verify', 'tap Confirm → waits on the relay (no board: the wait does not hold in the web build)', '—'],
  ['S/onboarding/create', 'fill the name and tick every acknowledgment', 'S/onboarding/create-form-ready'],
  ['S/onboarding/create-form-ready', 'passkey ceremony (not boarded: it mints a credential and writes an account)', '—'],
  ['S/send/confirm', 'slide to confirm → signed and submitted', 'S/send/receipt-submitted'],
  ['S/send/receipt-submitted', 'the user operation is included in a block', 'S/send/receipt-confirmed'],
  ['S/send/receipt-submitted', 'the user operation reverts', 'S/send/receipt-failed'],
  ['S/web-request/unavailable', 'no dApp handshake on this popup', '—'],
  ['S/browser/unsupported-on-web', 'iOS or Android → the real in-app browser (no board: needs a device capture)', '—'],
  ['S/home/assets', 'Appearance set to Dark in Settings', 'S/home/assets-dark'],
  ['S/send/select-token', 'Appearance set to Dark in Settings', 'S/send/select-token-dark'],
  ['S/settings/default', 'Appearance set to Dark in Settings', 'S/settings/default-dark'],
];

const FLOWS = [
  ['send', '05 Screens · Wallet', 'S/send/select-token'],
  ['receive', '05 Screens · Wallet', 'S/receive/safety-gate'],
  ['home', '05 Screens · Wallet', 'S/home/activity'],
  ['onboarding', '07 Screens · Settings & Onboarding', 'S/onboarding/welcome'],
  ['connect', '06 Screens · Browser & Connect', 'S/connect/disconnected'],
];

const stats = { wired: 0, edges: 0, flows: 0, missingSource: [], missingTarget: [], missingLabel: [] };

// Boards live on several pages and mutations only apply to the current page (lib rule 2), so
// resolve every board once, page by page, before touching anything.
const boards = {};
for (const p of lib.PAGES) {
  if (!penpotUtils.getPageByName(p)) continue;
  await lib.open(p);
  for (const b of penpot.currentPage.root.children) {
    if (b.type === 'board') boards[lib.norm(b.name)] = { board: b, page: p };
  }
}

// The tappable element for a label: prefer the exact text, else a text that starts with it.
const findLabel = (board, label) => {
  const want = label.toLowerCase();
  const texts = penpotUtils.findShapes((s) => s.type === 'text', board) || [];
  return texts.find((t) => (t.characters || '').trim().toLowerCase() === want)
      || texts.find((t) => (t.characters || '').trim().toLowerCase().startsWith(want));
};

for (const [from, label, to, kind] of EDGES) {
  const src = boards[lib.norm(from)];
  const dst = boards[lib.norm(to)];
  if (!src) { stats.missingSource.push(from); continue; }
  if (!dst) { stats.missingTarget.push(to); continue; }
  await lib.open(src.page);
  const el = findLabel(src.board, label);
  if (!el) { stats.missingLabel.push(from + ' → ' + label); continue; }
  for (const i of (el.interactions || [])) { try { el.removeInteraction(i); } catch (e) {} }
  try {
    el.addInteraction('click', {
      type: kind === 'overlay' ? 'open-overlay' : 'navigate-to',
      destination: dst.board,
      ...(kind === 'overlay' ? { overlayPositionType: 'manual', closeWhenClickOutside: true } : {}),
    });
    stats.wired++;
  } catch (e) {
    // Penpot can only open an overlay that lives on the SAME page as its trigger, and every overlay
    // in this file lives on `08 Overlays` by the naming grammar. Those transitions are real but not
    // expressible as a pointer interaction here, so they are recorded as edges — which is the case
    // the contract's `vela.edge` key exists for. Duplicating 46 overlays onto five screen pages to
    // satisfy the API would break the one-board-per-state rule the whole file rests on.
    lib.chip(src.board, 'edge', 'tap "' + label + '" → ' + to);
    stats.edges++;
    stats.crossPage = (stats.crossPage || 0) + 1;
  }
}

for (const [from, cond, to] of NON_POINTER) {
  const src = boards[lib.norm(from)];
  if (!src) { stats.missingSource.push(from); continue; }
  await lib.open(src.page);
  lib.chip(src.board, 'edge', cond + ' → ' + to);
  stats.edges++;
}

for (const [name, page, entry] of FLOWS) {
  const b = boards[lib.norm(entry)];
  if (!b) { stats.missingTarget.push(entry); continue; }
  await lib.open(page);
  try {
    const existing = (penpot.currentPage.flows || []).find((f) => f.name === name);
    if (existing) penpot.currentPage.removeFlow(existing);
    penpot.currentPage.createFlow(name, b.board);
    stats.flows++;
  } catch (e) { stats.missingTarget.push(name + ': ' + (e && e.message)); }
}

return lib.done('74-interactions', stats);
