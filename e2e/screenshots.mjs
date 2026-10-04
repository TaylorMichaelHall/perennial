/**
 * Takes the screenshots in the README, of the built app filled with sample
 * tasks. Run `npm run build` first, or use `npm run screenshots`.
 */

import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const PORT = 4174;
const BASE = `http://localhost:${PORT}`;
const OUT = 'docs/screenshots';
/** The day the screenshots are taken on, so they come out the same every time. */
const TODAY = '2027-04-12';

const TASKS = [
	{ title: 'File the tax return', opens_on: '2027-02-01', due_on: '2027-04-15', hard: true, repeat_every: 1, repeat_unit: 'year', tags: ['money'], notes: 'Last year’s return and the receipts are in the grey folder.' },
	{ title: 'Replace the furnace filter', opens_on: '2027-04-01', due_on: '2027-04-30', repeat_every: 3, repeat_unit: 'month', repeat_from: 'completion', tags: ['house'], notes: '16 × 25 × 1, MERV 11. There are spares on the shelf above the furnace.' },
	{ title: 'Rotate the tyres', opens_on: '2027-03-15', due_on: '2027-04-05', repeat_every: 6, repeat_unit: 'month', tags: ['car'] },
	{ title: 'Service the lawnmower', opens_on: '2027-03-20', due_on: '2027-05-15', repeat_every: 1, repeat_unit: 'year', tags: ['garden'] },
	{ title: 'Book the dentist', opens_on: '2027-04-20', due_on: '2027-05-31', repeat_every: 6, repeat_unit: 'month', tags: ['health'] },
	{ title: 'Clean out the dryer duct', opens_on: '2027-05-01', due_on: '2027-06-30', repeat_every: 1, repeat_unit: 'year', tags: ['house'] },
	{ title: 'Renew the car registration', opens_on: '2027-06-01', due_on: '2027-07-31', hard: true, repeat_every: 1, repeat_unit: 'year', tags: ['car'] },
	{ title: 'Drain the water heater', opens_on: '2027-09-01', due_on: '2027-10-31', repeat_every: 1, repeat_unit: 'year', tags: ['house'] },
	{ title: 'Sweep the chimney', opens_on: '2027-09-15', due_on: '2027-11-15', repeat_every: 1, repeat_unit: 'year', tags: ['house'] },
	{ title: 'Test the smoke alarms', opens_on: '2027-10-01', due_on: '2027-10-31', repeat_every: 6, repeat_unit: 'month', tags: ['house'] },
	{ title: 'Renew the passport', opens_on: '2028-01-01', due_on: '2028-06-30', hard: true, repeat_every: 10, repeat_unit: 'year', tags: ['travel'] },
	{ title: 'Reseal the deck', opens_on: '2028-05-01', due_on: '2028-08-31', repeat_every: 3, repeat_unit: 'year', tags: ['house', 'garden'] }
];

/** Windows already closed, for the history on the task page: [title, the day it was done]. */
const DONE = [
	['Replace the furnace filter', '2026-10-03'],
	['Replace the furnace filter', '2027-01-05']
];

const server = spawn('node', ['e2e/server.mjs'], {
	env: { ...process.env, PORT: String(PORT) },
	stdio: 'inherit'
});
process.on('exit', () => server.kill());

async function started() {
	for (let tries = 0; tries < 100; tries++) {
		try {
			if ((await fetch(`${BASE}/api`)).ok) return;
		} catch {
			// Not listening yet.
		}
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	throw new Error('The app did not start.');
}

async function send(request, path, data) {
	const response = await request.post(path, { data });
	if (!response.ok()) throw new Error(`${path}: ${response.status()} ${await response.text()}`);
	return response.json();
}

await started();
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();

try {
	for (const scheme of ['light', 'dark']) {
		const context = await browser.newContext({
			baseURL: BASE,
			viewport: { width: 1200, height: 900 },
			deviceScaleFactor: 2,
			colorScheme: scheme,
			locale: 'en-GB',
			timezoneId: 'UTC'
		});
		const page = await context.newPage();
		await page.clock.setFixedTime(new Date(`${TODAY}T12:00:00Z`));

		// The first pass sets the app up and fills it; the second only signs in.
		let filter;
		if (scheme === 'light') {
			await send(context.request, '/api/setup', { password: 'correct horse battery' });
			const ids = new Map();
			for (const task of TASKS) {
				// The furnace filter starts two windows back, so that it has a history.
				const first = task === TASKS[1] ? { ...task, opens_on: '2026-10-01', due_on: '2026-10-31' } : task;
				ids.set(task.title, (await send(context.request, '/api/tasks', first)).id);
			}
			for (const [title, on] of DONE) {
				const task = await (await context.request.get(`/api/tasks/${ids.get(title)}`)).json();
				await send(context.request, `/api/tasks/${task.id}/close`, { version: task.version, on });
			}
			filter = ids.get(TASKS[1].title);
		} else {
			await send(context.request, '/api/login', { password: 'correct horse battery' });
			const tasks = await (await context.request.get('/api/tasks')).json();
			filter = tasks.find((task) => task.title === TASKS[1].title).id;
		}

		for (const [name, path] of [
			['agenda', '/'],
			['timeline', '/timeline'],
			['task', `/tasks/${filter}`]
		]) {
			await page.goto(path);
			await page.waitForLoadState('networkidle');
			await page.evaluate(() => document.fonts.ready);
			await page.screenshot({ path: `${OUT}/${name}-${scheme}.png`, fullPage: name === 'task' });
		}
		await context.close();
	}
} finally {
	await browser.close();
	server.kill();
}
