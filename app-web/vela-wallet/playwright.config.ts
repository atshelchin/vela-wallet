import { defineConfig } from '@playwright/test';

const STORAGE_SUITES = [
	'**/*persistence*.e2e.ts',
	'**/pool-resilience.e2e.ts',
	'**/home-truth.e2e.ts',
	'**/reopen-pending.e2e.ts',
	'**/parallel-entry.e2e.ts'
];

export default defineConfig({
	webServer: {
		command: 'npm run build && npm run preview',
		port: 4173,
		timeout: 180_000,
		reuseExistingServer: true
	},
	use: { baseURL: 'http://localhost:4173' },
	testMatch: '**/*.e2e.{ts,js}',
	projects: [
		// Everything runs on chromium…
		{ name: 'chromium', use: { browserName: 'chromium' } },
		// …and the suites that assert STORAGE additionally prove IndexedDB on the
		// other two engines: the 024 persistence pair (SC-001/SC-002), the 025
		// read suites that reload on a persisted ban map / privacy flag (T150),
		// and the 026 money pair (T261) — the pending record a closed tab left in
		// IndexedDB, settled on the next boot (SC-204), and the wallet SWAP the
		// parallel space performs in localStorage and gives back byte-for-byte.
		// Money that survives a crash is the promise that must not be one
		// engine's.
		{ name: 'firefox', use: { browserName: 'firefox' }, testMatch: STORAGE_SUITES },
		{ name: 'webkit', use: { browserName: 'webkit' }, testMatch: STORAGE_SUITES }
	]
});
