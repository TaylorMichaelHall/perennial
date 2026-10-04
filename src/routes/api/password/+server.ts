import { error, json } from '@sveltejs/kit';
import { endAllSessions, SESSION_COOKIE, setPassword, verifyPassword } from '#lib/server/auth.ts';
import { readJson, readNewPassword } from '#lib/server/http.ts';
import type { RequestHandler } from './$types';

/** Changes the password and signs out every other device. */
export const POST: RequestHandler = async ({ request, cookies }) => {
	const { current, password } = await readJson(request);
	if (typeof current !== 'string' || !verifyPassword(current)) {
		error(403, 'Your current password isn’t right.');
	}

	setPassword(readNewPassword(password));
	endAllSessions(cookies.get(SESSION_COOKIE));
	return json({ ok: true });
};
