import { exportData } from '#lib/server/transfer.ts';
import type { RequestHandler } from './$types';

/** Every task and its history as a versioned JSON file. Needs a session; an API key can't reach it. */
export const GET: RequestHandler = () =>
	new Response(JSON.stringify(exportData(), null, '\t'), {
		headers: { 'content-type': 'application/json' }
	});
