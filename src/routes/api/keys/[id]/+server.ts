import { json } from '@sveltejs/kit';
import { revokeApiKey } from '#lib/server/keys.ts';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = ({ params }) => {
	revokeApiKey(Number(params.id));
	return json({ ok: true });
};
