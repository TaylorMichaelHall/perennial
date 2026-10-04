import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	createSession,
	endAllSessions,
	endSession,
	hasPassword,
	isValidSession,
	seedPasswordFromEnvironment,
	SESSION_MAX_AGE_SECONDS,
	setPassword,
	verifyPassword
} from '#lib/server/auth.ts';
import { db, readSetting } from '#lib/server/db.ts';

beforeEach(() => {
	db().exec('DELETE FROM settings; DELETE FROM sessions;');
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllEnvs();
});

describe('password', () => {
	it('is missing on a fresh install', () => {
		expect(hasPassword()).toBe(false);
		expect(verifyPassword('anything')).toBe(false);
	});

	it('accepts the password that was set and no other', () => {
		setPassword('correct horse');
		expect(hasPassword()).toBe(true);
		expect(verifyPassword('correct horse')).toBe(true);
		expect(verifyPassword('correct horse ')).toBe(false);
		expect(verifyPassword('')).toBe(false);
	});

	it('is replaced when it is changed', () => {
		setPassword('first password');
		setPassword('second password');
		expect(verifyPassword('first password')).toBe(false);
		expect(verifyPassword('second password')).toBe(true);
	});

	it('is stored as a salted hash', () => {
		setPassword('correct horse');
		const first = readSetting('password_hash');
		setPassword('correct horse');
		const second = readSetting('password_hash');

		expect(first).toMatch(/^scrypt:[0-9a-f]{32}:[0-9a-f]{128}$/);
		expect(first).not.toContain('correct horse');
		expect(second).not.toBe(first);
	});
});

describe('seedPasswordFromEnvironment', () => {
	it('takes the password from INITIAL_PASSWORD on a fresh install', () => {
		vi.stubEnv('INITIAL_PASSWORD', 'from the environment');
		seedPasswordFromEnvironment();
		expect(verifyPassword('from the environment')).toBe(true);
	});

	it('leaves an existing password alone', () => {
		setPassword('chosen in the app');
		vi.stubEnv('INITIAL_PASSWORD', 'from the environment');
		seedPasswordFromEnvironment();
		expect(verifyPassword('chosen in the app')).toBe(true);
		expect(verifyPassword('from the environment')).toBe(false);
	});

	it('does nothing when the variable is unset or empty', () => {
		vi.stubEnv('INITIAL_PASSWORD', '');
		seedPasswordFromEnvironment();
		expect(hasPassword()).toBe(false);
	});
});

describe('sessions', () => {
	it('recognises a token it handed out', () => {
		expect(isValidSession(createSession())).toBe(true);
	});

	it('rejects a missing or unknown token', () => {
		createSession();
		expect(isValidSession(undefined)).toBe(false);
		expect(isValidSession('')).toBe(false);
		expect(isValidSession('not-a-real-token')).toBe(false);
	});

	it('hands out a different token each time', () => {
		expect(createSession()).not.toBe(createSession());
	});

	it('keeps only a hash of the token', () => {
		const token = createSession();
		const rows = db().prepare('SELECT token_hash FROM sessions').all();
		expect(rows).toHaveLength(1);
		expect(rows[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
		expect(rows[0].token_hash).not.toBe(token);
	});

	it('expires a session after its maximum age', () => {
		vi.useFakeTimers();
		const token = createSession();

		vi.advanceTimersByTime(SESSION_MAX_AGE_SECONDS * 1000 - 1);
		expect(isValidSession(token)).toBe(true);
		vi.advanceTimersByTime(1);
		expect(isValidSession(token)).toBe(false);
	});

	it('clears out expired sessions when a new one starts', () => {
		vi.useFakeTimers();
		createSession();
		vi.advanceTimersByTime(SESSION_MAX_AGE_SECONDS * 1000 + 1);
		createSession();
		expect(db().prepare('SELECT * FROM sessions').all()).toHaveLength(1);
	});

	it('ends one session without touching the others', () => {
		const phone = createSession();
		const laptop = createSession();
		endSession(phone);
		endSession(undefined);
		expect(isValidSession(phone)).toBe(false);
		expect(isValidSession(laptop)).toBe(true);
	});

	it('ends every session, sparing the one that asked', () => {
		const phone = createSession();
		const laptop = createSession();
		endAllSessions(laptop);
		expect(isValidSession(phone)).toBe(false);
		expect(isValidSession(laptop)).toBe(true);

		endAllSessions();
		expect(isValidSession(laptop)).toBe(false);
	});
});
