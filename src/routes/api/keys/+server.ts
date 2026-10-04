import { json } from '@sveltejs/kit';
import { readJson } from '#lib/server/http.ts';
import { createApiKey, parseApiKeyFields } from '#lib/server/keys.ts';
import type { RequestHandler } from './$types';

/** Mints an API key. The reply is the only time its token is ever shown. */
export const POST: RequestHandler = async ({ request }) => {
	const { name, expiresAt } = parseApiKeyFields(await readJson(request));
	return json(createApiKey(name, expiresAt), { status: 201 });
};
