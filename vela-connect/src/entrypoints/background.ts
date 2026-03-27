/**
 * Background Service Worker — routes messages between content scripts and BLE.
 *
 * Manages:
 * - BLE connection state
 * - Pending dApp requests
 * - Request forwarding to phone and response routing back
 */
import { bleClient } from '@/lib/ble';
import type {
  ConnectionState,
  ConnectedDevice,
  WalletInfo,
  BLERequest,
  BLEResponse,
  PendingRequest,
  PopupState,
} from '@/lib/protocol';

// ─── State ───

let connectionState: ConnectionState = 'disconnected';
let connectedDevice: ConnectedDevice | undefined;
let walletInfo: WalletInfo | undefined;
const pendingRequests: Map<string, PendingRequest> = new Map();
const responseCallbacks: Map<string, (response: { result?: unknown; error?: { code: number; message: string } }) => void> = new Map();

// ─── BLE Event Handlers ───

bleClient.setHandlers({
  onStateChange(state, device) {
    connectionState = state;
    connectedDevice = device;
    broadcastState();
  },

  onWalletInfo(info) {
    walletInfo = info;
    broadcastState();
  },

  onResponse(response: BLEResponse) {
    console.log('[BG] onResponse received:', response.id, JSON.stringify(response).slice(0, 200));

    // Handle wallet info push from phone (account switch notification)
    if (response.id === 'wallet_info_update' && response.result) {
      const info = response.result as WalletInfo;
      walletInfo = info;
      broadcastState();
      console.log('[BG] Wallet info updated:', info.name, info.address?.slice(0, 10));
      return;
    }

    // Route response back to the waiting content script
    const callback = responseCallbacks.get(response.id);
    if (callback) {
      callback({ result: response.result, error: response.error });
      responseCallbacks.delete(response.id);
      pendingRequests.delete(response.id);
    }
  },

  onDisconnect() {
    connectionState = 'disconnected';
    connectedDevice = undefined;
    // Reject all pending requests
    for (const [id, _] of pendingRequests) {
      const callback = responseCallbacks.get(id);
      if (callback) {
        callback({ error: { code: 4900, message: 'Disconnected from wallet' } });
      }
    }
    pendingRequests.clear();
    responseCallbacks.clear();
    broadcastState();
  },
});

// ─── Message Handlers ───

export default defineBackground(() => {
  console.log('[Vela] Background started');

  // Handle messages from content scripts and popup
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'VELA_PROVIDER_REQUEST') {
      handleProviderRequest(msg, sender, sendResponse);
      return true; // async response
    }

    if (msg.type === 'VELA_POPUP_ACTION') {
      handlePopupAction(msg, sendResponse);
      return true;
    }

    // Messages from pairing page (BLE events)
    if (msg.type === 'VELA_BLE_STATE') {
      connectionState = msg.connectionState;
      connectedDevice = msg.device;
      broadcastState();
      return false;
    }
    if (msg.type === 'VELA_BLE_WALLET_INFO') {
      walletInfo = msg.walletInfo;
      broadcastState();
      return false;
    }
    if (msg.type === 'VELA_BLE_RESPONSE') {
      const response = msg.response;
      console.log('[BG] BLE response via pairing tab:', response.id);

      // Handle wallet info push
      if (response.id === 'wallet_info_update' && response.result) {
        walletInfo = response.result as WalletInfo;
        console.log('[BG] Wallet info updated from push:', walletInfo.name, walletInfo.address?.slice(0, 12));
        broadcastState();
        return false;
      }

      // Route to waiting callback
      const callback = responseCallbacks.get(response.id);
      if (callback) {
        callback({ result: response.result, error: response.error });
        responseCallbacks.delete(response.id);
        pendingRequests.delete(response.id);
      }
      return false;
    }

    return false;
  });
});

// ─── Provider Request Handler ───

