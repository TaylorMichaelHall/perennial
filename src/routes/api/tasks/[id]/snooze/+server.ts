import { error, json } from '@sveltejs/kit';
import { isISODate } from '#lib/dates.ts';
import { readJson, taskId } from '#lib/server/http.ts';
import { snoozeTask } from '#lib/server/tasks.ts';
import type { RequestHandler } from './$types';

/** Snoozes the task until a date, or wakes it when `until` is `null`. */
export const POST: RequestHandler = async ({ params, request }) => {
	const { until } = await readJson(request);
	if (until !== null && !isISODate(until)) error(400, 'Choose a date to snooze until.');
	return json(snoozeTask(taskId(params), until));
};
