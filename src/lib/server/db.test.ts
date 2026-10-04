import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { listBackups, verify } from '#lib/server/backups.ts';
import { db, migrate, readSetting, transaction, writeSetting } from '#lib/server/db.ts';

describe('db', () => {
	it('applies every migration, and reuses one connection', () => {
		const { user_version } = db().prepare('PRAGMA user_version').get() as { user_version: number };
		expect(user_version).toBeGreaterThan(0);
		expect(db()).toBe(db());

		const columns = db().prepare('PRAGMA table_info(tasks)').all();
		expect(columns.map((column) => column.name)).toContain('snoozed_until');
	});
});

describe('migrate', () => {
	/** A database as an old version left it: the first schema, with one task on the 31st. */
	function old(): DatabaseSync {
		const database = new DatabaseSync(':memory:');
		database.exec(`
			CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
			CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL) STRICT;
			CREATE TABLE tasks (
				id INTEGER PRIMARY KEY, title TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '',
				opens_on TEXT NOT NULL, due_on TEXT NOT NULL, hard INTEGER NOT NULL DEFAULT 0,
				repeat_every INTEGER, repeat_unit TEXT, repeat_from TEXT NOT NULL DEFAULT 'schedule',
				done_on TEXT
			) STRICT;
			CREATE TABLE occurrences (
				id INTEGER PRIMARY KEY, task_id INTEGER NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
				opens_on TEXT NOT NULL, due_on TEXT NOT NULL, closed_on TEXT NOT NULL,
				skipped INTEGER NOT NULL DEFAULT 0
			) STRICT;
			INSERT INTO tasks (title, opens_on, due_on) VALUES ('Pay rent', '2027-01-09', '2027-01-31');
			PRAGMA user_version = 1;
		`);
		return database;
	}

	it('brings an old database up to date, aiming each window at the days it is on', () => {
		const database = old();
		migrate(database);

		expect(database.prepare('SELECT opens_day, due_day, tags, version FROM tasks').get()).toEqual({
			opens_day: 9,
			due_day: 31,
			tags: '[]',
			version: 0
		});
	});

	it('saves a copy of a database before changing its shape, and only then', () => {
		const database = old();
		migrate(database);

		const [saved, ...others] = listBackups();
		expect(others).toEqual([]);
		expect(saved.name).toMatch(/before-schema-\d+\.db$/);
		expect(saved.daily).toBe(false);
		expect(verify(saved.path)).toEqual({ tasks: 1, occurrences: 0, schema: 1 });

		migrate(database);
		expect(listBackups()).toHaveLength(1);
	});
});

describe('settings', () => {
	it('reads back what was written, replacing an earlier value', () => {
		expect(readSetting('colour')).toBeUndefined();
		writeSetting('colour', 'green');
		writeSetting('colour', 'blue');
		expect(readSetting('colour')).toBe('blue');
	});
});

describe('transaction', () => {
	it('keeps the work and returns its result', () => {
		expect(transaction(() => (writeSetting('kept', 'yes'), 'result'))).toBe('result');
		expect(readSetting('kept')).toBe('yes');
	});

	it('undoes the work, and passes the error on, when it throws', () => {
		const failure = new Error('halfway through');
		expect(() =>
			transaction(() => {
				writeSetting('abandoned', 'yes');
				throw failure;
			})
		).toThrow(failure);
		expect(readSetting('abandoned')).toBeUndefined();
	});
});
