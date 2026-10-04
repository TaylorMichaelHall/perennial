import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, messageOf } from '#lib/api.ts';

function respondWith(body: string, status = 200) {
	const fetch = vi.fn(async () => new Response(body, { status }));
	vi.stubGlobal('fetch', fetch);
	return fetch;
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('api', () => {
	it('fetches delivery status without sending a GET body', async () => {
		const fetch = respondWith('[]');
		await api('GET', '/api/notifications');
		expect(fetch).toHaveBeenCalledWith('/api/notifications', expect.objectContaining({ method: 'GET', body: undefined }));
	});
	it('sends the body as JSON and returns the reply', async () => {
		const fetch = respondWith('{"id":7}', 201);
		expect(await api('POST', '/api/tasks', { title: 'Renew passport' })).toEqual({ id: 7 });
		expect(fetch).toHaveBeenCalledWith('/api/tasks', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: '{"title":"Renew passport"}'
		});
	});

	it('sends an empty object when there is no body', async () => {
		const fetch = respondWith('{"ok":true}');
		await api('DELETE', '/api/tasks/7');
		expect(fetch).toHaveBeenCalledWith('/api/tasks/7', expect.objectContaining({ body: '{}' }));
	});

	it('throws the message the server gave', async () => {
		respondWith('{"message":"Give the task a name."}', 400);
		await expect(api('POST', '/api/tasks')).rejects.toThrow('Give the task a name.');
	});

	it('throws a general message when the server gave none', async () => {
		respondWith('<h1>Bad Gateway</h1>', 502);
		await expect(api('POST', '/api/tasks')).rejects.toThrow('Something went wrong. Try again.');
	});
});

describe('messageOf', () => {
	it('is the message of an error, or a general one for anything else', () => {
		expect(messageOf(new Error('That password isn’t right.'))).toBe('That password isn’t right.');
		expect(messageOf('nope')).toBe('Something went wrong. Try again.');
		expect(messageOf(undefined)).toBe('Something went wrong. Try again.');
	});
});
