// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

/**
 * Legacy T0 implementations, quarantined by specs/001-rust-core-bindings
 * (FR-007). They are byte-frozen: the shared Rust core in rust/crates/vela-core
 * is the real implementation, these are the oracle the conformance corpus was
 * extracted from, and on native (Hermes, no wasm) they are still what runs.
 *
 * App code must import from `@/services/vela-core` instead, so the eventual
 * deletion — once the native rewrite lands — is a facade re-point rather than a
 * sweep across the codebase.
 */
const QUARANTINED_LEGACY = [
  'eth-crypto',
  'hex',
  'sha256',
  'abi-decode',
  'eip712',
  'safe-address',
  'attestation-parser',
  'p256-recovery',
  'webauthn-verify',
  // specs/003-rust-identicon: same rule, same reason — the avatar must come from
  // one implementation, and on native that is still this JS path.
  'identicon',
];

const quarantineMessage =
  'Quarantined legacy implementation (specs/001-rust-core-bindings FR-007). ' +
  'Import from "@/services/vela-core" instead — it serves the Rust core on web and ' +
  'delegates here on native. Editing the legacy file requires regenerating the ' +
  'conformance corpus (npm run dump:vectors) and reviewing the vector diff.';

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*", "rust/*"],
  },
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    ignores: [
      // The facade is the one place allowed to reach the legacy modules…
      "src/services/vela-core/**",
      // …as are the legacy modules themselves (they import each other) …
      ...QUARANTINED_LEGACY.map((m) => `src/services/${m}.ts`),
      // …and their tests plus the vector dump, which use them as the oracle.
      "src/__tests__/**",
      "scripts/dump-vectors/**",
    ],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: QUARANTINED_LEGACY.flatMap((m) => [
            `@/services/${m}`,
            `**/services/${m}`,
            `./${m}`,
          ]),
          message: quarantineMessage,
        }],
      }],
      "no-restricted-syntax": ["error", ...QUARANTINED_LEGACY.flatMap((m) =>
        [`@/services/${m}`, `./${m}`, `../services/${m}`, `../../services/${m}`].flatMap((spec) => [
          // `no-restricted-imports` only visits static import/export
          // declarations — it cannot see `await import('@/services/hex')`,
          // which is how several call sites load these modules. Without this
          // the quarantine has a hole wide enough to ship the legacy path on
          // web with a fully green lint.
          { selector: `ImportExpression > Literal[value="${spec}"]`, message: quarantineMessage },
          { selector: `TSImportType > TSLiteralType > Literal[value="${spec}"]`, message: quarantineMessage },
        ]),
      )],
    },
  },
]);
