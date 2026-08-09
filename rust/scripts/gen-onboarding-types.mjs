#!/usr/bin/env node
/**
 * Alias kept for muscle memory and older docs: the registry generator
 * `gen-core-types.mjs` (spec 016 research.md D3) supersedes this file and
 * owns all logic. This shim forwards to its `onboarding` target.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const result = spawnSync(
  process.execPath,
  [
    fileURLToPath(new URL('./gen-core-types.mjs', import.meta.url)),
    'onboarding',
    ...process.argv.slice(2),
  ],
  { stdio: 'inherit' },
);
process.exit(result.status ?? 1);
