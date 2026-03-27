/**
 * Content Script — bridges page ↔ background (ISOLATED world).
 *
 * Provider is injected via provider.content (MAIN world) by WXT automatically.
 * This script:
 * 1. Forwards VELA_PROVIDER_REQUEST from page to background
 * 2. Returns VELA_PROVIDER_RESPONSE to page
 * 3. Forwards accountsChanged/chainChanged events from background to page
 */
export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',

  main() {
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

    // Listen for events from background → forward to page as EIP-1193 events
    chrome.runtime.onMessage.addListener((msg) => {
      // Account changed — emit accountsChanged + chainChanged to dApp
      if (msg.type === 'VELA_ACCOUNTS_CHANGED') {
        window.postMessage({
          type: 'VELA_EMIT_EVENT',
          event: 'accountsChanged',
          data: msg.accounts,
        }, '*');

        if (msg.chainId) {
          window.postMessage({
            type: 'VELA_EMIT_EVENT',
            event: 'chainChanged',
            data: '0x' + msg.chainId.toString(16),
          }, '*');
        }
      }
    });
  },
});
