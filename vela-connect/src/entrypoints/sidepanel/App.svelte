<script lang="ts">
  import { bleClient } from '../../lib/ble';
  import type { ConnectionState, ConnectedDevice, WalletInfo, PendingRequest, PopupState, BLEResponse } from '../../lib/protocol';

  let connectionState: ConnectionState = $state('disconnected');
  let device: ConnectedDevice | undefined = $state(undefined);
  let walletInfo: WalletInfo | undefined = $state(undefined);
  let pendingRequests: PendingRequest[] = $state([]);
  let error: string | undefined = $state(undefined);

  // Sidepanel owns the BLE connection
  $effect(() => {
    // Get current state from background
    chrome.runtime.sendMessage({ type: 'VELA_POPUP_ACTION', action: 'getState' }, (response: PopupState) => {
      if (response) {
        connectionState = response.connectionState;
        device = response.device;
        walletInfo = response.walletInfo;
        pendingRequests = response.pendingRequests || [];
      }
    });

    // Listen for state updates from background
    const listener = (msg: any) => {
      if (msg.type === 'VELA_POPUP_STATE') {
        connectionState = msg.connectionState;
        device = msg.device;
        walletInfo = msg.walletInfo;
        pendingRequests = msg.pendingRequests || [];
      }
      // Background asks us to send a BLE request
      if (msg.type === 'VELA_BLE_SEND_REQUEST' && msg.request) {
        console.log('[SP] Sending BLE request:', msg.request.method, msg.request.id);
        bleClient.sendRequest(msg.request)
          .then(() => console.log('[SP] BLE request sent OK'))
          .catch(e => console.error('[SP] BLE send failed:', e));
      }
    };
    chrome.runtime.onMessage.addListener(listener);

    // Set up BLE event handlers — sidepanel is the BLE connection owner
    bleClient.setHandlers({
      onStateChange(state, dev) {
        connectionState = state;
        device = dev;
        chrome.runtime.sendMessage({ type: 'VELA_BLE_STATE', connectionState: state, device: dev });
      },
      onWalletInfo(info) {
        walletInfo = info;
        chrome.runtime.sendMessage({ type: 'VELA_BLE_WALLET_INFO', walletInfo: info });
      },
      onResponse(response: BLEResponse) {
        console.log('[SP] BLE response:', response.id);
        // Update local wallet info if it's a push
        if (response.id === 'wallet_info_update' && response.result) {
          walletInfo = response.result as WalletInfo;
        }
        chrome.runtime.sendMessage({ type: 'VELA_BLE_RESPONSE', response });
      },
      onDisconnect() {
        connectionState = 'disconnected';
        chrome.runtime.sendMessage({ type: 'VELA_BLE_STATE', connectionState: 'disconnected' });
      },
    });

    return () => chrome.runtime.onMessage.removeListener(listener);
  });

  async function startScan() {
    error = undefined;
    console.log('[SP] startScan called');
    console.log('[SP] navigator.bluetooth:', typeof navigator.bluetooth);
    console.log('[SP] navigator.bluetooth.requestDevice:', typeof navigator.bluetooth?.requestDevice);

    if (!navigator.bluetooth) {
      error = 'Web Bluetooth is not available in this context. Try opening Vela Connect in a tab.';
      // Fallback: open as a tab where Web Bluetooth works
      chrome.tabs.create({ url: chrome.runtime.getURL('/sidepanel.html') });
      return;
    }

    try {
      await bleClient.connect();
    } catch (e) {
      const msg = (e as Error).message || '';
      if (msg.includes('cancelled') || msg.includes('canceled')) {
        connectionState = 'disconnected';
        return;
      }
      error = msg;
      connectionState = 'disconnected';
    }
  }

  function disconnect() {
    bleClient.disconnect();
    connectionState = 'disconnected';
    device = undefined;
    walletInfo = undefined;
    chrome.runtime.sendMessage({ type: 'VELA_BLE_STATE', connectionState: 'disconnected' });
  }

  function rejectRequest(id: string) {
    chrome.runtime.sendMessage({ type: 'VELA_POPUP_ACTION', action: 'rejectRequest', requestId: id });
  }

  function switchAccount(address: string) {
    chrome.runtime.sendMessage({ type: 'VELA_POPUP_ACTION', action: 'switchAccount', address });
  }

  function shortAddr(addr: string): string {
    if (!addr || addr.length < 12) return addr;
    return addr.slice(0, 8) + '...' + addr.slice(-6);
  }

  function methodLabel(method: string): string {
    const labels: Record<string, string> = {
      eth_sendTransaction: 'Transaction',
      personal_sign: 'Sign Message',
      eth_signTypedData_v4: 'Sign Typed Data',
    };
    return labels[method] || method;
  }

  let activeRequest: PendingRequest | undefined = $derived(pendingRequests[0]);
</script>

