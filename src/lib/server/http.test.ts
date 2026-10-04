import type { RequestEvent } from '@sveltejs/kit';
import { describe, expect, it, vi } from 'vitest';
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from '#lib/server/auth.ts';
import {
	bearerToken,
	readJson,
	readNewPassword,
	setSessionCookie,
	taskId
} from '#lib/server/http.ts';
import { httpError } from '#lib/server/testing.ts';

function post(body: string, headers: Record<string, string> = {}): Request {
	return new Request('http://localhost/api/tasks', { method: 'POST', body, headers });
}

describe('readJson', () => {
	it('reads a JSON object', async () => {
		expect(await readJson(post('{"title":"Renew passport"}'))).toEqual({ title: 'Renew passport' });
	});

	it('rejects a body that is not a JSON object', async () => {
		await expect(readJson(post('not json'))).rejects.toEqual(httpError(400));
		await expect(readJson(post('null'))).rejects.toEqual(httpError(400));
		await expect(readJson(post('"text"'))).rejects.toEqual(httpError(400));
		await expect(readJson(post(''))).rejects.toEqual(httpError(400));
	});
});

describe('taskId', () => {
	it('parses a whole number', () => {
		expect(taskId({ id: '42' })).toBe(42);
	});

	it('answers 404 for anything else', () => {
		expect(() => taskId({ id: 'abc' })).toThrow(httpError(404));
		expect(() => taskId({ id: '1.5' })).toThrow(httpError(404));
	});
});

describe('bearerToken', () => {
	it('reads the token of a bearer header, however the scheme is capitalised', () => {
		expect(bearerToken(post('', { authorization: 'Bearer perennial_abc' }))).toBe('perennial_abc');
		expect(bearerToken(post('', { authorization: 'bearer perennial_abc' }))).toBe('perennial_abc');
	});

	it('is undefined without a bearer header', () => {
		expect(bearerToken(post(''))).toBeUndefined();
		expect(bearerToken(post('', { authorization: 'Basic dXNlcjpwYXNz' }))).toBeUndefined();
		expect(bearerToken(post('', { authorization: 'Bearer' }))).toBeUndefined();
		expect(bearerToken(post('', { authorization: 'Bearer two tokens' }))).toBeUndefined();
	});
});

describe('readNewPassword', () => {
	it('accepts a password of at least eight characters', () => {
		expect(readNewPassword('12345678')).toBe('12345678');
	});

	it('rejects one that is too short, or not text', () => {
		expect(() => readNewPassword('1234567')).toThrow(httpError(400, /at least 8/));
		expect(() => readNewPassword(12345678)).toThrow(httpError(400));
		expect(() => readNewPassword(undefined)).toThrow(httpError(400));
	});
});

describe('setSessionCookie', () => {
	function cookieFor(url: string, headers: Record<string, string> = {}) {
		const set = vi.fn();
		const event = { url: new URL(url), request: new Request(url, { headers }), cookies: { set } };
		setSessionCookie(event as unknown as RequestEvent, 'token');
		return set;
	}

	it('sets a long-lived cookie that scripts cannot read', () => {
		expect(cookieFor('http://localhost:3000/')).toHaveBeenCalledWith(SESSION_COOKIE, 'token', {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: false,
			maxAge: SESSION_MAX_AGE_SECONDS
		});
	});

	it('marks the cookie Secure only when the request arrived over HTTPS', () => {
		const secure = (set: ReturnType<typeof cookieFor>) => set.mock.calls[0][2].secure;

		expect(secure(cookieFor('https://todo.example.com/'))).toBe(true);
		expect(secure(cookieFor('http://perennial:3000/', { 'x-forwarded-proto': 'https' }))).toBe(true);
		expect(secure(cookieFor('http://perennial:3000/', { 'x-forwarded-proto': 'http' }))).toBe(false);
	});
});
