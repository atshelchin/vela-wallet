import { defineConfig } from '@playwright/test';

const STORAGE_SUITES = [
	'**/*persistence*.e2e.ts',
	'**/pool-resilience.e2e.ts',
	'**/home-truth.e2e.ts'
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
		// other two engines: the 024 persistence pair (SC-001/SC-002) and the 025
		// read suites that reload on a persisted ban map / privacy flag (T150).
		{ name: 'firefox', use: { browserName: 'firefox' }, testMatch: STORAGE_SUITES },
		{ name: 'webkit', use: { browserName: 'webkit' }, testMatch: STORAGE_SUITES }
	]
});
