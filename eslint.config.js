// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: [
      "dist/*",
      "rust/*",
      // Machine-written mirrors of the Rust wire types
      // (rust/scripts/gen-onboarding-types.mjs). Style rules do not apply to
      // output nobody hand-edits, and a drift gate already guards it.
      "src/services/onboarding-core/generated/*",
    ],
  },
]);
