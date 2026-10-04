import { json } from '@sveltejs/kit';
import { endSession, SESSION_COOKIE } from '#lib/server/auth.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ cookies }) => {
	endSession(cookies.get(SESSION_COOKIE));
	cookies.delete(SESSION_COOKIE, { path: '/' });
	return json({ ok: true });
};
