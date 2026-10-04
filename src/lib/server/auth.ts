/**
 * Single-password authentication.
 *
 * The password is stored as a scrypt hash in the `settings` table. Signing in
 * creates a random session token; only its SHA-256 hash is kept, so a leaked
 * database can't be used to forge a cookie.
 */

import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { db, readSetting, writeSetting } from '#lib/server/db.ts';

export const SESSION_COOKIE = 'perennial_session';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

const PASSWORD_KEY = 'password_hash';

function hashPassword(password: string): string {
	const salt = randomBytes(16);
	const hash = scryptSync(password, salt, 64);
	return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`;
}

/** Whether a password has been chosen yet. Until then the app shows first-run setup. */
export function hasPassword(): boolean {
	return readSetting(PASSWORD_KEY) !== undefined;
}

export function setPassword(password: string): void {
	writeSetting(PASSWORD_KEY, hashPassword(password));
}

export function verifyPassword(password: string): boolean {
	const stored = readSetting(PASSWORD_KEY);
	if (!stored) return false;

	const [, salt, hash] = stored.split(':');
	const expected = Buffer.from(hash, 'hex');
	const actual = scryptSync(password, Buffer.from(salt, 'hex'), expected.length);
	return timingSafeEqual(actual, expected);
}

/**
 * On a fresh install, takes the password from `INITIAL_PASSWORD` if it is set.
 * Once a password exists the variable is ignored, so changing the password in
 * the app is never undone by a restart.
 */
export function seedPasswordFromEnvironment(): void {
	const initial = process.env.INITIAL_PASSWORD;
	if (initial && !hasPassword()) setPassword(initial);
}

export function hashToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

/** Starts a session and returns the token to hand to the browser. */
export function createSession(): string {
	const token = randomBytes(32).toString('base64url');
	const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
	db().prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
	db()
		.prepare('INSERT INTO sessions (token_hash, expires_at) VALUES (?, ?)')
		.run(hashToken(token), expiresAt);
	return token;
}

export function isValidSession(token: string | undefined): boolean {
	if (!token) return false;
	const row = db()
		.prepare('SELECT 1 FROM sessions WHERE token_hash = ? AND expires_at > ?')
		.get(hashToken(token), Date.now());
	return row !== undefined;
}

export function endSession(token: string | undefined): void {
	if (token) db().prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
}

/** Signs out every device, optionally sparing the session that asked. */
export function endAllSessions(exceptToken?: string): void {
	db()
		.prepare('DELETE FROM sessions WHERE token_hash != ?')
		.run(exceptToken ? hashToken(exceptToken) : '');
}