<!-- Header -->
<div class="header">
  <div class="logo">
    <svg width="22" height="22" viewBox="0 0 80 80" fill="none">
      <path d="M38 12C38 12 22 44 18 64C18 64 38 56 40 54C42 56 62 64 62 64C58 44 42 12 42 12C42 12 40 10 38 12Z" fill="#E8572A"/>
      <path d="M40 54L40 72" stroke="#E8572A" stroke-width="3" stroke-linecap="round"/>
    </svg>
    <div class="logo-text">vel<span>a</span></div>
  </div>
  <div class="badge" class:off={connectionState === 'disconnected'} class:searching={connectionState === 'searching'} class:on={connectionState === 'connected'}>
    <div class="badge-dot"></div>
    {#if connectionState === 'disconnected'}No device
    {:else if connectionState === 'searching'}Searching…
    {:else}Connected{/if}
  </div>
</div>

<div class="body">
  {#if connectionState === 'connected' && activeRequest}
    <!-- Pending Request -->
    <div class="dapp-origin">
      {#if activeRequest.favicon}
        <img class="dapp-favicon" src={activeRequest.favicon} alt="" />
      {/if}
      <span class="dapp-url">{new URL(activeRequest.origin).hostname}</span>
    </div>

    <div class="tx-card">
      <div class="tx-header">
        <div class="tx-type">{methodLabel(activeRequest.method)}</div>
        {#if activeRequest.method === 'eth_sendTransaction'}
          {@const tx = activeRequest.params[0] as Record<string, string>}
          <div class="tx-amount">{tx.value ? (parseInt(tx.value, 16) / 1e18).toFixed(4) + ' ETH' : 'Contract Call'}</div>
        {:else}
          <div class="tx-amount">{methodLabel(activeRequest.method)}</div>
        {/if}
      </div>
      <div class="tx-row">
        <span class="tx-label">From</span>
        <span class="tx-value">{walletInfo ? shortAddr(walletInfo.address) : '...'}</span>
      </div>
      {#if activeRequest.method === 'eth_sendTransaction'}
        {@const tx = activeRequest.params[0] as Record<string, string>}
        <div class="tx-row">
          <span class="tx-label">To</span>
          <span class="tx-value">{shortAddr(tx.to || '')}</span>
        </div>
      {/if}
    </div>

    <div style="text-align:center;padding:20px 0;">
      <div class="spinner"></div>
      <div style="font-size:15px;font-weight:500;color:var(--text-1);">Confirm on phone</div>
      <div style="font-size:13px;color:var(--text-3);margin-top:4px;">Check Vela Wallet for the request</div>
    </div>

    <button class="btn btn-red" onclick={() => rejectRequest(activeRequest!.id)}>Reject</button>

  {:else if connectionState === 'connected'}
    <!-- Connected -->
    <div class="device-card">
      <div class="device-icon">💻</div>
      <div>
        <div class="device-name">{device?.name || 'Phone'}</div>
        <div class="device-status">
          <div class="badge-dot" style="width:5px;height:5px;background:var(--green);border-radius:50%;"></div>
          Bluetooth connected
        </div>
      </div>
    </div>

    {#if walletInfo}
      <div class="wallet-card">
        <div class="wallet-avatar">{walletInfo.name?.[0]?.toUpperCase() || 'V'}</div>
        <div style="flex:1;min-width:0;">
          <div class="wallet-addr">{shortAddr(walletInfo.address)}</div>
          <div class="wallet-network">{walletInfo.name}</div>
        </div>
      </div>

      {#if walletInfo.accounts && walletInfo.accounts.length > 1}
        <div style="margin-top:10px;">
          <div style="font-size:10px;font-weight:600;letter-spacing:1px;color:var(--text-3);margin-bottom:6px;">SWITCH ACCOUNT</div>
          {#each walletInfo.accounts as account}
            {#if account.address !== walletInfo.address}
              <button
                style="display:flex;align-items:center;gap:8px;width:100%;padding:10px 12px;background:var(--bg-card);border:1px solid var(--border);border-radius:10px;cursor:pointer;margin-bottom:4px;text-align:left;"
                onclick={() => switchAccount(account.address)}
              >
                <div style="width:28px;height:28px;border-radius:50%;background:var(--bg-warm);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:var(--text-2);">
                  {account.name?.[0]?.toUpperCase() || '?'}
                </div>
                <div style="flex:1;min-width:0;">
                  <div style="font-size:12px;font-weight:600;color:var(--text-1);">{account.name}</div>
                  <div style="font-size:10px;color:var(--text-3);font-family:'Space Grotesk',sans-serif;">{shortAddr(account.address)}</div>
                </div>
              </button>
            {/if}
          {/each}
        </div>
      {/if}
    {/if}

    <div class="inject-banner">
      <div class="inject-dot"></div>
      Provider active — dApps can send requests
    </div>

    <div style="margin-top:auto;padding-top:20px;">
      <button class="btn btn-red" onclick={disconnect}>Disconnect</button>
    </div>

  {:else if connectionState === 'searching'}
    <div class="center-state">
      <div class="center-icon pulse-ring" style="background:var(--blue-soft);">🔗</div>
      <div class="center-title">Searching…</div>
      <div class="center-desc">Make sure Vela Wallet is open on your phone with Bluetooth enabled.</div>
      <button class="btn btn-ghost" onclick={disconnect}>Cancel</button>
    </div>

  {:else}
    <div class="center-state">
      <div class="center-icon" style="background:var(--blue-soft);">📱</div>
      <div class="center-title">Connect your phone</div>
      <div class="center-desc">Pair with Vela Wallet on your phone via Bluetooth to use dApps.</div>
      {#if error}
        <div style="font-size:12px;color:var(--accent);margin-bottom:12px;">{error}</div>
      {/if}
      <button class="btn btn-blue" onclick={startScan}>Pair with phone</button>
    </div>
  {/if}
</div>

<div class="footer">
  <span>Vela Connect v1.0.0</span>
</div>
