import { expect, test } from '@playwright/test';
import { createTask, row, section, setToday, toast } from './helpers.ts';

test('adds a monthly task, completes it, undoes that, and stays on the 31st', async ({ page }) => {
	const title = 'Pay the rent';
	await setToday(page, '2027-01-31');
	await page.goto('/');

	await page.getByRole('banner').getByRole('button', { name: /Add/ }).click();
	const dialog = page.getByRole('dialog');
	await dialog.getByLabel('Name').fill(title);
	// The start follows the due date until it is set by hand.
	await dialog.getByLabel('Due by').fill('2027-03-31');
	await expect(dialog.getByLabel('Can be started')).toHaveValue('2027-02-28');
	await dialog.getByRole('button', { name: '1 week before due' }).click();
	await expect(dialog.getByLabel('Can be started')).toHaveValue('2027-03-24');
	await dialog.getByLabel('Due by').fill('2027-01-31');
	await expect(dialog.getByLabel('Can be started')).toHaveValue('2027-01-24');
	await dialog.getByLabel('Can be started').fill('2027-01-31');
	await dialog.getByRole('radio', { name: 'Every' }).check();
	await dialog.getByLabel('Months or years', { exact: true }).selectOption('month');
	await dialog.getByLabel('Tags').fill('Home, money');
	await dialog.getByRole('button', { name: 'Add task' }).click();
	await expect(dialog).toBeHidden();

	const open = section(page, 'Can be done now');
	await expect(open.getByText(title)).toBeVisible();
	await expect(row(page, title)).toContainText('Every month, #home #money');
	await expect(row(page, title)).toContainText('Last day');

	// Done: it moves on to February, which has no 31st.
	await page.getByRole('button', { name: `Mark “${title}” done` }).click();
	await expect(toast(page)).toContainText('Marked done. Opens again 28 Feb.');
	await expect(open.getByText(title)).toBeHidden();
	await expect(section(page, 'Opening in the next month').getByText(title)).toBeVisible();

	// Undone: it is back where it was.
	await toast(page).getByRole('button', { name: 'Undo' }).click();
	await expect(open.getByText(title)).toBeVisible();
	await expect(toast(page)).toBeHidden();

	await page.getByRole('button', { name: `Mark “${title}” done` }).click();
	await expect(toast(page)).toContainText('Opens again 28 Feb.');

	// A month later, done again: March goes back to the 31st rather than staying on the 28th.
	await setToday(page, '2027-02-28');
	await page.reload();
	await page.getByRole('button', { name: `Mark “${title}” done` }).click();
	await expect(toast(page)).toContainText('Marked done. Opens again 31 Mar.');

	// The timeline's projection agrees with where it actually went.
	await page.goto('/timeline');
	const lane = page.getByRole('listitem').filter({ hasText: title });
	await expect(lane.getByText('opens 31 Mar')).toBeVisible();
	await expect(lane.locator('.bar.future').first()).toHaveAttribute('title', '30 Apr to 30 Apr');
	await expect(lane.locator('.bar.future').nth(1)).toHaveAttribute('title', '31 May to 31 May');
});

test('skips a window, and reopens a finished one-off task', async ({ page }) => {
	await setToday(page, '2027-05-10');
	const yearly = await createTask(page, {
		title: 'Sweep the chimney',
		opens_on: '2027-05-01',
		due_on: '2027-05-31',
		repeat_every: 1,
		repeat_unit: 'year'
	});
	const once = await createTask(page, { title: 'Renew passport', opens_on: '2027-05-01', due_on: '2027-06-30' });

	await page.goto(`/tasks/${yearly.id}`);
	await page.getByRole('button', { name: 'Skip this time' }).click();
	await expect(toast(page)).toContainText('Skipped. Opens again 1 May 2028.');
	await expect(page.getByText('Skipped 10 May')).toBeVisible();

	await page.goto(`/tasks/${once.id}`);
	await page.getByRole('button', { name: 'Mark done', exact: true }).click();
	await expect(page.getByText('Finished 10 May.')).toBeVisible();
	await page.getByRole('button', { name: 'Reopen' }).click();
	await expect(page.getByText(/^Can be done now/)).toBeVisible();
	await expect(page.getByRole('heading', { name: 'History' })).toBeHidden();
});

