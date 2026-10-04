import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
/** Where the signed-in session from first-run setup is kept for the other tests. */
export const SESSION = 'e2e/.auth/session.json';

export default defineConfig({
	testDir: 'e2e',
	// Every test shares one server with one database, so they run one at a time.
	workers: 1,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
	use: {
		...devices['Desktop Chrome'],
		baseURL: `http://localhost:${PORT}`,
		// Dates are written out in the tests, so pin how the browser words them.
		locale: 'en-GB',
		timezoneId: 'UTC',
		trace: 'retain-on-failure'
	},
	projects: [
		// A fresh install is set up first; everything else signs in with its session.
		{ name: 'setup', testMatch: 'setup.spec.ts' },
		{
			name: 'app',
			testIgnore: 'setup.spec.ts',
			dependencies: ['setup'],
			use: { storageState: SESSION }
		}
	],
	webServer: {
		// The built app, as it runs in production. `npm run test:e2e` builds it first.
		command: 'node e2e/server.mjs',
		url: `http://localhost:${PORT}/api`,
		reuseExistingServer: false,
		env: { PORT: String(PORT) }
	}
});
