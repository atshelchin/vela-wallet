/**
 * Content Script — bridges page ↔ background.
 *
 * 1. Injects provider.ts into the page (MAIN world)
 * 2. Listens for VELA_PROVIDER_REQUEST from page
 * 3. Forwards to background via chrome.runtime.sendMessage
 * 4. Returns response back to page via window.postMessage
 */
export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',

  main() {
    // 1. Inject the provider script into the page's MAIN world
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('/provider.js');
    script.type = 'module';
    (document.head || document.documentElement).appendChild(script);
    script.onload = () => script.remove();

    // 2. Listen for requests from the injected provider
    window.addEventListener('message', async (event) => {
      if (event.source !== window) return;
      if (event.data?.type !== 'VELA_PROVIDER_REQUEST') return;

      const { id, method, params, origin, favicon } = event.data;

      try {
        // Forward to background
        const response = await chrome.runtime.sendMessage({
          type: 'VELA_PROVIDER_REQUEST',
          id,
          method,
          params,
          origin,
          favicon,
        });

        // Return response to page
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

    // 3. Listen for state updates from background (account/chain changes)
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
