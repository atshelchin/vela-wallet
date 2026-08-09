// Custom app entry — WEB.
//
// Its only job beyond the native entry (`index.js`) is to await the wasm core
// BEFORE expo-router registers the app. Since spec 017 the core no longer
// ships base64-embedded in the bundle (it outgrew that budget at 2.9 MB) — it
// is fetched from `public/` and initialized asynchronously, so nothing in the
// app graph may evaluate until that resolves.
//
// `require` inside the callback, not a top-level import: an ES import would be
// hoisted above the await and defeat the whole point.
import './src/polyfills';
import { coreReady } from '@/services/vela-core';

coreReady.then(
  () => {
    require('expo-router/entry');
  },
  (error) => {
    // The core failing is fatal (addresses, signatures and calldata decoding
    // all flow through it). Show it rather than a blank page.
    // eslint-disable-next-line no-console
    console.error(error);
    const root = document.getElementById('root') ?? document.body;
    root.textContent = String(error?.message ?? error);
  },
);
