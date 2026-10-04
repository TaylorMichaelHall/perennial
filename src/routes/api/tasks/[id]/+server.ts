import { json } from '@sveltejs/kit';
import { readJson, taskId } from '#lib/server/http.ts';
import { deleteTask, getTask, parseTaskFields, updateTask } from '#lib/server/tasks.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params }) => json(getTask(taskId(params)));

export const PUT: RequestHandler = async ({ params, request }) => {
	const fields = parseTaskFields(await readJson(request));
	return json(updateTask(taskId(params), fields));
};

export const DELETE: RequestHandler = ({ params }) => {
	deleteTask(taskId(params));
	return json({ ok: true });
};
