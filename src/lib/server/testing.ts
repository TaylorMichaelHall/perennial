/** Helpers shared by the server's unit tests. */

import { expect } from 'vitest';

/** Matches what SvelteKit's `error()` throws, for use with `toThrow` and `rejects`. */
export function httpError(status: number, message?: string | RegExp) {
	return expect.objectContaining({
		status,
		body: expect.objectContaining({
			message: message === undefined ? expect.any(String) : expect.stringMatching(message)
		})
	});
}

/** Matches what SvelteKit's `redirect()` throws. */
export function redirectTo(location: string) {
	return expect.objectContaining({ status: 303, location });
}
