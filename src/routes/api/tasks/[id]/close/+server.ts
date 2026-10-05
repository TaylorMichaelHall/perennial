import { error, json } from '@sveltejs/kit';
import { isISODate } from '#lib/dates.ts';
import { readJson, taskId, taskVersion } from '#lib/server/http.ts';
import { closeWindow } from '#lib/server/tasks.ts';
import type { RequestHandler } from './$types';

/** Marks the task's current window as done, or skips it. */
export const POST: RequestHandler = async ({ params, request }) => {
	const { on, skipped, version, note } = await readJson(request);
	// The date comes from the browser because only it knows the user's timezone.
	if (!isISODate(on)) error(400, 'Expected the date this was done.');
	return json(closeWindow(taskId(params), on, skipped === true, taskVersion(version), note));
};
