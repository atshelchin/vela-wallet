import { bleClient } from '@/lib/ble';
import type { WalletInfo, BLEResponse } from '@/lib/protocol';

/**
 * Pairing + BLE bridge tab.
 *
 * Web Bluetooth requestDevice() only works in a tab context (not popup/sidepanel).
 * This tab handles pairing and stays open as the BLE connection bridge.
 * It can be minimized — the connection persists as long as the tab exists.
 */

const app = document.getElementById('app')!;

document.body.style.cssText = `
  margin:0; font-family:'Inter',-apple-system,sans-serif;
  background:#FAFAF8; color:#1A1A18;
  display:flex; align-items:center; justify-content:center;
  min-height:100vh;
`;

let eventCount = 0;

function render(state: 'idle' | 'searching' | 'connected' | 'error', message?: string) {
  const icons = { idle: '📱', searching: '🔗', connected: '✅', error: '❌' };
  const titles = {
    idle: 'Pair with Vela Wallet',
    searching: 'Connecting...',
    connected: 'Connected',
    error: 'Connection Failed',
  };

  app.innerHTML = `
    <div style="text-align:center;max-width:400px;padding:40px 24px;">
      <div style="font-size:48px;margin-bottom:20px;">${icons[state]}</div>
      <h2 style="font-family:'Space Grotesk',sans-serif;font-size:22px;font-weight:700;margin:0 0 8px;">${titles[state]}</h2>
      <p style="color:#7A776E;font-size:14px;line-height:1.6;margin:0 0 24px;">
        ${message || 'Click below to scan for your Vela Wallet via Bluetooth.'}
      </p>
      ${state === 'idle' || state === 'error' ? `
        <button id="pair-btn" style="
          background:#4267F4;color:#fff;border:none;padding:14px 32px;
          border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;
          font-family:'Space Grotesk',sans-serif;width:100%;max-width:280px;
        ">Start Bluetooth Scan</button>
      ` : ''}
      ${state === 'searching' ? `
        <div style="width:40px;height:40px;border:3px solid #ECEAE4;border-top-color:#E8572A;
          border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto;"></div>
        <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
      ` : ''}
      ${state === 'connected' ? `
        <div style="background:#EDFAF2;color:#2D8E5F;padding:14px 20px;border-radius:12px;font-size:13px;font-weight:500;line-height:1.6;margin-top:12px;">
          Bluetooth connection active.<br>
          You can minimize this tab — <strong>do not close it</strong>.
        </div>
        <p id="status-line" style="color:#B0ADA5;font-size:12px;margin-top:16px;">Listening for events...</p>
        <button id="disconnect-btn" style="
          background:none;color:#E8572A;border:1.5px solid rgba(232,87,42,0.25);padding:12px 24px;
          border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;
          font-family:'Space Grotesk',sans-serif;margin-top:20px;width:100%;max-width:280px;
        ">Disconnect</button>
      ` : ''}
    </div>
  `;

  document.getElementById('pair-btn')?.addEventListener('click', startPairing);
  document.getElementById('disconnect-btn')?.addEventListener('click', () => {
    bleClient.disconnect();
    render('idle');
  });

  document.title = state === 'connected' ? '🟢 Vela Connected' : 'Vela Connect';
}

function updateStatus(text: string) {
  const el = document.getElementById('status-line');
  if (el) el.textContent = text;
}

async function startPairing() {
  render('searching', 'Make sure Vela Wallet is open on your phone with Bluetooth enabled.');

  bleClient.setHandlers({
    onStateChange(state, device) {
      console.log('[Bridge] State:', state, device?.name);
      chrome.runtime.sendMessage({ type: 'VELA_BLE_STATE', connectionState: state, device });
      if (state === 'disconnected') render('error', 'Connection lost. Click to reconnect.');
    },
    onWalletInfo(info: WalletInfo) {
      console.log('[Bridge] Wallet:', info.name, info.address?.slice(0, 12));
      chrome.runtime.sendMessage({ type: 'VELA_BLE_WALLET_INFO', walletInfo: info });
      updateStatus(`Wallet: ${info.name}`);
    },
    onResponse(response: BLEResponse) {
      eventCount++;
      console.log('[Bridge] Response #' + eventCount + ':', response.id);
      chrome.runtime.sendMessage({ type: 'VELA_BLE_RESPONSE', response });
      updateStatus(`Event #${eventCount}: ${response.id}`);
    },
    onDisconnect() {
      console.log('[Bridge] Disconnected');
      chrome.runtime.sendMessage({ type: 'VELA_BLE_STATE', connectionState: 'disconnected' });
      render('error', 'Disconnected. Click to reconnect.');
    },
  });

  try {
    await bleClient.connect();
    render('connected', 'Bluetooth connection active.');
  } catch (e) {
    const msg = (e as Error).message || '';
    if (msg.includes('cancel')) {
      render('idle');
    } else {
      render('error', msg || 'Connection failed.');
    }
  }
}

// Listen for BLE send requests from background
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'VELA_BLE_SEND_REQUEST' && msg.request) {
    console.log('[Bridge] Sending:', msg.request.method);
    bleClient.sendRequest(msg.request)
      .then(() => sendResponse({ ok: true }))
      .catch((e: Error) => sendResponse({ error: e.message }));
    return true; // async
  }
});

render('idle');
