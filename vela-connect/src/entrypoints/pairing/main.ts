import { bleClient } from '@/lib/ble';
import type { WalletInfo } from '@/lib/protocol';

/**
 * Pairing page — runs as a full Chrome tab where Web Bluetooth is available.
 * Opened by popup/sidepanel when user clicks "Pair with phone".
 * After successful connection, notifies background and closes itself.
 */

const app = document.getElementById('app')!;

// Styles
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
    connected: 'Connected!',
    error: 'Connection Failed',
  };

  app.innerHTML = `
    <div style="text-align:center;max-width:360px;padding:40px 24px;">
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
        <p style="color:#2D8E5F;font-weight:600;margin-top:12px;">This tab will close automatically...</p>
      ` : ''}
    </div>
  `;

  const btn = document.getElementById('pair-btn');
  if (btn) btn.addEventListener('click', startPairing);
}

async function startPairing() {
  render('searching', 'Make sure Vela Wallet is open on your phone with Bluetooth enabled.');

  bleClient.setHandlers({
    onStateChange(state, device) {
      chrome.runtime.sendMessage({
        type: 'VELA_BLE_STATE',
        connectionState: state,
        device,
      });
    },
    onWalletInfo(info: WalletInfo) {
      chrome.runtime.sendMessage({
        type: 'VELA_BLE_WALLET_INFO',
        walletInfo: info,
      });
    },
    onResponse(response) {
      chrome.runtime.sendMessage({
        type: 'VELA_BLE_RESPONSE',
        response,
      });
    },
    onDisconnect() {
      chrome.runtime.sendMessage({
        type: 'VELA_BLE_STATE',
        connectionState: 'disconnected',
      });
    },
  });

  try {
    await bleClient.connect();
    render('connected', 'Successfully paired with your phone.');
    // Close tab after a short delay
    setTimeout(() => window.close(), 1500);
  } catch (error) {
    render('error', (error as Error).message || 'Failed to connect. Please try again.');
  }
}

// Initial render
render('idle');
