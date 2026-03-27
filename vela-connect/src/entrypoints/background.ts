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
      // Force notify all dApps on first connection
      lastBroadcastAddress = undefined;
      broadcastState();
      // Also emit 'connect' event
      notifyDApps('connect', { chainId: '0x' + (walletInfo.chainId || 1).toString(16) });
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
        console.log('[BG] Resolving callback for:', response.id);
        callback({ result: response.result, error: response.error });
        responseCallbacks.delete(response.id);
        pendingRequests.delete(response.id);
        broadcastState(); // Update sidepanel to clear pending request
      } else {
        console.log('[BG] No callback found for:', response.id);
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
  // Supported chain IDs (same address on all via CREATE2)
  const SUPPORTED_CHAINS = [1, 56, 137, 42161, 10, 8453, 43114];

  // Handle read-only methods locally
  if (msg.method === 'eth_accounts') {
    sendResponse({ result: walletInfo ? [walletInfo.address] : [] });
    return;
  }

  if (msg.method === 'eth_requestAccounts') {
    if (walletInfo) {
      sendResponse({ result: [walletInfo.address] });
    } else {
      // Not connected yet — open pairing tab and wait for connection
      const pairingUrl = chrome.runtime.getURL('/pairing.html');
      chrome.tabs.query({ url: pairingUrl }, (tabs) => {
        if (tabs.length === 0) chrome.tabs.create({ url: pairingUrl, active: true });
      });
      // Wait for wallet to connect (poll for up to 60s)
      let waited = 0;
      const interval = setInterval(() => {
        waited += 500;
        if (walletInfo) {
          clearInterval(interval);
          sendResponse({ result: [walletInfo.address] });
        } else if (waited > 60000) {
          clearInterval(interval);
          sendResponse({ error: { code: 4001, message: 'Connection timed out' } });
        }
      }, 500);
    }
    return;
  }

  if (msg.method === 'wallet_getPermissions') {
    sendResponse({ result: [{ parentCapability: 'eth_accounts' }] });
    return;
  }

  if (msg.method === 'wallet_requestPermissions') {
    sendResponse({ result: [{ parentCapability: 'eth_accounts' }] });
    return;
  }

  // wallet_switchEthereumChain — Safe address is same on all chains
  if (msg.method === 'wallet_switchEthereumChain') {
    const params = msg.params as Array<{ chainId: string }>;
    const chainIdHex = params?.[0]?.chainId;
    if (chainIdHex) {
      const chainId = parseInt(chainIdHex, 16);
      if (SUPPORTED_CHAINS.includes(chainId)) {
        // Update local chainId
        if (walletInfo) walletInfo = { ...walletInfo, chainId };
        // Notify phone to sync chainId
        sendViaBLE({
          id: `chain_${Date.now()}`,
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: chainIdHex }],
          origin: msg.origin,
        }).catch(() => {}); // best effort
        // Notify dApps
        notifyDApps('chainChanged', chainIdHex);
        broadcastState();
        sendResponse({ result: null });
      } else {
        sendResponse({ error: { code: 4902, message: `Chain ${chainId} not supported` } });
      }
    } else {
      sendResponse({ error: { code: -32602, message: 'Invalid params' } });
    }
    return;
  }

  if (msg.method === 'wallet_addEthereumChain') {
    // We support all 7 chains — just return success
    sendResponse({ result: null });
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
    sendResponse({ result: walletInfo ? walletInfo.chainId.toString() : '1' });
    return;
  }

  // ─── Signing methods → forward to phone via BLE ───
  const SIGNING_METHODS = [
    'eth_sendTransaction', 'eth_signTransaction',
    'personal_sign', 'eth_sign',
    'eth_signTypedData', 'eth_signTypedData_v3', 'eth_signTypedData_v4',
  ];

  if (SIGNING_METHODS.includes(msg.method)) {
    console.log('[BG] Forward to phone:', msg.method);
  if (connectionState !== 'connected') {
    // If we have wallet info but state is wrong, try anyway
    if (!walletInfo) {
      sendResponse({ error: { code: 4900, message: 'Not connected to wallet. Please pair first.' } });
      return;
    }
    console.log('[BG] State is', connectionState, 'but walletInfo exists, trying anyway');
  }

  // Clean up stale pending requests (older than 5 minutes)
  const now = Date.now();
  for (const [id, req] of pendingRequests) {
    if (now - req.timestamp > 300_000) {
      const cb = responseCallbacks.get(id);
      if (cb) cb({ error: { code: -32603, message: 'Request timed out' } });
      pendingRequests.delete(id);
      responseCallbacks.delete(id);
    }
  }

  // Store pending request
  const pending: PendingRequest = {
    id: msg.id,
    method: msg.method,
    params: msg.params,
    origin: msg.origin,
    favicon: msg.favicon,
    timestamp: now,
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
    return;
  }

  // ─── Everything else → forward to RPC node ───
  const chainId = walletInfo?.chainId || 1;
  const networkMap: Record<number, string> = {
    1: 'eth-mainnet', 56: 'bnb-mainnet', 137: 'matic-mainnet',
    42161: 'arb-mainnet', 10: 'opt-mainnet', 8453: 'base-mainnet', 43114: 'avax-mainnet',
  };
  const network = networkMap[chainId] || 'eth-mainnet';

  try {
    const rpcResponse = await fetch('https://getvela.app/api/bundler', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: msg.method, params: msg.params, network }),
    });
    const rpcResult = await rpcResponse.json();
    sendResponse(rpcResult.error ? { error: rpcResult.error } : { result: rpcResult.result });
  } catch (e) {
    sendResponse({ error: { code: -32603, message: (e as Error).message } });
  }
}

