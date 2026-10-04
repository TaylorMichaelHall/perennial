import { expect, type Locator, type Page } from '@playwright/test';

export const PASSWORD = 'correct horse battery';

/** No session at all, for the tests that are about signing in. */
export const SIGNED_OUT = { cookies: [], origins: [] };

/**
 * Holds the browser's clock at noon on `date`. The app takes "today" from the
 * browser, so this decides which windows are open.
 */
export async function setToday(page: Page, date: string): Promise<void> {
	await page.clock.setFixedTime(new Date(`${date}T12:00:00Z`));
}

interface NewTask {
	title: string;
	opens_on: string;
	due_on: string;
	[field: string]: unknown;
}

/** Adds a task through the API, with the session the page is signed in with. */
export async function createTask(page: Page, task: NewTask): Promise<{ id: number }> {
	const response = await page.request.post('/api/tasks', { data: task });
	expect(response.status()).toBe(201);
	return response.json();
}

/** The agenda's row for a task. */
export function row(page: Page, title: string): Locator {
	return page.getByRole('listitem').filter({ hasText: title });
}

/** The agenda section under `heading`, e.g. "Can be done now". */
export function section(page: Page, heading: string): Locator {
	return page.locator('section').filter({ has: page.getByRole('heading', { name: heading }) });
}

export function toast(page: Page): Locator {
	return page.getByRole('status');
}
