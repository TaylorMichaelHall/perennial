import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { createTask, row, setToday, toast } from './helpers.ts';

function file(contents: unknown) {
	return { name: 'perennial.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(contents)) };
}

test('imports tasks from a file, and refuses one with a mistake in it', async ({ page }) => {
	await setToday(page, '2027-09-10');
	await page.goto('/settings');
	const picker = page.locator('input[type=file]');

	// A file from before tags existed, with a window that was closed once.
	await picker.setInputFiles(
		file({
			format: 'perennial',
			version: 1,
			tasks: [
				{
					title: 'Service the boiler',
					opens_on: '2027-09-01',
					due_on: '2027-10-31',
					repeat_every: 1,
					repeat_unit: 'year',
					history: [{ opens_on: '2026-09-01', due_on: '2026-10-31', closed_on: '2026-10-12', skipped: false }]
				},
				{ title: 'Test the smoke alarms', opens_on: '2027-11-01', due_on: '2027-11-30' }
			]
		})
	);
	await expect(toast(page)).toContainText('Added 2 tasks.');

	await page.goto('/');
	await expect(row(page, 'Service the boiler')).toContainText('Every year');
	await row(page, 'Service the boiler').getByRole('link').click();
	await expect(page.getByText('Done 12 Oct 2026')).toBeVisible();
	await page.goto('/');
	await expect(row(page, 'Test the smoke alarms')).toContainText('Opens 1 Nov');

	// One bad task and nothing from the file is added.
	await page.goto('/settings');
	await picker.setInputFiles(
		file({
			format: 'perennial',
			version: 1,
			tasks: [
				{ title: 'Bleed the radiators', opens_on: '2027-10-01', due_on: '2027-10-31' },
				{ title: 'Lag the pipes', opens_on: '2027-10-01', due_on: 'soon' }
			]
		})
	);
	await expect(page.getByRole('alert')).toHaveText('Task 2: Choose the date this is due by.');
	await picker.setInputFiles({ name: 'notes.json', mimeType: 'application/json', buffer: Buffer.from('not json') });
	await expect(page.getByRole('alert')).toHaveText('That isn’t a Perennial export.');

	await page.goto('/');
	await expect(page.getByText('Bleed the radiators')).toBeHidden();
});

test('exports every task to a file that can be imported again', async ({ page }) => {
	await setToday(page, '2027-09-10');
	await createTask(page, {
		title: 'Check the tyre pressures',
		opens_on: '2027-01-31',
		due_on: '2027-01-31',
		repeat_every: 1,
		repeat_unit: 'month',
		tags: ['car']
	});

	await page.goto('/settings');
	const downloading = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Export tasks' }).click();
	const download = await downloading;
	expect(download.suggestedFilename()).toBe('perennial-2027-09-10.json');

	const exported = JSON.parse(await readFile(await download.path(), 'utf8'));
	expect(exported).toMatchObject({ format: 'perennial', version: 3 });
	const tyres = exported.tasks.find((task: { title: string }) => task.title === 'Check the tyre pressures');
	expect(tyres).toMatchObject({ tags: ['car'], opens_day: 31, due_day: 31 });
	expect(tyres).not.toHaveProperty('id');

	const before = (await (await page.request.get('/api/tasks')).json()).length;
	await page.locator('input[type=file]').setInputFiles(file(exported));
	await expect(toast(page)).toContainText(`Added ${before} tasks.`);
	expect(await (await page.request.get('/api/tasks?q=%23car')).json()).toHaveLength(2);
});

test('shows that the database is being backed up', async ({ page }) => {
	await page.goto('/settings');
	await expect(page.getByRole('heading', { name: 'Backups' })).toBeVisible();
	await expect(page.getByText(/Last backed up .+; 1 copy kept\./)).toBeVisible();
});
