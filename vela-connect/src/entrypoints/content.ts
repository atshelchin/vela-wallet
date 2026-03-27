/**
 * Content Script — bridges page ↔ background (ISOLATED world).
 */
export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',

  main() {
    console.log('[Vela Content] loaded on', window.location.hostname);

    // Forward provider requests from page → background
    window.addEventListener('message', async (event) => {
      if (event.source !== window) return;
      if (event.data?.type !== 'VELA_PROVIDER_REQUEST') return;

      const { id, method, params, origin, favicon } = event.data;

      try {
        const response = await chrome.runtime.sendMessage({
          type: 'VELA_PROVIDER_REQUEST',
          id,
          method,
          params,
          origin,
          favicon,
        });

        window.postMessage({
          type: 'VELA_PROVIDER_RESPONSE',
          id,
          result: response?.result,
          error: response?.error,
        }, '*');
      } catch (error) {
        window.postMessage({
          type: 'VELA_PROVIDER_RESPONSE',
          id,
          error: { code: -32603, message: (error as Error).message },
        }, '*');
      }
    });

    // Listen for ALL messages from background/extension
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      // Account/chain changed
      if (msg.type === 'VELA_ACCOUNTS_CHANGED') {
        console.log('[Vela Content] accountsChanged:', msg.accounts);
        window.postMessage({ type: 'VELA_EMIT_EVENT', event: 'accountsChanged', data: msg.accounts }, '*');
        if (msg.chainId) {
          window.postMessage({ type: 'VELA_EMIT_EVENT', event: 'chainChanged', data: '0x' + msg.chainId.toString(16) }, '*');
        }
        sendResponse({ ok: true }); // Acknowledge receipt
        return true;
      }

      // Popup state updates — ignore (for popup/sidepanel only)
      if (msg.type === 'VELA_POPUP_STATE') return false;

      // BLE send request — ignore (for pairing tab only)
      if (msg.type === 'VELA_BLE_SEND_REQUEST') return false;

      return false;
    });
  },
});
