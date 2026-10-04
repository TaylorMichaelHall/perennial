import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { backUpLabelled, DATABASE_FILE, dataDirectory } from '#lib/server/backups.ts';

/**
 * Schema changes, oldest first. Each runs once; the database's `user_version`
 * records how many have been applied. Append to this list, never edit an entry
 * that has shipped.
 */
const MIGRATIONS = [
	`
	CREATE TABLE IF NOT EXISTS settings (
		key   TEXT PRIMARY KEY,
		value TEXT NOT NULL
	) STRICT;

	CREATE TABLE IF NOT EXISTS sessions (
		token_hash TEXT PRIMARY KEY,
		expires_at INTEGER NOT NULL
	) STRICT;

	CREATE TABLE IF NOT EXISTS tasks (
		id           INTEGER PRIMARY KEY,
		title        TEXT NOT NULL,
		notes        TEXT NOT NULL DEFAULT '',
		opens_on     TEXT NOT NULL,
		due_on       TEXT NOT NULL,
		hard         INTEGER NOT NULL DEFAULT 0,
		repeat_every INTEGER,
		repeat_unit  TEXT CHECK (repeat_unit IN ('month', 'year')),
		repeat_from  TEXT NOT NULL DEFAULT 'schedule' CHECK (repeat_from IN ('schedule', 'completion')),
		done_on      TEXT
	) STRICT;

	CREATE TABLE IF NOT EXISTS occurrences (
		id        INTEGER PRIMARY KEY,
		task_id   INTEGER NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
		opens_on  TEXT NOT NULL,
		due_on    TEXT NOT NULL,
		closed_on TEXT NOT NULL,
		skipped   INTEGER NOT NULL DEFAULT 0
	) STRICT;

	CREATE INDEX IF NOT EXISTS occurrences_by_task ON occurrences (task_id);
	`,
	`ALTER TABLE tasks ADD COLUMN snoozed_until TEXT;`,
	`
	CREATE TABLE api_keys (
		id           INTEGER PRIMARY KEY,
		name         TEXT NOT NULL,
		token_hash   TEXT NOT NULL UNIQUE,
		created_at   INTEGER NOT NULL,
		expires_at   INTEGER,
		last_used_at INTEGER
	) STRICT;
	`,
	`ALTER TABLE tasks ADD COLUMN version INTEGER NOT NULL DEFAULT 0;`,
	// The days of the month a window aims for (see `Anchor`). Existing windows
	// are taken to be where they were meant to be. A past window records what
	// its task was aiming for when it was closed, so that undoing puts it back.
	`
	ALTER TABLE tasks ADD COLUMN opens_day INTEGER NOT NULL DEFAULT 1;
	ALTER TABLE tasks ADD COLUMN due_day INTEGER NOT NULL DEFAULT 1;
	UPDATE tasks
	SET opens_day = CAST(substr(opens_on, 9, 2) AS INTEGER),
	    due_day = CAST(substr(due_on, 9, 2) AS INTEGER);

	ALTER TABLE occurrences ADD COLUMN opens_day INTEGER;
	ALTER TABLE occurrences ADD COLUMN due_day INTEGER;
	`,
	// A JSON array of strings.
	`ALTER TABLE tasks ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';`
];

export function migrate(database: DatabaseSync): void {
	const { user_version: applied } = database.prepare('PRAGMA user_version').get() as {
		user_version: number;
	};

	if (applied === MIGRATIONS.length) return;

	// Keep a copy of a database that already holds something before changing its shape.
	const { tables } = database
		.prepare("SELECT count(*) AS tables FROM sqlite_master WHERE type = 'table'")
		.get() as { tables: number };
	if (tables > 0) backUpLabelled(database, `before-schema-${MIGRATIONS.length}`);

	for (let version = applied; version < MIGRATIONS.length; version++) {
		database.exec('BEGIN');
		database.exec(MIGRATIONS[version]);
		database.exec(`PRAGMA user_version = ${version + 1}`);
		database.exec('COMMIT');
	}
}

let connection: DatabaseSync | undefined;

/** The shared database connection, opened (and its schema created) on first use. */
export function db(): DatabaseSync {
	if (!connection) {
		const directory = dataDirectory();
		mkdirSync(directory, { recursive: true });
		connection = new DatabaseSync(join(directory, DATABASE_FILE));
		connection.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
		migrate(connection);
	}
	return connection;
}

/** Reads a value from the `settings` table, or `undefined` if it has never been set. */
export function readSetting(key: string): string | undefined {
	const row = db().prepare('SELECT value FROM settings WHERE key = ?').get(key);
	return row?.value as string | undefined;
}

export function writeSetting(key: string, value: string): void {
	db()
		.prepare(
			'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value'
		)
		.run(key, value);
}

/** Runs `work` in a transaction, rolling back if it throws. */
export function transaction<T>(work: () => T): T {
	db().exec('BEGIN');
	try {
		const result = work();
		db().exec('COMMIT');
		return result;
	} catch (error) {
		db().exec('ROLLBACK');
		throw error;
	}
}
