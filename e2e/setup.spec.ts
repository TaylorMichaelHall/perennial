import { expect, test } from '@playwright/test';
import { SESSION } from '../playwright.config.ts';
import { PASSWORD } from './helpers.ts';

test('a fresh install asks for a password, then opens the app', async ({ page }) => {
	await page.goto('/');
	await expect(page).toHaveURL('/setup');
	await expect(page.getByRole('heading', { name: 'Choose a password' })).toBeVisible();

	await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
	await page.getByLabel('Password again').fill('something else');
	await page.getByRole('button', { name: 'Set password' }).click();
	await expect(page.getByRole('alert')).toHaveText('Those passwords don’t match.');
	await expect(page).toHaveURL('/setup');

	await page.getByLabel('Password again').fill(PASSWORD);
	await page.getByRole('button', { name: 'Set password' }).click();

	await expect(page).toHaveURL('/');
	await expect(page.getByRole('heading', { name: 'Nothing here yet' })).toBeVisible();

	// Setup can't be run a second time.
	await page.goto('/setup');
	await expect(page).toHaveURL('/');

	await page.context().storageState({ path: SESSION });
});
