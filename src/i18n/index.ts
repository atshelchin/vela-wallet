/**
 * i18n — NATIVE entry point.
 *
 * Everything lives in `./shared`; this file exists so that `index.web.ts` can be
 * the platform counterpart without either importing the other. (A `.web.ts` that
 * did `import './index'` would resolve straight back to itself under metro's
 * platform resolution — the import would be circular, silently.)
 *
 * On iOS/Android this is plain `i18next` and nothing else, exactly as before
 * spec 005. Hermes has no WebAssembly, so the Rust engine cannot run here; the
 * native route is uniffi and is not wired yet. `index.web.ts` is where the engine
 * is installed.
 */
export * from './shared';
export { default } from './shared';
