import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '#lib/server/db.ts';
import {
	createApiKey,
	listApiKeys,
	parseApiKeyFields,
	revokeApiKey,
	useApiKey
} from '#lib/server/keys.ts';
import { httpError } from '#lib/server/testing.ts';

const NOW = Date.UTC(2026, 9, 3, 12);
const HOUR_MS = 3_600_000;

beforeEach(() => {
	vi.useFakeTimers({ now: NOW });
	db().exec('DELETE FROM api_keys;');
});

afterEach(() => {
	vi.useRealTimers();
});

describe('parseApiKeyFields', () => {
	it('trims the name, and defaults to a key that never expires', () => {
		expect(parseApiKeyFields({ name: ' Home Assistant ' })).toEqual({
			name: 'Home Assistant',
			expiresAt: null
		});
		expect(parseApiKeyFields({ name: 'Script', expires_at: null }).expiresAt).toBeNull();
	});

	it('keeps an expiry in the future', () => {
		const expires_at = NOW + HOUR_MS;
		expect(parseApiKeyFields({ name: 'Script', expires_at }).expiresAt).toBe(expires_at);
	});

	it('requires a name of a sensible length', () => {
		expect(() => parseApiKeyFields({ name: '  ' })).toThrow(httpError(400, /name/));
		expect(() => parseApiKeyFields({})).toThrow(httpError(400, /name/));
		expect(() => parseApiKeyFields({ name: 'a'.repeat(101) })).toThrow(httpError(400, /too long/));
	});

	it('rejects an expiry that has passed or is not a moment in time', () => {
		for (const expires_at of [NOW, NOW - 1, 1.5, '2027-01-01']) {
			expect(() => parseApiKeyFields({ name: 'Script', expires_at })).toThrow(
				httpError(400, /expiry/)
			);
		}
	});
});

describe('API keys', () => {
	it('mints a recognisable token, keeping only its hash', () => {
		const key = createApiKey('Script', null);
		expect(key).toEqual({
			id: key.id,
			name: 'Script',
			created_at: NOW,
			expires_at: null,
			last_used_at: null,
			token: key.token
		});
		expect(key.token).toMatch(/^perennial_[\w-]{43}$/);
		expect(createApiKey('Other', null).token).not.toBe(key.token);

		const stored = db().prepare('SELECT token_hash FROM api_keys WHERE id = ?').get(key.id);
		expect(stored?.token_hash).toMatch(/^[0-9a-f]{64}$/);
		expect(JSON.stringify(listApiKeys())).not.toContain(key.token);
	});

	it('lists keys newest first, without their tokens', () => {
		createApiKey('First', null);
		createApiKey('Second', NOW + HOUR_MS);
		const keys = listApiKeys();

		expect(keys.map((key) => key.name)).toEqual(['Second', 'First']);
		expect(keys[0]).toEqual({
			id: keys[0].id,
			name: 'Second',
			created_at: NOW,
			expires_at: NOW + HOUR_MS,
			last_used_at: null
		});
	});

	it('accepts a key that works, noting when it was last used', () => {
		const { id, token } = createApiKey('Script', null);
		vi.advanceTimersByTime(HOUR_MS);

		expect(useApiKey(token)).toBe(true);
		expect(listApiKeys().find((key) => key.id === id)?.last_used_at).toBe(NOW + HOUR_MS);
	});

	it('rejects a token it never minted', () => {
		createApiKey('Script', null);
		expect(useApiKey('perennial_not-a-real-key')).toBe(false);
		expect(useApiKey('')).toBe(false);
	});

	it('stops accepting a key the moment it expires', () => {
		const { token } = createApiKey('Script', NOW + HOUR_MS);

		vi.advanceTimersByTime(HOUR_MS - 1);
		expect(useApiKey(token)).toBe(true);
		vi.advanceTimersByTime(1);
		expect(useApiKey(token)).toBe(false);
		expect(listApiKeys()[0].last_used_at).toBe(NOW + HOUR_MS - 1);
	});

	it('stops accepting a key that has been revoked, leaving the others', () => {
		const revoked = createApiKey('Old script', null);
		const kept = createApiKey('New script', null);
		revokeApiKey(revoked.id);

		expect(useApiKey(revoked.token)).toBe(false);
		expect(useApiKey(kept.token)).toBe(true);
		expect(listApiKeys().map((key) => key.name)).toEqual(['New script']);
	});
});
