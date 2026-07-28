// 34c-components-media.js — media components 3/4: C/Controls/QRScanner + C/Controls/ConnectionFlowStates.
// QRScanner: full-screen slide-up modal, black bg, camera fill; 240×240 scan frame w/ 4 white corner
// brackets 28×28 sw3 r12; native-only animated scan line / torch / flip / zoom slider; permission
// state (native) — inv:03 §7.3. state×platform 3×2=6 trimmed to the 4 combos that exist in the app
// (torch & permission UI are native capabilities — note chip).
// ConnectionFlowStates: WalletPair pairing lifecycle — verify (contained bg.sunken card, 4-digit
// fingerprint boxes), waiting (open accent state), error (open typographic state) — inv:03 §7.1;
// hosts own disconnected/connected. Copy = connect.list.* (en). Fingerprint = 4 digits
// (walletpair-protocol.ts padStart(4); connect.list.step2Title "4-digit code").
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

// ---------------------------------------------------------------- QRScanner
{
  const FAMILY = 'C/Controls/QRScanner';
  if (penpot.library.local.components.some(c => c.name === lib.norm(FAMILY))) {
    summary.qrScanner = 'skipped: exists';
  } else {
    const COMBOS = [['scanning', 'native'], ['torch-on', 'native'], ['permission', 'native'], ['scanning', 'web']];
    const comps = [];
    for (const [state, platform] of COMBOS) {
      const b = penpot.createBoard();
      b.name = state + ' ' + platform;
      b.x = sx; b.y = SY; sx += 390 + 40;
      b.resize(390, 844);
      b.fills = [{ fillColor: '#000000', fillOpacity: 1 }]; // full-screen modal, black bg / camera fill — inv:03 §7.3
      const native = platform === 'native';
      // header overlay (absolute top, padH 16; 44×44 buttons r22) — inv:03 §7.3
      icon(b, 'X', 22, 2, '#FFFFFF', 27, 31);
      lib.upsertText(b, 'title', { text: 'Scan QR', size: 15, weight: 700, color: '#FFFFFF', x: 165, y: 32 }); // text.lg bold white; copy scanner.title
      if (state !== 'permission') {
        if (state === 'torch-on') disc(b, 'torch-active-disc', 36, '#FFFFFF', 246, 24); // ACTIVE = white filled disc + black icon — inv:03 §7.3
        icon(b, 'Flashlight', 20, 2, state === 'torch-on' ? '#000000' : '#FFFFFF', 254, 32);
        icon(b, 'ImagePlus', 20, 2, '#FFFFFF', 298, 32);
        if (native) icon(b, 'SwitchCamera', 20, 2, '#FFFFFF', 342, 32); // camera-flip native only — inv:03 §7.3
        // scan frame: centered 240×240, 4 white corner brackets 28×28 sw3, 12px corner radius — inv:03 §7.3
        for (const [cn, cx, cy] of [['corner-tl', 75, 302], ['corner-tr', 287, 302], ['corner-bl', 75, 514], ['corner-br', 287, 514]]) {
          const { rect } = lib.upsertRect(b, cn, { x: cx, y: cy, w: 28, h: 28, radius: 12, stroke: '#FFFFFF', strokeWidth: 3 });
          rect.fills = [];
        }
        if (native) {
          // animated scan line: 2px white@60%, inset 8 (motion chip on container) — inv:03 §7.3
          const { rect: sl } = lib.upsertRect(b, 'scan-line', { x: 83, y: 421, w: 224, h: 2, fill: '#FFFFFF' });
          sl.opacity = 0.6;
          // footer zoom slider (native only): ZoomIn 16 white@75% + 3px track white@28% / white fill / 20px thumb, maxW 320 — inv:03 §7.3
          icon(b, 'ZoomIn', 16, 2, '#FFFFFF', 48, 770, 0.75);
          const { rect: tr } = lib.upsertRect(b, 'zoom-track', { x: 80, y: 777, w: 240, h: 3, fill: '#FFFFFF' });
          tr.opacity = 0.28;
          lib.upsertRect(b, 'zoom-fill', { x: 80, y: 777, w: 80, h: 3, fill: '#FFFFFF' });
          disc(b, 'zoom-thumb', 20, '#FFFFFF', 150, 768);
        }
        const { text: hint } = lib.upsertText(b, 'hint', { text: 'Point camera at a QR code', size: 11, weight: 500, color: '#FFFFFF', x: 125, y: 806 }); // sm medium white@70%; copy scanner.hint
        hint.opacity = 0.7;
      } else {
        // permission state (native): centered Camera 40 fg.subtle + text.lg subtle + accent button — inv:03 §7.3
        icon(b, 'Camera', 40, 2, '#8C887E', 175, 330);
        lib.upsertText(b, 'permission-text', { text: 'Camera access is needed to scan QR codes.', size: 15, weight: 400, color: '#8C887E', x: 48, y: 392 }); // copy scanner.permissionText
        lib.upsertRect(b, 'btn-grant', { x: 95, y: 448, w: 200, h: 48, radius: 16, fill: '#E8572A' }); // accent, padH24 padV16 radius.xl — inv:03 §7.3
        lib.upsertText(b, 'btn-grant-label', { text: 'Grant Permission', size: 13, weight: 600, color: '#FFFFFF', x: 143, y: 463 }); // copy scanner.grantPermission
      }
      comps.push(penpot.library.local.createComponent([b]));
    }
    const container = await combine(comps, FAMILY, ['state', 'platform'], 5500);
    lib.chip(container, 'motion', 'scan line 2s ease-in-out ping-pong (native only); auto-hunt zoom triangle-sweep until manual interaction; success haptic + 2s re-arm; torch off on front camera');
    lib.chip(container, 'platform', 'native-only: torch, camera-flip, zoom slider, scan line; web = invisible center-crop digital zoom, no zoom UI by design');
    lib.chip(container, 'note', 'axes collapsed: torch-on/web + permission/web not built (torch & permission UI are native capabilities) — inv:03 §7.3');
    summary.qrScanner = comps.length;
  }
}

