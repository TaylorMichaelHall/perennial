/**
 * API keys, for scripts and agents that can't sign in with the password.
 *
 * A key is a random token sent as `Authorization: Bearer <token>`. As with
 * sessions, only its SHA-256 hash is kept, so the token can be shown just once.
 */

import { randomBytes } from 'node:crypto';
import { error } from '@sveltejs/kit';
import type { ApiKey, MintedApiKey } from '#lib/keys.ts';
import { MAX_KEY_NAME_LENGTH } from '#lib/limits.ts';
import { hashToken } from '#lib/server/auth.ts';
import { db } from '#lib/server/db.ts';

/** Makes a key recognisable for what it is when it turns up in a config file. */
const TOKEN_PREFIX = 'perennial_';

const COLUMNS = 'id, name, created_at, expires_at, last_used_at';

export function listApiKeys(): ApiKey[] {
	return db().prepare(`SELECT ${COLUMNS} FROM api_keys ORDER BY id DESC`).all() as unknown as ApiKey[];
}

/** Validates untrusted input from the key form, rejecting it with a 400 if it is unusable. */
export function parseApiKeyFields(body: Record<string, unknown>): {
	name: string;
	expiresAt: number | null;
} {
	const name = typeof body.name === 'string' ? body.name.trim() : '';
	if (!name) error(400, 'Give the key a name.');
	if (name.length > MAX_KEY_NAME_LENGTH) error(400, 'That name is too long.');

	const expiresAt = body.expires_at ?? null;
	if (expiresAt !== null && (!Number.isSafeInteger(expiresAt) || (expiresAt as number) <= Date.now())) {
		error(400, 'Choose an expiry date in the future.');
	}

	return { name, expiresAt: expiresAt as number | null };
}

export function createApiKey(name: string, expiresAt: number | null): MintedApiKey {
	const token = TOKEN_PREFIX + randomBytes(32).toString('base64url');
	const row = db()
		.prepare(
			`INSERT INTO api_keys (name, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?)
			 RETURNING ${COLUMNS}`
		)
		.get(name, hashToken(token), Date.now(), expiresAt);
	return { ...(row as unknown as ApiKey), token };
}

export function revokeApiKey(id: number): void {
	db().prepare('DELETE FROM api_keys WHERE id = ?').run(id);
}

/** Whether `token` is a key that still works. If so, notes that it was just used. */
export function useApiKey(token: string): boolean {
	const now = Date.now();
	const { changes } = db()
		.prepare(
			`UPDATE api_keys SET last_used_at = ?
			 WHERE token_hash = ? AND (expires_at IS NULL OR expires_at > ?)`
		)
		.run(now, hashToken(token), now);
	return changes > 0;
}
