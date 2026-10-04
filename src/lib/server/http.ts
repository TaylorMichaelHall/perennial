import { error, type RequestEvent } from '@sveltejs/kit';
import { MIN_PASSWORD_LENGTH } from '#lib/limits.ts';
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from '#lib/server/auth.ts';

/** Reads a JSON object from the request body, rejecting anything else with a 400. */
export async function readJson(request: Request): Promise<Record<string, unknown>> {
	const body = await request.json().catch(() => null);
	if (typeof body !== 'object' || body === null) error(400, 'Expected a JSON object.');
	return body;
}

/** Parses the `[id]` route parameter of a task endpoint. */
export function taskId(params: { id: string }): number {
	const id = Number(params.id);
	if (!Number.isInteger(id)) error(404, 'That task no longer exists.');
	return id;
}

/** The token of an `Authorization: Bearer` header, if the request has one. */
export function bearerToken(request: Request): string | undefined {
	return request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
}

export function readNewPassword(value: unknown): string {
	if (typeof value !== 'string' || value.length < MIN_PASSWORD_LENGTH) {
		error(400, `Use at least ${MIN_PASSWORD_LENGTH} characters.`);
	}
	return value;
}

export function setSessionCookie(event: RequestEvent, token: string): void {
	// Browsers drop `Secure` cookies on plain HTTP, which is how many people
	// reach a self-hosted app on their own network. Only require HTTPS when
	// the request arrived over it, directly or through a reverse proxy.
	const overHttps =
		event.url.protocol === 'https:' || event.request.headers.get('x-forwarded-proto') === 'https';

	event.cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: overHttps,
		maxAge: SESSION_MAX_AGE_SECONDS
	});
}

/** Required optimistic concurrency token for completion and undo requests. */
export function taskVersion(value: unknown): number {
	if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
		error(400, "Send the task’s current version. Fetch the task and try again.");
	}
	return value;
}
