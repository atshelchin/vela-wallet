import { bleClient } from '@/lib/ble';
import type { WalletInfo } from '@/lib/protocol';

/**
 * Pairing page — runs as a full Chrome tab where Web Bluetooth is available.
 *
 * IMPORTANT: This tab must stay open to maintain the BLE connection.
 * Web Bluetooth events are tied to the page context — closing kills them.
 * The tab stays open but shows a minimal connected status.
 */

const app = document.getElementById('app')!;

document.body.style.cssText = `
  margin:0; font-family:'Inter',-apple-system,sans-serif;
  background:#FAFAF8; color:#1A1A18;
  display:flex; align-items:center; justify-content:center;
  min-height:100vh;
`;

function render(state: 'idle' | 'searching' | 'connected' | 'error', message?: string) {
  const icons = { idle: '📱', searching: '🔗', connected: '✅', error: '❌' };
  const titles = {
    idle: 'Pair with Vela Wallet',
    searching: 'Searching...',
    connected: 'Connected',
    error: 'Connection Failed',
  };

  app.innerHTML = `
    <div style="text-align:center;max-width:400px;padding:40px 24px;">
      <div style="font-size:48px;margin-bottom:20px;">${icons[state]}</div>
      <h2 style="font-family:'Space Grotesk',sans-serif;font-size:22px;font-weight:700;margin:0 0 8px;">${titles[state]}</h2>
      <p style="color:#7A776E;font-size:14px;line-height:1.5;margin:0 0 24px;">
        ${message || 'Click the button below to scan for your Vela Wallet via Bluetooth.'}
      </p>
      ${state === 'idle' || state === 'error' ? `
        <button id="pair-btn" style="
          background:#4267F4;color:#fff;border:none;padding:14px 32px;
          border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;
          font-family:'Space Grotesk',sans-serif;
        ">Start Bluetooth Scan</button>
      ` : ''}
      ${state === 'searching' ? `
        <div style="width:40px;height:40px;border:3px solid #ECEAE4;border-top-color:#E8572A;
          border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto;"></div>
        <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
      ` : ''}
      ${state === 'connected' ? `
        <div style="background:#EDFAF2;color:#2D8E5F;padding:12px 20px;border-radius:10px;font-size:13px;font-weight:500;margin-top:12px;">
          ⚠️ Keep this tab open to maintain the Bluetooth connection.<br>
          You can minimize it — do not close it.
        </div>
        <p id="status-line" style="color:#B0ADA5;font-size:12px;margin-top:16px;">Listening for requests...</p>
      ` : ''}
    </div>
  `;

  const btn = document.getElementById('pair-btn');
  if (btn) btn.addEventListener('click', startPairing);

  // Update tab title
  document.title = state === 'connected' ? '🟢 Vela Connected' : 'Vela Connect';
}

let eventCount = 0;

async function startPairing() {
  render('searching', 'Make sure Vela Wallet is open on your phone with Bluetooth enabled.');

  bleClient.setHandlers({
    onStateChange(state, device) {
      console.log('[Pairing] State:', state, device?.name);
      chrome.runtime.sendMessage({
        type: 'VELA_BLE_STATE',
        connectionState: state,
        device,
      });
      if (state === 'disconnected') {
        render('error', 'Connection lost. Click to reconnect.');
      }
    },
    onWalletInfo(info: WalletInfo) {
      console.log('[Pairing] Wallet info:', info.name, info.address?.slice(0, 12));
      chrome.runtime.sendMessage({
        type: 'VELA_BLE_WALLET_INFO',
        walletInfo: info,
      });
      updateStatusLine(`Wallet: ${info.name} (${info.address?.slice(0, 8)}...)`);
    },
    onResponse(response) {
      eventCount++;
      console.log('[Pairing] Response #' + eventCount + ':', response.id, JSON.stringify(response).slice(0, 150));
      chrome.runtime.sendMessage({
        type: 'VELA_BLE_RESPONSE',
        response,
      });
      updateStatusLine(`Event #${eventCount}: ${response.id}`);
    },
    onDisconnect() {
      console.log('[Pairing] Disconnected');
      chrome.runtime.sendMessage({
        type: 'VELA_BLE_STATE',
        connectionState: 'disconnected',
      });
      render('error', 'Disconnected. Click to reconnect.');
    },
  });

  try {
    await bleClient.connect();
    render('connected', 'Bluetooth connection is active.');
    // DO NOT close this tab — BLE events need it alive
  } catch (error) {
    render('error', (error as Error).message || 'Failed to connect. Please try again.');
  }
}

function updateStatusLine(text: string) {
  const el = document.getElementById('status-line');
  if (el) el.textContent = text;
}

// Also listen for requests from background to send via BLE
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'VELA_BLE_SEND_REQUEST') {
    console.log('[Pairing] Sending BLE request:', msg.request.method);
    bleClient.sendRequest(msg.request).then(() => {
      sendResponse({ ok: true });
    }).catch((e: Error) => {
      sendResponse({ error: e.message });
    });
    return true;
  }
});

render('idle');
