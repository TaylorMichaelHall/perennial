#!/usr/bin/env node
/**
 * Clears the password and signs out every device, for when it has been
 * forgotten. Tasks are left untouched. Afterwards the app shows first-run
 * setup again, or takes `INITIAL_PASSWORD` on its next start if that is set.
 *
 *   docker compose exec perennial node reset-password.mjs
 */

import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const database = new DatabaseSync(join(process.env.DATA_DIR || 'data', 'perennial.db'));
database.exec(`
	DELETE FROM settings WHERE key = 'password_hash';
	DELETE FROM sessions;
`);
database.close();

console.log('Password cleared. Open Perennial to choose a new one.');
