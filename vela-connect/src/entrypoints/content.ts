/**
 * Content Script — bridges page ↔ background (ISOLATED world).
 *
 * Provider is injected via provider.content (MAIN world) by WXT automatically.
 * This script listens for VELA_PROVIDER_REQUEST from the provider,
 * forwards to background, and returns responses.
 */
export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',

  main() {
    // Listen for requests from the injected provider (MAIN world)
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

    // Listen for state updates from background
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === 'VELA_STATE_UPDATE') {
        if (msg.walletInfo) {
          window.postMessage({
            type: 'VELA_PROVIDER_RESPONSE',
            id: 'state_update',
            result: msg.walletInfo,
          }, '*');
        }
      }
    });
  },
});