/** Send a BLE request to the pairing page (which holds the Web Bluetooth connection). */
async function sendViaBLE(request: BLERequest): Promise<void> {
  console.log('[BG] sendViaBLE:', request.method, request.id);
  // Use chrome.runtime.sendMessage — pairing page listens on chrome.runtime.onMessage
  // (NOT chrome.tabs.sendMessage which only reaches content scripts)
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({
      type: 'VELA_BLE_SEND_REQUEST',
      request,
    }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error('BLE bridge not available — please pair first'));
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
    case 'startScan': {
      // Open pairing tab — Web Bluetooth only works in tab context
      const pairingUrl = chrome.runtime.getURL('/pairing.html');
      chrome.tabs.query({ url: pairingUrl }, (tabs) => {
        if (tabs.length > 0 && tabs[0].id) {
          chrome.tabs.update(tabs[0].id, { active: true });
        } else {
          chrome.tabs.create({ url: pairingUrl, active: true });
        }
      });
      sendResponse({ ok: true });
      break;
    }

    case 'disconnect':
      connectionState = 'disconnected';
      connectedDevice = undefined;
      walletInfo = undefined;
      broadcastState();
      // Close pairing tab (disconnects BLE)
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

let lastBroadcastAddress: string | undefined;

function broadcastState() {
  const state = getPopupState();
  // Send to all extension pages (popup, sidepanel)
  chrome.runtime.sendMessage(state).catch(() => {});

  // Notify dApps if account changed
  if (walletInfo?.address && walletInfo.address !== lastBroadcastAddress) {
    const prevAddr = lastBroadcastAddress;
    lastBroadcastAddress = walletInfo.address;
    console.log('[BG] Account changed:', prevAddr?.slice(0, 10), '→', walletInfo.address.slice(0, 10));

    // Send accountsChanged to all tabs via content scripts
    chrome.tabs.query({}, (tabs) => {
      let sent = 0;
      for (const tab of tabs) {
        if (tab.id && tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://')) {
          chrome.tabs.sendMessage(tab.id, {
            type: 'VELA_ACCOUNTS_CHANGED',
            accounts: [walletInfo!.address],
            chainId: walletInfo!.chainId,
          }).then(() => {
            sent++;
            console.log('[BG] accountsChanged sent to tab:', tab.id, tab.url?.slice(0, 40));
          }).catch(() => {});
        }
      }
      console.log('[BG] Sent accountsChanged to', tabs.length, 'tabs');
    });
  }
}

/** Send an EIP-1193 event to all dApp tabs */
function notifyDApps(eventName: string, data: unknown) {
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (tab.id && tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://')) {
        chrome.tabs.sendMessage(tab.id, {
          type: 'VELA_EMIT',
          event: eventName,
          data,
        }).catch(() => {});
      }
    }
  });
  console.log('[BG] Emitted', eventName, 'to all dApps');
}
