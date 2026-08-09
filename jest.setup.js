// React Native / Expo define __DEV__ as a global at runtime; the jest node
// environment does not. Define it so modules that branch on it (e.g. the dev-only
// passkey override seam in modules/passkey) run without a ReferenceError. Tests run
// as a dev build.
globalThis.__DEV__ = true;

// The wasm core ships as a fingerprinted asset in public/ (spec 017 D7 route)
// rather than base64-embedded in the bundle, so Node consumers must supply the
// bytes themselves. Tests that exercise a WEB module (`@/i18n/index.web`,
// `@/services/vela-core/index.web`) read them from here; everything else
// resolves to the native TypeScript path and never looks.
//
// Planted rather than eagerly initialized: reading 2.9 MB is cheap, and the
// modules that need it initialize on their own terms.
{
  const { readFileSync, existsSync } = require('node:fs');
  const { join } = require('node:path');
  try {
    const urlModule = join(__dirname, 'rust/pkg-web/vela_core_wasm_url.js');
    if (existsSync(urlModule)) {
      const match = /WASM_URL = '([^']+)'/.exec(readFileSync(urlModule, 'utf8'));
      const asset = match && join(__dirname, 'public', match[1].replace(/^\//, ''));
      if (asset && existsSync(asset)) {
        globalThis.__VELA_WASM_BYTES__ = readFileSync(asset);
      }
    }
  } catch {
    // Absent artifact: only the web-module suites care, and they fail loudly.
  }
}
