import { error, json } from '@sveltejs/kit';
import { createSession, verifyPassword } from '#lib/server/auth.ts';
import { readJson, setSessionCookie } from '#lib/server/http.ts';
import { recordFailure, recordSuccess, secondsUntilAllowed } from '#lib/server/throttle.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	const address = event.getClientAddress();
	const wait = secondsUntilAllowed(address);
	if (wait > 0) error(429, `Too many attempts. Try again in ${wait} seconds.`);

	const { password } = await readJson(event.request);
	if (typeof password !== 'string' || !verifyPassword(password)) {
		recordFailure(address);
		error(401, 'That password isn’t right.');
	}

	recordSuccess(address);
	setSessionCookie(event, createSession());
	return json({ ok: true });
};
