import { expect, test } from '@playwright/test';
import { createTask, setToday } from './helpers.ts';

test('keeps today in place when zooming out and back in, and pans without selecting', async ({ page }) => {
	await setToday(page, '2026-10-04');
	await createTask(page, { title: 'Prune the apple tree', opens_on: '2026-10-01', due_on: '2026-12-31' });
	await page.goto('/timeline');

	const today = page.locator('.months b');
	const left = async () => (await today.boundingBox())!.x;
	const before = await left();

	await page.getByRole('button', { name: '10 years' }).click();
	expect(Math.abs((await left()) - before)).toBeLessThan(2);
	// The chart starts late in 2024, which leaves that year no room for its label.
	await expect(page.locator('.years span').first()).toHaveText('2025');

	await page.getByRole('button', { name: '3 years' }).click();
	expect(Math.abs((await left()) - before)).toBeLessThan(2);

	// Dragging pans the chart rather than selecting what is under the pointer.
	await page.mouse.move(600, 500);
	await page.mouse.down();
	await page.mouse.move(300, 500, { steps: 5 });
	await page.mouse.up();
	expect(Math.abs((await left()) - (before - 300))).toBeLessThan(2);
	expect(await page.evaluate(() => getSelection()?.toString())).toBe('');
});
