/**
 * Provider injection script — runs in MAIN world.
 * This injects the EIP-1193 provider directly into the page context.
 */
export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  world: 'MAIN',

  main() {
    // ─── EIP-1193 Provider ───

    const eventHandlers: Map<string, Set<(...args: unknown[]) => void>> = new Map();
    let requestCounter = 0;

    function emit(event: string, ...args: unknown[]) {
      eventHandlers.get(event)?.forEach(h => h(...args));
    }

    function getFavicon(): string {
      const link = document.querySelector('link[rel~="icon"]') as HTMLLinkElement;
      return link?.href || `${window.location.origin}/favicon.ico`;
    }

    const provider = {
      isVela: true,
      isMetaMask: true,

      async request({ method, params = [] }: { method: string; params?: unknown[] }): Promise<unknown> {
        const id = `vela_${Date.now()}_${++requestCounter}`;

        return new Promise((resolve, reject) => {
          const handler = (event: MessageEvent) => {
            if (event.data?.type !== 'VELA_PROVIDER_RESPONSE' || event.data?.id !== id) return;
            window.removeEventListener('message', handler);

            if (event.data.error) {
              reject(new Error(event.data.error.message));
            } else {
              if (method === 'eth_requestAccounts' || method === 'eth_accounts') {
                const accounts = event.data.result as string[];
                if (accounts?.[0]) emit('accountsChanged', accounts);
              } else if (method === 'eth_chainId') {
                emit('chainChanged', event.data.result);
              }
              resolve(event.data.result);
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

          // 5 minute timeout
          setTimeout(() => {
            window.removeEventListener('message', handler);
            reject(new Error('Request timed out'));
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
    };

    // Inject as window.ethereum
    Object.defineProperty(window, 'ethereum', {
      value: provider,
      writable: false,
      configurable: true,
    });

    window.dispatchEvent(new Event('ethereum#initialized'));

    // EIP-6963 announcement
    window.dispatchEvent(new CustomEvent('eip6963:announceProvider', {
      detail: Object.freeze({
        info: {
          uuid: 'vela-wallet-001',
          name: 'Vela Wallet',
          icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><path d="M38 12C38 12 22 44 18 64C18 64 38 56 40 54C42 56 62 64 62 64C58 44 42 12 42 12C42 12 40 10 38 12Z" fill="%23E8572A"/></svg>',
          rdns: 'app.getvela',
        },
        provider,
      }),
    }));

    // Listen for EIP-6963 requests
    window.addEventListener('eip6963:requestProvider', () => {
      window.dispatchEvent(new CustomEvent('eip6963:announceProvider', {
        detail: Object.freeze({
          info: {
            uuid: 'vela-wallet-001',
            name: 'Vela Wallet',
            icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><path d="M38 12C38 12 22 44 18 64C18 64 38 56 40 54C42 56 62 64 62 64C58 44 42 12 42 12C42 12 40 10 38 12Z" fill="%23E8572A"/></svg>',
            rdns: 'app.getvela',
          },
          provider,
        }),
      }));
    });
  },
});
