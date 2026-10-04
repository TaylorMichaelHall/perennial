import { expect, test } from '@playwright/test';
import { createTask, row, setToday } from './helpers.ts';

// The other tests read dates as the browser writes them, so put that back.
test.afterEach(async ({ page }) => {
	await page.request.put('/api/settings', { data: { dateFormat: 'auto' } });
});

test('writes and reads dates in the chosen format', async ({ page }) => {
	const title = 'Bleed the radiators';
	await setToday(page, '2027-09-10');
	const { id } = await createTask(page, { title, opens_on: '2027-09-01', due_on: '2027-10-31' });

	await page.goto('/settings');
	await page.getByLabel('Date format').selectOption('dmy');
	await expect(page.getByRole('status')).toContainText('Date format changed.');
	await expect(page.getByLabel('Date format')).toHaveValue('dmy');

	await page.goto('/');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Friday, 10/09/2027');
	await expect(row(page, title)).toContainText('Aim for 31/10/2027');

	// Date fields are typed the same way, and say so when they can't be read.
	await page.goto(`/tasks/${id}`);
	const doneOn = page.getByLabel('Done on');
	await expect(doneOn).toHaveValue('09/09/2027');
	await doneOn.fill('2027-09-05');
	await page.getByRole('button', { name: 'Mark done on this day' }).click();
	await expect(page.getByText('Finished')).toBeHidden();

	await doneOn.fill('5/9/2027');
	await page.getByRole('button', { name: 'Mark done on this day' }).click();
	await expect(page.getByText('Finished 05/09/2027.')).toBeVisible();
});
