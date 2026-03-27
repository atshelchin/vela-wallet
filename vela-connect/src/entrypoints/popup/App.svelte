<script lang="ts">
  import type { ConnectionState, ConnectedDevice, WalletInfo, PendingRequest, PopupState } from '../../lib/protocol';

  let connectionState: ConnectionState = $state('disconnected');
  let device: ConnectedDevice | undefined = $state(undefined);
  let walletInfo: WalletInfo | undefined = $state(undefined);
  let pendingRequests: PendingRequest[] = $state([]);
  let error: string | undefined = $state(undefined);

  // Load state from background on mount
  $effect(() => {
    chrome.runtime.sendMessage({ type: 'VELA_POPUP_ACTION', action: 'getState' }, (response: PopupState) => {
      if (response) {
        connectionState = response.connectionState;
        device = response.device;
        walletInfo = response.walletInfo;
        pendingRequests = response.pendingRequests || [];
      }
    });

    // Listen for state updates
    const listener = (msg: PopupState) => {
      if (msg.type === 'VELA_POPUP_STATE') {
        connectionState = msg.connectionState;
        device = msg.device;
        walletInfo = msg.walletInfo;
        pendingRequests = msg.pendingRequests || [];
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  });

  function startScan() {
    // Open sidepanel for BLE pairing (Web Bluetooth needs a persistent page)
    switchToSidePanel();
  }

  function disconnect() {
    chrome.runtime.sendMessage({ type: 'VELA_POPUP_ACTION', action: 'disconnect' });
  }

  function rejectRequest(id: string) {
    chrome.runtime.sendMessage({ type: 'VELA_POPUP_ACTION', action: 'rejectRequest', requestId: id });
  }

  function switchAccount(address: string) {
    // Send switch request to phone via BLE
    chrome.runtime.sendMessage({
      type: 'VELA_POPUP_ACTION',
      action: 'switchAccount',
      address,
    });
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
      eth_signTransaction: 'Sign Transaction',
    };
    return labels[method] || method;
  }

  function switchToSidePanel() {
    chrome.sidePanel.open({ windowId: chrome.windows.WINDOW_ID_CURRENT as number });
    window.close();
  }

  // Current pending request for detail view
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
        {:else if activeRequest.method === 'personal_sign'}
          <div style="font-size:13px;color:var(--text-1);line-height:1.5;margin-top:4px;font-family:'Space Grotesk',sans-serif;">
            {typeof activeRequest.params[0] === 'string' ? activeRequest.params[0].slice(0, 100) : 'Message'}
          </div>
        {:else}
          <div class="tx-amount">{activeRequest.method}</div>
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

    <div style="text-align:center;padding:16px 0;">
      <div class="spinner"></div>
      <div style="font-size:14px;font-weight:500;color:var(--text-1);">Confirm on phone</div>
      <div style="font-size:12px;color:var(--text-3);">Check Vela Wallet for the request</div>
    </div>

    <button class="btn btn-red" onclick={() => rejectRequest(activeRequest!.id)}>Reject</button>

  {:else if connectionState === 'connected'}
    <!-- Connected Idle -->
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
      <!-- Active account -->
      <div class="wallet-card">
        <div class="wallet-avatar">{walletInfo.name?.[0]?.toUpperCase() || 'V'}</div>
        <div style="flex:1;min-width:0;">
          <div class="wallet-addr">{shortAddr(walletInfo.address)}</div>
          <div class="wallet-network">{walletInfo.name}</div>
        </div>
      </div>

      <!-- Account list (if multiple) -->
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
    <!-- Searching -->
    <div class="center-state">
      <div class="center-icon pulse-ring" style="background:var(--blue-soft);">🔗</div>
      <div class="center-title">Searching…</div>
      <div class="center-desc">Make sure Vela Wallet is open on your phone with Bluetooth enabled.</div>
      <button class="btn btn-ghost" onclick={disconnect}>Cancel</button>
    </div>

  {:else}
    <!-- Disconnected -->
    <div class="center-state">
      <div class="center-icon" style="background:var(--blue-soft);">📱</div>
      <div class="center-title">Connect your phone</div>
      <div class="center-desc">Pair with Vela Wallet on your phone via Bluetooth to use dApps.</div>
      {#if error}
        <div style="font-size:12px;color:var(--accent);margin-bottom:12px;">{error}</div>
      {/if}
      <button class="btn btn-blue" onclick={startScan}>
        Pair with phone
      </button>
    </div>
  {/if}
</div>

<div class="footer" style="display:flex;justify-content:space-between;align-items:center;">
  <span>Vela Connect v1.0.0</span>
  <button style="font-size:10px;font-weight:500;color:var(--blue);cursor:pointer;background:none;border:none;padding:3px 6px;border-radius:4px;" onclick={switchToSidePanel}>Open Side Panel</button>
</div>