async function handleProviderRequest(
  msg: { id: string; method: string; params: unknown[]; origin: string; favicon?: string },
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void
) {
  // Handle read-only methods locally
  if (msg.method === 'eth_accounts' || msg.method === 'eth_requestAccounts') {
    if (walletInfo) {
      sendResponse({ result: [walletInfo.address] });
    } else {
      sendResponse({ error: { code: 4100, message: 'Not connected to wallet' } });
    }
    return;
  }

  if (msg.method === 'eth_chainId') {
    if (walletInfo) {
      sendResponse({ result: '0x' + walletInfo.chainId.toString(16) });
    } else {
      sendResponse({ error: { code: 4100, message: 'Not connected to wallet' } });
    }
    return;
  }

  if (msg.method === 'net_version') {
    if (walletInfo) {
      sendResponse({ result: walletInfo.chainId.toString() });
    } else {
      sendResponse({ error: { code: 4100, message: 'Not connected' } });
    }
    return;
  }

  // Forward signing/transaction requests to phone via BLE
  if (connectionState !== 'connected') {
    sendResponse({ error: { code: 4900, message: 'Not connected to wallet' } });
    return;
  }

  // Store pending request
  const pending: PendingRequest = {
    id: msg.id,
    method: msg.method,
    params: msg.params,
    origin: msg.origin,
    favicon: msg.favicon,
    timestamp: Date.now(),
  };
  pendingRequests.set(msg.id, pending);
  responseCallbacks.set(msg.id, sendResponse);

  // Send to phone
  const bleRequest: BLERequest = {
    id: msg.id,
    method: msg.method as BLERequest['method'],
    params: msg.params,
    origin: msg.origin,
    favicon: msg.favicon,
  };

  try {
    await sendViaBLE(bleRequest);
    broadcastState();
  } catch (error) {
    sendResponse({ error: { code: -32603, message: 'Failed to send to wallet' } });
    pendingRequests.delete(msg.id);
    responseCallbacks.delete(msg.id);
  }
}

/** Send a BLE request through the pairing tab (which holds the Web Bluetooth connection). */
async function sendViaBLE(request: BLERequest): Promise<void> {
  // Find the pairing tab
  const tabs = await chrome.tabs.query({ url: chrome.runtime.getURL('/pairing.html') });
  if (tabs.length === 0 || !tabs[0].id) {
    throw new Error('Pairing tab not found — please reconnect');
  }

  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabs[0].id!, {
      type: 'VELA_BLE_SEND_REQUEST',
      request,
    }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (response?.error) {
        reject(new Error(response.error));
      } else {
        resolve();
      }
    });
  });
}

// ─── Popup Action Handler ───

async function handlePopupAction(
  msg: { action: string; requestId?: string; address?: string },
  sendResponse: (response: unknown) => void
) {
  switch (msg.action) {
    case 'startScan':
      // Web Bluetooth requires a full page context (not popup/sidepanel)
      // Open the pairing page in a new tab
      chrome.tabs.create({
        url: chrome.runtime.getURL('/pairing.html'),
        active: true,
      });
      connectionState = 'searching';
      broadcastState();
      sendResponse({ ok: true });
      break;

    case 'disconnect':
      connectionState = 'disconnected';
      connectedDevice = undefined;
      walletInfo = undefined;
      broadcastState();
      // Close pairing tab (which will disconnect BLE)
      chrome.tabs.query({ url: chrome.runtime.getURL('/pairing.html') }, (tabs) => {
        tabs.forEach(t => { if (t.id) chrome.tabs.remove(t.id); });
      });
      sendResponse({ ok: true });
      break;

    case 'getState':
      sendResponse(getPopupState());
      break;

    case 'rejectRequest':
      if (msg.requestId) {
        const callback = responseCallbacks.get(msg.requestId);
        if (callback) {
          callback({ error: { code: 4001, message: 'User rejected the request' } });
        }
        pendingRequests.delete(msg.requestId);
        responseCallbacks.delete(msg.requestId);
        broadcastState();
      }
      sendResponse({ ok: true });
      break;

    case 'switchAccount': {
      // Send switch request to phone via BLE
      const switchReq: BLERequest = {
        id: `switch_${Date.now()}`,
        method: 'wallet_switchAccount',
        params: [msg.address],
        origin: 'chrome-extension',
      };
      try {
        await sendViaBLE(switchReq);
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ error: (e as Error).message });
      }
      break;
    }

    default:
      sendResponse({ error: 'Unknown action' });
  }
}

// ─── State Broadcasting ───

function getPopupState(): PopupState {
  return {
    type: 'VELA_POPUP_STATE',
    connectionState,
    device: connectedDevice,
    walletInfo,
    pendingRequests: Array.from(pendingRequests.values()),
  };
}

function broadcastState() {
  const state = getPopupState();
  // Send to all extension pages (popup, etc.)
  chrome.runtime.sendMessage(state).catch(() => {
    // Popup might not be open — ignore
  });
}
