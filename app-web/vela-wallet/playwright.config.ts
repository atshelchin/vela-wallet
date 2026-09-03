import { defineConfig } from '@playwright/test';

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
		// …and the live persistence suites additionally prove IndexedDB on the
		// other two engines (spec 024 SC-001/SC-002).
		{ name: 'firefox', use: { browserName: 'firefox' }, testMatch: '**/*persistence*.e2e.ts' },
		{ name: 'webkit', use: { browserName: 'webkit' }, testMatch: '**/*persistence*.e2e.ts' }
	]
});
