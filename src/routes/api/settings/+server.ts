import { json } from '@sveltejs/kit';
import { readJson } from '#lib/server/http.ts';
import { saveDateFormat } from '#lib/server/preferences.ts';
import type { RequestHandler } from './$types';

export const PUT: RequestHandler = async ({ request }) => {
	const { dateFormat } = await readJson(request);
	return json({ dateFormat: saveDateFormat(dateFormat) });
};
