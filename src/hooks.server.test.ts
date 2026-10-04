import type { RequestEvent } from '@sveltejs/kit';
import { beforeEach, describe, expect, it } from 'vitest';
import { createSession, SESSION_COOKIE, setPassword } from '#lib/server/auth.ts';
import { db } from '#lib/server/db.ts';
import { createApiKey } from '#lib/server/keys.ts';
import { httpError, redirectTo } from '#lib/server/testing.ts';
import { handle } from './hooks.server.ts';

interface Visitor {
	session?: string;
	apiKey?: string;
}

/** Sends a request through the gate, returning the event if it was let through. */
async function visit(pathname: string, { session, apiKey }: Visitor = {}) {
	const url = new URL(pathname, 'http://localhost');
	const headers = apiKey ? { authorization: `Bearer ${apiKey}` } : undefined;
	const event = {
		url,
		request: new Request(url, { headers }),
		cookies: { get: (name: string) => (name === SESSION_COOKIE ? session : undefined) },
		locals: {}
	} as unknown as RequestEvent;

	await handle({ event, resolve: async () => new Response('ok') });
	return event;
}

beforeEach(() => {
	db().exec('DELETE FROM settings; DELETE FROM sessions; DELETE FROM api_keys;');
});

describe('on a fresh install', () => {
	it('sends every page to first-run setup', async () => {
		await expect(visit('/')).rejects.toEqual(redirectTo('/setup'));
		await expect(visit('/timeline')).rejects.toEqual(redirectTo('/setup'));
		await expect(visit('/login')).rejects.toEqual(redirectTo('/setup'));
	});

	it('lets setup through, signed out', async () => {
		expect((await visit('/setup')).locals.signedIn).toBe(false);
		await visit('/api/setup');
	});

	it('refuses the rest of the API, even to a session left from an earlier install', async () => {
		await expect(visit('/api/tasks', { session: createSession() })).rejects.toEqual(httpError(401));
		await expect(visit('/api/login')).rejects.toEqual(httpError(401));
	});
});

describe('signed out', () => {
	beforeEach(() => {
		setPassword('correct horse');
	});

	it('sends pages to sign-in, remembering where the visitor was heading', async () => {
		await expect(visit('/')).rejects.toEqual(redirectTo('/login'));
		await expect(visit('/tasks/7')).rejects.toEqual(redirectTo('/login?next=%2Ftasks%2F7'));
		await expect(visit('/setup')).rejects.toEqual(redirectTo('/login?next=%2Fsetup'));
	});

	it('lets sign-in and the API reference through', async () => {
		expect((await visit('/login')).locals.signedIn).toBe(false);
		await visit('/api/login');
		await visit('/api');
	});

	it('refuses the API without a session or a key', async () => {
		await expect(visit('/api/tasks')).rejects.toEqual(httpError(401));
		await expect(visit('/api/setup')).rejects.toEqual(httpError(401));
		await expect(visit('/api/tasks', { session: 'not-a-session' })).rejects.toEqual(httpError(401));
		await expect(visit('/api/tasks', { apiKey: 'perennial_wrong' })).rejects.toEqual(httpError(401));
	});
});

describe('with an API key', () => {
	let apiKey: string;

	beforeEach(() => {
		setPassword('correct horse');
		apiKey = createApiKey('Script', null).token;
	});

	it('opens the task endpoints, without signing in', async () => {
		expect((await visit('/api/tasks', { apiKey })).locals.signedIn).toBe(false);
		await visit('/api/tasks/7', { apiKey });
	});

	it('opens nothing else in the API', async () => {
		await expect(visit('/api/keys', { apiKey })).rejects.toEqual(httpError(403));
		await expect(visit('/api/notifications', { apiKey })).rejects.toEqual(httpError(403));
		await expect(visit('/api/password', { apiKey })).rejects.toEqual(httpError(403));
		await expect(visit('/api/export', { apiKey })).rejects.toEqual(httpError(403));
		await expect(visit('/api/import', { apiKey })).rejects.toEqual(httpError(403));
		await expect(visit('/api/tasksmith', { apiKey })).rejects.toEqual(httpError(403));
	});

	it('does not open the pages', async () => {
		await expect(visit('/settings', { apiKey })).rejects.toEqual(redirectTo('/login?next=%2Fsettings'));
	});
});

describe('signed in', () => {
	let session: string;

	beforeEach(() => {
		setPassword('correct horse');
		session = createSession();
	});

	it('lets pages and the whole API through', async () => {
		expect((await visit('/', { session })).locals.signedIn).toBe(true);
		await visit('/tasks/7', { session });
		await visit('/api/tasks', { session });
		await visit('/api/keys', { session });
		await visit('/api/export', { session });
	});

	it('sends the sign-in and setup pages back to the app', async () => {
		await expect(visit('/login', { session })).rejects.toEqual(redirectTo('/'));
		await expect(visit('/setup', { session })).rejects.toEqual(redirectTo('/'));
	});
});
