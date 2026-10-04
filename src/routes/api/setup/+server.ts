import { error, json } from '@sveltejs/kit';
import { createSession, hasPassword, setPassword } from '#lib/server/auth.ts';
import { readJson, readNewPassword, setSessionCookie } from '#lib/server/http.ts';
import type { RequestHandler } from './$types';

/** First-run setup: chooses the password and signs in. */
export const POST: RequestHandler = async (event) => {
	if (hasPassword()) error(409, 'A password has already been set.');

	const { password } = await readJson(event.request);
	setPassword(readNewPassword(password));
	setSessionCookie(event, createSession());
	return json({ ok: true });
};
