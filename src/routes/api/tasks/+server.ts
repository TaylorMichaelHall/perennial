import { json } from '@sveltejs/kit';
import { readJson } from '#lib/server/http.ts';
import { createTask, listTasks, parseTaskFields } from '#lib/server/tasks.ts';
import { matchesSearch } from '#lib/tasks.ts';
import type { RequestHandler } from './$types';

/** Every task, or with `?q=` only those matching a search. */
export const GET: RequestHandler = ({ url }) => {
	const query = url.searchParams.get('q') ?? '';
	return json(listTasks().filter((task) => matchesSearch(task, query)));
};

export const POST: RequestHandler = async ({ request }) => {
	const fields = parseTaskFields(await readJson(request));
	return json(createTask(fields), { status: 201 });
};
