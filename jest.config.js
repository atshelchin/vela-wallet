/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  setupFiles: ['<rootDir>/jest.setup.js'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  // `*.live.test.ts` queries real RPCs and real name registries, so it asserts on data
  // OTHER PEOPLE control and on networks that may not be reachable from a CI runner. It
  // fails for reasons that have nothing to do with this repo — a chain's public RPC being
  // down, a rate limit, or the owner of a test address registering a new name. One of those
  // happened: `second.g` resolved locally and came back `alternativename.base.eth` in CI,
  // because Gravity (chain 1625) was unreachable there and the resolver fell through to the
  // next service in its priority list. Excluded from the default run; `npm run test:live`
  // runs them on purpose. The LOGIC those files used to cover is now covered hermetically.
  testPathIgnorePatterns: ['/node_modules/', '\\.live\\.test\\.ts$'],
  reporters: [
    'default',
    '<rootDir>/scripts/jest-skipped-reporter.js',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // Resolve the package's `exports` subpath by hand — Node10 resolution cannot.
    '^identicons-esm/core$': '<rootDir>/node_modules/identicons-esm/dist/core.mjs',
  },
  // `identicons-esm` is ESM-only (no `require` condition in its exports map), so
  // ts-jest's CommonJS resolution cannot load it. Transform it through babel
  // instead of excluding it: the identicon path is real code that the native app
  // runs, and stubbing it in tests would hide regressions rather than surface them.
  transformIgnorePatterns: ['/node_modules/(?!identicons-esm|@nimiq/utils)'],
  extensionsToTreatAsEsm: [],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'mjs', 'json', 'node'],
  transform: {
    // Just the ESM->CJS rewrite; the code is already syntax-compatible with the
    // Node version jest runs on, so a full preset would only add cost.
    '^.+\\.m?js$': ['babel-jest', { babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-modules-commonjs'] }],
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        module: 'commonjs',
        moduleResolution: 'node',
        esModuleInterop: true,
        strict: true,
        paths: {
          '@/*': ['./src/*'],
          // Same reason as moduleNameMapper above, for the TYPE side.
          'identicons-esm/core': ['./node_modules/identicons-esm/dist/core.d.mts'],
        },
      },
    }],
  },
};
