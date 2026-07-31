/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  setupFiles: ['<rootDir>/jest.setup.js'],
  testMatch: ['**/__tests__/**/*.test.ts'],
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