// ----------------------------------------------------- ConnectionFlowStates
{
  const FAMILY = 'C/Controls/ConnectionFlowStates';
  if (penpot.library.local.components.some(c => c.name === lib.norm(FAMILY))) {
    summary.connectionFlowStates = 'skipped: exists';
  } else {
    const comps = [];

    // -- verify: fingerprint card, bg.sunken r16 1px border.base pad 20 — inv:03 §7.1 state 1
    {
      const b = penpot.createBoard();
      b.name = 'verify';
      b.x = sx; b.y = SY; sx += 342 + 40;
      b.resize(342, 386);
      b.fills = [{ fillColor: '#F5F3EF', fillOpacity: 1 }]; // bg.sunken
      b.borderRadius = 16; // radius.xl
      b.strokes = [{ strokeColor: '#ECEBE4', strokeWidth: 1, strokeAlignment: 'inner' }]; // 1px border.base
      try { lib.bindToken(b, 'color.bg.sunken', ['fill']); } catch (e) {}
      try { lib.bindToken(b, 'radius.xl', ['borderRadiusTopLeft', 'borderRadiusTopRight', 'borderRadiusBottomRight', 'borderRadiusBottomLeft']); } catch (e) {}
      icon(b, 'Fingerprint', 28, 2, '#E8572A', 78, 22); // Fingerprint 28 accent — inv:03 §7.1
      lib.upsertText(b, 'title', { text: 'Verify Connection', size: 17, weight: 700, color: '#1A1A18', x: 114, y: 28 }); // text.xl bold; connect.list.verifyTitle
      lib.upsertText(b, 'hint', { text: 'Confirm this code matches what the dApp displays:', size: 13, weight: 400, color: '#6E6B62', x: 22, y: 62 }); // text.base muted lh20; connect.list.verifyHint
      // digit boxes: 4 × 52×64, r12, bg.raised, 1px border.strong, digit 28 bold mono — inv:03 §7.1 (4 digits: walletpair-protocol padStart(4))
      const digits = ['7', '3', '0', '2'];
      for (let i = 0; i < 4; i++) {
        const bx = 49 + i * 64; // gap 12
        lib.upsertRect(b, 'digit-box-' + i, { x: bx, y: 96, w: 52, h: 64, radius: 12, fill: '#FFFFFF', stroke: '#D8D6CE', strokeWidth: 1 });
        lib.upsertText(b, 'digit-' + i, { text: digits[i], size: 28, weight: 700, zone: 'mono', color: '#1A1A18', x: bx + 17, y: 112 });
      }
      // dApp identity: icon 14 r3 + name sm mono fg.subtle — inv:03 §7.1
      lib.upsertRect(b, 'image:dapp-favicon uniswap', { x: 116, y: 176, w: 14, h: 14, radius: 3, fill: '#FF007A' });
      lib.upsertText(b, 'dapp-name', { text: 'app.uniswap.org', size: 11, weight: 400, zone: 'mono', color: '#8C887E', x: 136, y: 177 });
      // encrypted badge: pill success.soft r-full padH8/padV4, Lock 12 + xs semibold success.base — inv:03 §7.1
      lib.upsertRect(b, 'encrypted-pill', { x: 100, y: 202, w: 142, h: 22, radius: 11, fill: '#EDFAF2' });
      icon(b, 'Lock', 12, 2, '#2D8E5F', 108, 207);
      lib.upsertText(b, 'encrypted-label', { text: 'End-to-end encrypted', size: 10, weight: 600, color: '#2D8E5F', x: 124, y: 207 }); // connect.list.encryptedBadge
      // full-width actions: accent Confirm + secondary Cancel (VelaButton recipe) — inv:03 §7.1, inv:02 A1
      lib.upsertRect(b, 'btn-confirm', { x: 20, y: 244, w: 302, h: 53, radius: 16, fill: '#E8572A' });
      lib.upsertText(b, 'btn-confirm-label', { text: 'Confirm', size: 15, weight: 600, color: '#FFFFFF', x: 145, y: 261 });
      const { rect: cancel } = lib.upsertRect(b, 'btn-cancel', { x: 20, y: 309, w: 302, h: 53, radius: 16, stroke: '#D8D6CE', strokeWidth: 1.5 });
      cancel.fills = [];
      lib.upsertText(b, 'btn-cancel-label', { text: 'Cancel', size: 15, weight: 600, color: '#1A1A18', x: 149, y: 326 });
      comps.push(penpot.library.local.createComponent([b]));
    }

    // -- waiting: open state, centered padV48 gap12 — inv:03 §7.1 state 2
    {
      const b = penpot.createBoard();
      b.name = 'waiting';
      b.x = sx; b.y = SY; sx += 342 + 40;
      b.resize(342, 260);
      b.fills = [];
      disc(b, 'halo', 64, '#E8572A', 139, 40, { fillOpacity: 0.07 }); // 64 circle accent.base+'12' 7% tint — inv:03 §7.1
      icon(b, 'Radio', 32, 2, '#E8572A', 155, 56);
      lib.upsertText(b, 'status', { text: 'Waiting for dApp to accept...', size: 15, weight: 600, color: '#E8572A', x: 76, y: 118 }); // text.lg semibold accent; connect.list.waitingStatus
      lib.upsertText(b, 'hint', { text: 'Go back to the dApp and approve the connection.', size: 13, weight: 400, color: '#6E6B62', x: 32, y: 146 }); // connect.list.waitingHint
      const { rect: cancel } = lib.upsertRect(b, 'btn-cancel', { x: 71, y: 190, w: 200, h: 42, radius: 16, stroke: '#D8D6CE', strokeWidth: 1.5 }); // compact secondary — inv:03 §7.1, inv:02 A1
      cancel.fills = [];
      lib.upsertText(b, 'btn-cancel-label', { text: 'Cancel', size: 13, weight: 600, color: '#1A1A18', x: 152, y: 202 });
      comps.push(penpot.library.local.createComponent([b]));
    }

    // -- error: open typographic state, centered padV32 gap8 — inv:03 §7.1 state 3
    {
      const b = penpot.createBoard();
      b.name = 'error';
      b.x = sx; b.y = SY; sx += 342 + 40;
      b.resize(342, 330);
      b.fills = [];
      disc(b, 'halo', 64, '#FEF2F2', 139, 28); // 64 circle error.soft — inv:03 §7.1
      icon(b, 'AlertTriangle', 28, 2, '#C62828', 157, 46); // error.base
      lib.upsertText(b, 'title', { text: 'Connection Failed', size: 17, weight: 700, color: '#1A1A18', x: 105, y: 106 }); // text.xl bold; connect.list.connFailed
      lib.upsertText(b, 'message', { text: 'Unable to connect to the bridge.', size: 13, weight: 400, color: '#6E6B62', x: 78, y: 136 }); // connect.list.connError
      lib.upsertRect(b, 'btn-scan-again', { x: 20, y: 176, w: 302, h: 53, radius: 16, fill: '#E8572A' }); // full-width accent — inv:03 §7.1
      lib.upsertText(b, 'btn-scan-again-label', { text: 'Scan Again', size: 15, weight: 600, color: '#FFFFFF', x: 134, y: 193 }); // connect.list.scanAgain
      const { rect: retry } = lib.upsertRect(b, 'btn-retry', { x: 20, y: 241, w: 302, h: 53, radius: 16, stroke: '#D8D6CE', strokeWidth: 1.5 }); // secondary, only when a session exists
      retry.fills = [];
      lib.upsertText(b, 'btn-retry-label', { text: 'Retry', size: 15, weight: 600, color: '#1A1A18', x: 153, y: 258 }); // connect.list.retry
      comps.push(penpot.library.local.createComponent([b]));
    }

    const container = await combine(comps, FAMILY, ['state'], 6400);
    lib.chip(container, 'motion', 'verify entering fadeInDown 300ms delay 50; error fadeInDown 300ms — iOS only (helper returns undefined elsewhere)');
    lib.chip(container, 'note', 'hosts own disconnected/connected (Connect screen list + Home Connections panel); fingerprint = 4-digit WalletPair code');
    summary.connectionFlowStates = comps.length;
  }
}

return lib.done('34c-components-media', summary);
