// React Native / Expo define __DEV__ as a global at runtime; the jest node
// environment does not. Define it so modules that branch on it (e.g. the dev-only
// passkey override seam in modules/passkey) run without a ReferenceError. Tests run
// as a dev build.
globalThis.__DEV__ = true;

// The wasm core ships as a fingerprinted asset in public/ (spec 017 D7 route)
// rather than base64-embedded in the bundle, so Node consumers must supply the
// bytes themselves. `@/services/vela-core` reads them from here.
//
// LAZY ON PURPOSE — do not turn this back into a plain assignment. A setup file
// runs once per test FILE, and a 3.3 MB Buffer sitting on `globalThis` costs the
// environment far more than the readFileSync that produced it: with the eager
// version, a single trivial suite went from 3 s to not finishing at all on
// macOS/arm64 (100% CPU, never completing), which reads exactly like a hung
// test and sent a whole debugging session chasing watchman and the core facade.
// Behind a getter the bytes are materialized only by the suites that touch the
// core, and cached on first read.
{
  const { readFileSync, existsSync } = require('node:fs');
  const { join } = require('node:path');
  Object.defineProperty(globalThis, '__VELA_WASM_BYTES__', {
    configurable: true,
    get() {
      let bytes;
      try {
        const urlModule = join(__dirname, 'rust/pkg-web/vela_core_wasm_url.js');
        if (existsSync(urlModule)) {
          const match = /WASM_URL = '([^']+)'/.exec(readFileSync(urlModule, 'utf8'));
          const asset = match && join(__dirname, 'public', match[1].replace(/^\//, ''));
          if (asset && existsSync(asset)) bytes = readFileSync(asset);
        }
      } catch {
        // Absent artifact: only the suites that need the core care, and they fail loudly.
      }
      // Replace the accessor so the read happens at most once per test file.
      Object.defineProperty(globalThis, '__VELA_WASM_BYTES__', { value: bytes, configurable: true });
      return bytes;
    },
  });
}
