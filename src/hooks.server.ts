import { error, redirect } from '@sveltejs/kit';
import type { Handle, ServerInit } from '@sveltejs/kit/hooks';
import { building } from '$app/env';
import {
	hasPassword,
	isValidSession,
	seedPasswordFromEnvironment,
	SESSION_COOKIE
} from '#lib/server/auth.ts';
import { startBackups } from '#lib/server/backups.ts';
import { db } from '#lib/server/db.ts';
import { bearerToken } from '#lib/server/http.ts';
import { useApiKey } from '#lib/server/keys.ts';
import { startNotifier } from '#lib/server/notifications.ts';

export const init: ServerInit = () => {
	// SvelteKit also runs the app while building it, when there is nothing to set up.
	if (building) return;
	seedPasswordFromEnvironment();
	startNotifier();
	startBackups(db);
};

/** The only part of the API an API key opens; settings and keys themselves need a session. */
const KEY_ROUTES = /^\/api\/tasks(\/|$)/;

/**
 * Gates every request. A fresh install can only reach first-run setup, a
 * signed-out visitor can only reach the sign-in page, and everything else
 * requires a session. The exceptions are the API reference at `/api`, which
 * is public, and the task endpoints, which also accept an API key.
 */
export const handle: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;
	const isApi = pathname.startsWith('/api/');

	const configured = hasPassword();
	const signedIn = configured && isValidSession(event.cookies.get(SESSION_COOKIE));
	event.locals.signedIn = signedIn;

	const entrance = configured ? '/login' : '/setup';
	const isEntrance = pathname === entrance || pathname === `/api${entrance}`;
	const isPublic = isEntrance || pathname === '/api';

	if (!signedIn && !isPublic) {
		if (isApi) {
			const token = bearerToken(event.request);
			if (!configured || !token || !useApiKey(token)) {
				error(401, 'Send an API key as a bearer token, or sign in. See /api.');
			}
			if (!KEY_ROUTES.test(pathname)) error(403, 'An API key can only be used on /api/tasks.');
			return resolve(event);
		}
		// Remember where a signed-out visitor was heading, e.g. from a notification link.
		const next = configured && pathname !== '/' ? `?next=${encodeURIComponent(pathname)}` : '';
		redirect(303, entrance + next);
	}

	const isAuthPage = pathname === '/login' || pathname === '/setup';
	if (signedIn && isAuthPage) redirect(303, '/');

	return resolve(event);
};
