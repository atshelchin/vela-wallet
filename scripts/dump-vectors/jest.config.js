/**
 * Jest config for the conformance-vector dump (specs/001-rust-core-bindings).
 *
 * The dump runs the PRODUCTION TypeScript implementations as the behavioral
 * oracle and writes JSON vectors into rust/crates/vela-core/tests/vectors/.
 * jest/ts-jest is the only installed TS runner in this repo (no tsx/ts-node),
 * so the dump is shaped as *.dump.test.ts files. Invoke via:
 *   npm run dump:vectors
 */

/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '../..',
  roots: ['<rootDir>/scripts/dump-vectors'],
  setupFiles: ['<rootDir>/jest.setup.js'],
  testMatch: ['**/*.dump.test.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        module: 'commonjs',
        moduleResolution: 'node',
        esModuleInterop: true,
        strict: true,
        paths: {
          '@/*': ['./src/*'],
        },
      },
    }],
  },
};
