import { json } from '@sveltejs/kit';
import { readJson } from '#lib/server/http.ts';
import { importTasks, parseExport } from '#lib/server/transfer.ts';
import type { RequestHandler } from './$types';

/** Adds the tasks in an export to the ones already here. The file is checked whole before anything is added. */
export const POST: RequestHandler = async ({ request }) => {
	const { tasks } = parseExport(await readJson(request));
	return json({ imported: importTasks(tasks) });
};
