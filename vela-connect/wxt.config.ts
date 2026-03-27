import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-svelte'],
  manifest: {
    name: 'Vela Connect',
    description: 'Connect your Vela Wallet to dApps via Bluetooth',
    permissions: ['bluetooth', 'storage', 'sidePanel'],
    web_accessible_resources: [
      {
        resources: ['provider.js'],
        matches: ['<all_urls>'],
      },
    ],
  },
});