test('marks a task done on an earlier day, and counts the next one from then', async ({ page }) => {
	await setToday(page, '2027-06-20');
	const { id } = await createTask(page, {
		title: 'Replace the furnace filter',
		opens_on: '2027-06-01',
		due_on: '2027-06-30',
		repeat_every: 3,
		repeat_unit: 'month',
		repeat_from: 'completion'
	});

	await page.goto(`/tasks/${id}`);
	const doneOn = page.getByLabel('Done on');
	await expect(doneOn).toHaveValue('2027-06-19');
	await expect(doneOn).toHaveAttribute('max', '2027-06-20');
	await doneOn.fill('2027-06-05');
	await page.getByRole('button', { name: 'Mark done on this day' }).click();

	// Three months from the 5th, not from today.
	await expect(toast(page)).toContainText('Marked done. Opens again 7 Aug.');
	await expect(page.getByText('Done 5 Jun')).toBeVisible();
	await expect(page.getByText(/aim for 5 Sept?\./)).toBeVisible();

	await toast(page).getByRole('button', { name: 'Undo' }).click();
	await expect(page.getByText('Done 5 Jun')).toBeHidden();
	await expect(page.getByText(/aim for 30 Jun\./)).toBeVisible();
});

test('snoozes a task until a chosen day, and wakes it', async ({ page }) => {
	const title = 'Clean the gutters';
	await setToday(page, '2027-07-10');
	const { id } = await createTask(page, { title, opens_on: '2027-07-01', due_on: '2027-07-31' });

	await page.goto(`/tasks/${id}`);
	await page.getByRole('button', { name: 'Snooze 1 week' }).click();
	await expect(toast(page)).toContainText('Snoozed until 17 Jul.');
	await expect(page.getByText('Snoozed until 17 Jul. No reminders until then.')).toBeVisible();

	await page.goto('/');
	await expect(section(page, 'Snoozed').getByText(title)).toBeVisible();
	await expect(row(page, title)).toContainText('Back 17 Jul');
	await expect(page.getByRole('button', { name: `Mark “${title}” done` })).toBeHidden();

	// On the day, it is back among the things to do.
	await setToday(page, '2027-07-17');
	await page.reload();
	await expect(section(page, 'Can be done now').getByText(title)).toBeVisible();

	// Snoozed again to a day of one's own choosing, then woken by hand.
	await page.goto(`/tasks/${id}`);
	await page.getByLabel('Or until').fill('2027-07-25');
	await page.getByRole('button', { name: 'Snooze', exact: true }).click();
	await expect(page.getByText('Snoozed until 25 Jul.', { exact: false }).first()).toBeVisible();
	await page.getByRole('button', { name: 'End snooze' }).click();
	await expect(page.getByRole('button', { name: 'Snooze 1 week' })).toBeVisible();
});

test('searches by word and narrows by tag, on the agenda and the timeline', async ({ page }) => {
	await setToday(page, '2027-08-10');
	const window = { opens_on: '2027-08-01', due_on: '2027-08-31' };
	await createTask(page, { ...window, title: 'Rotate the tyres', tags: ['garage'] });
	await createTask(page, { ...window, title: 'Oil the garage door', notes: 'White lithium grease', tags: ['garage', 'diy'] });
	await createTask(page, { ...window, title: 'Descale the kettle', tags: ['diy'] });

	await page.goto('/');
	const search = page.getByRole('searchbox', { name: 'Search tasks' });
	const shown = (title: string) => page.getByRole('main').getByText(title);

	await search.fill('lithium');
	await expect(shown('Oil the garage door')).toBeVisible();
	await expect(shown('Rotate the tyres')).toBeHidden();
	await expect(shown('Descale the kettle')).toBeHidden();

	await search.fill('');
	await page.getByRole('button', { name: '#garage' }).click();
	await expect(search).toHaveValue('#garage');
	await expect(shown('Rotate the tyres')).toBeVisible();
	await expect(shown('Oil the garage door')).toBeVisible();
	await expect(shown('Descale the kettle')).toBeHidden();

	await page.getByRole('button', { name: '#diy' }).click();
	await expect(shown('Oil the garage door')).toBeVisible();
	await expect(shown('Rotate the tyres')).toBeHidden();

	// The search carries over to the timeline.
	await page.getByRole('link', { name: 'Timeline' }).click();
	await expect(page.getByRole('searchbox', { name: 'Search tasks' })).toHaveValue('#garage #diy');
	await expect(shown('Oil the garage door')).toBeVisible();
	await expect(shown('Descale the kettle')).toBeHidden();

	await page.getByRole('button', { name: '#garage' }).click();
	await expect(shown('Descale the kettle')).toBeVisible();

	await page.getByRole('searchbox', { name: 'Search tasks' }).fill('no such thing');
	await expect(page.getByText('Nothing matches that search.')).toBeVisible();

	// A tag on a task's own page leads to everything that shares it.
	await page.getByRole('searchbox', { name: 'Search tasks' }).fill('kettle');
	await shown('Descale the kettle').click();
	await page.getByRole('link', { name: '#diy' }).click();
	await expect(page).toHaveURL('/');
	await expect(page.getByRole('searchbox', { name: 'Search tasks' })).toHaveValue('#diy');
	await expect(shown('Oil the garage door')).toBeVisible();
	await expect(shown('Rotate the tyres')).toBeHidden();
});
