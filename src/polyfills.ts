/**
 * Nothing to polyfill.
 *
 * This file used to have a native twin that installed crypto / btoa / atob /
 * Buffer shims for Hermes. The browser provides all four, so the web half was
 * always a deliberate no-op — kept only so `import '@/polyfills'` stayed valid
 * without pulling native-only packages (react-native-get-random-values) into
 * the bundle. With the native twin gone this is the whole story, and the import
 * at the app entry can go the next time that file is touched.
 */
export {};
