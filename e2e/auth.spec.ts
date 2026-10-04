import { expect, test } from '@playwright/test';
import { PASSWORD, SIGNED_OUT } from './helpers.ts';

test.describe('signing in', () => {
	test.use({ storageState: SIGNED_OUT });

	test('sends a signed-out visitor to sign in, then on to where they were going', async ({ page }) => {
		await page.goto('/timeline');
		await expect(page).toHaveURL('/login?next=%2Ftimeline');
		await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();

		await page.getByLabel('Password').fill('not the password');
		await page.getByRole('button', { name: 'Sign in' }).click();
		await expect(page.getByRole('alert')).toHaveText('That password isn’t right.');

		await page.getByLabel('Password').fill(PASSWORD);
		await page.getByRole('button', { name: 'Sign in' }).click();
		await expect(page).toHaveURL('/timeline');
		await expect(page.getByRole('heading', { name: 'Timeline' })).toBeVisible();
	});

	test('keeps the API closed without a session or a key', async ({ request }) => {
		expect((await request.get('/api/tasks')).status()).toBe(401);
		expect((await request.get('/api/export')).status()).toBe(401);
		expect((await request.get('/api')).status()).toBe(200);
	});

	test('signs out from Settings', async ({ page }) => {
		await page.goto('/login');
		await page.getByLabel('Password').fill(PASSWORD);
		await page.getByRole('button', { name: 'Sign in' }).click();
		await expect(page).toHaveURL('/');

		await page.goto('/settings');
		await page.getByRole('button', { name: 'Sign out' }).click();
		await expect(page).toHaveURL('/login');

		await page.goto('/');
		await expect(page).toHaveURL('/login');
	});
});
