/**
 * EIP-1193 Provider — injected into MAIN world.
 *
 * dApps interact with this via window.ethereum.
 * Supports EIP-1193 (request/events) and EIP-6963 (provider discovery).
 */
export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  world: 'MAIN',

  main() {
    // ─── Event System ───
    const eventHandlers: Map<string, Set<(...args: unknown[]) => void>> = new Map();
    let requestCounter = 0;

    function emit(event: string, ...args: unknown[]) {
      const handlers = eventHandlers.get(event);
      if (!handlers) return;
      console.log(`[Vela] emit('${event}')`, args[0]);
      handlers.forEach(h => {
        try { h(...args); } catch (e) { console.error('[Vela] event handler error:', e); }
      });
    }

    function getFavicon(): string {
      const link = document.querySelector('link[rel~="icon"]') as HTMLLinkElement;
      return link?.href || `${window.location.origin}/favicon.ico`;
    }

    // ─── Provider ───
    const provider = {
      isVela: true,
      isMetaMask: true,
      selectedAddress: null as string | null,
      chainId: null as string | null,
      networkVersion: null as string | null,
      isConnected: () => true,

      async request({ method, params = [] }: { method: string; params?: unknown[] }): Promise<unknown> {
        const id = `vela_${Date.now()}_${++requestCounter}`;

        return new Promise((resolve, reject) => {
          const handler = (event: MessageEvent) => {
            if (event.data?.type !== 'VELA_PROVIDER_RESPONSE' || event.data?.id !== id) return;
            window.removeEventListener('message', handler);

            if (event.data.error) {
              reject(event.data.error);
            } else {
              const result = event.data.result;

              // Update local state
              if (method === 'eth_requestAccounts' || method === 'eth_accounts') {
                const accounts = result as string[];
                if (accounts?.[0]) {
                  provider.selectedAddress = accounts[0];
                }
              } else if (method === 'eth_chainId') {
                provider.chainId = result as string;
              }

              resolve(result);
            }
          };

          window.addEventListener('message', handler);

          window.postMessage({
            type: 'VELA_PROVIDER_REQUEST',
            id,
            method,
            params,
            origin: window.location.origin,
            favicon: getFavicon(),
          }, '*');

          // 5 minute timeout (user might be approving on phone)
          setTimeout(() => {
            window.removeEventListener('message', handler);
            reject({ code: -32603, message: 'Request timed out' });
          }, 300_000);
        });
      },

      on(event: string, handler: (...args: unknown[]) => void) {
        if (!eventHandlers.has(event)) eventHandlers.set(event, new Set());
        eventHandlers.get(event)!.add(handler);
      },

      removeListener(event: string, handler: (...args: unknown[]) => void) {
        eventHandlers.get(event)?.delete(handler);
      },

      // Legacy support
      enable: () => provider.request({ method: 'eth_requestAccounts' }),
      send: (method: string, params?: unknown[]) => provider.request({ method, params }),
      sendAsync: (payload: { method: string; params?: unknown[] }, callback: (err: unknown, result: unknown) => void) => {
        provider.request(payload).then(result => callback(null, { result })).catch(err => callback(err, null));
      },
    };

    // ─── Listen for events from content script ───
    window.addEventListener('message', (event) => {
      if (event.source !== window) return;
      if (event.data?.type !== 'VELA_EMIT_EVENT') return;

      const { event: eventName, data } = event.data;
      console.log(`[Vela] received VELA_EMIT_EVENT: ${eventName}`, data);

      if (eventName === 'accountsChanged') {
        provider.selectedAddress = Array.isArray(data) ? data[0] : null;
        emit('accountsChanged', data);
      } else if (eventName === 'chainChanged') {
        provider.chainId = data as string;
        provider.networkVersion = String(parseInt(data as string, 16));
        emit('chainChanged', data);
      } else {
        emit(eventName, data);
      }
    });

    // ─── Inject as window.ethereum ───
    Object.defineProperty(window, 'ethereum', {
      value: provider,
      writable: false,
      configurable: true,
    });

    window.dispatchEvent(new Event('ethereum#initialized'));

    // ─── EIP-6963 ───
    const providerInfo = Object.freeze({
      info: {
        uuid: 'vela-wallet-001',
        name: 'Vela Wallet',
        icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><path d="M38 12C38 12 22 44 18 64C18 64 38 56 40 54C42 56 62 64 62 64C58 44 42 12 42 12C42 12 40 10 38 12Z" fill="%23E8572A"/></svg>',
        rdns: 'app.getvela',
      },
      provider,
    });

    window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: providerInfo }));

    window.addEventListener('eip6963:requestProvider', () => {
      window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: providerInfo }));
    });
  },
});
