import { json } from '@sveltejs/kit';
import { readJson, taskId, taskVersion } from '#lib/server/http.ts';
import { reopenWindow } from '#lib/server/tasks.ts';
import type { RequestHandler } from './$types';

/** Undoes the most recent "done" or "skip" for the task. */
export const POST: RequestHandler = async ({ params, request }) => {
	const { version } = await readJson(request);
	return json(reopenWindow(taskId(params), taskVersion(version)));
};
