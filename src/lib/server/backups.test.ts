import { existsSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addDays } from '#lib/dates.ts';
import {
	backUp,
	backUpIfDue,
	backUpLabelled,
	backupStatus,
	DATABASE_FILE,
	datesToKeep,
	listBackups,
	prune,
	restore,
	verify
} from '#lib/server/backups.ts';

let directory: string;
let backups: string;
let database: DatabaseSync;

/** A database with the two tables a backup is checked for, holding `tasks` tasks. */
function open(path: string, tasks = 0): DatabaseSync {
	const opened = new DatabaseSync(path);
	opened.exec(`
		PRAGMA journal_mode = WAL;
		CREATE TABLE IF NOT EXISTS tasks (id INTEGER PRIMARY KEY, title TEXT);
		CREATE TABLE IF NOT EXISTS occurrences (id INTEGER PRIMARY KEY);
		PRAGMA user_version = 3;
	`);
	for (let index = 0; index < tasks; index++) addTask(opened);
	return opened;
}

function addTask(to: DatabaseSync): void {
	to.exec("INSERT INTO tasks (title) VALUES ('Renew passport')");
}

function names(): string[] {
	return readdirSync(backups).sort();
}

const noon = (date: string) => new Date(`${date}T12:00:00Z`);

beforeEach(() => {
	directory = mkdtempSync(join(tmpdir(), 'perennial-backups-'));
	backups = join(directory, 'backups');
	database = open(join(directory, DATABASE_FILE), 2);
	vi.stubEnv('DATA_DIR', directory);
	vi.stubEnv('BACKUP_DIR', '');
});

afterEach(() => {
	database.close();
	vi.unstubAllEnvs();
});

describe('backUp', () => {
	it('writes a snapshot named for the day, holding what the database held', () => {
		const backup = backUp(database, backups, noon('2026-10-04'));

		expect(backup).toMatchObject({ name: 'perennial-2026-10-04.db', date: '2026-10-04', daily: true });
		expect(names()).toEqual(['perennial-2026-10-04.db']);
		expect(verify(backup.path)).toEqual({ tasks: 2, occurrences: 0, schema: 3 });
	});

	it('replaces an earlier snapshot from the same day', () => {
		backUp(database, backups, noon('2026-10-04'));
		addTask(database);
		const backup = backUp(database, backups, noon('2026-10-04'));

		expect(names()).toEqual(['perennial-2026-10-04.db']);
		expect(verify(backup.path).tasks).toBe(3);
	});

	it('leaves nothing behind when the snapshot can’t be written', () => {
		writeFileSync(backups, 'in the way');
		expect(() => backUp(database, backups)).toThrow();
		expect(listBackups(backups)).toEqual([]);
	});
});

describe('verify', () => {
	it('refuses a file that is missing, or not a database, or not one of ours', () => {
		expect(() => verify(join(directory, 'nope.db'))).toThrow(/doesn’t exist/);

		const text = join(directory, 'notes.db');
		writeFileSync(text, 'Not a database at all, just some text. '.repeat(40));
		expect(() => verify(text)).toThrow(/not a usable Perennial database/);

		const other = join(directory, 'other.db');
		new DatabaseSync(other).exec('CREATE TABLE recipes (id INTEGER PRIMARY KEY)');
		expect(() => verify(other)).toThrow(/not a usable Perennial database/);
	});
});

describe('retention', () => {
	/** Every day from `first`, for `count` days, most recent first. */
	function days(first: string, count: number): string[] {
		return Array.from({ length: count }, (_, index) => addDays(first, index)).reverse();
	}

	it('keeps a week of days, then the last of each week, month and year', () => {
		// Three years of daily snapshots, ending on 4 October 2026.
		const kept = [...datesToKeep(days('2023-10-05', 1096))].sort().reverse();

		expect(kept.slice(0, 7)).toEqual(days('2026-09-28', 7));
		// The last day of each of the eleven months before this one.
		for (const date of ['2026-09-30', '2026-08-31', '2026-02-28', '2025-11-30']) {
			expect(kept).toContain(date);
		}
		expect(kept).not.toContain('2025-10-31');
		// The last day of every year, however long ago.
		expect(kept).toContain('2025-12-31');
		expect(kept).toContain('2024-12-31');
		expect(kept).toContain('2023-12-31');
		// 7 days, 4 earlier Sundays, 10 earlier month ends (September's is among the days), and
		// the ends of 2024 and 2023 (2025's is among the months).
		expect(kept).toHaveLength(7 + 4 + 10 + 2);
	});

	it('never drops the only snapshot of a period just because it is old', () => {
		expect(datesToKeep(['2026-10-04', '2019-03-02'])).toEqual(new Set(['2026-10-04', '2019-03-02']));
	});

	it('removes only daily snapshots, leaving ones taken for a reason', () => {
		for (const date of days('2026-09-01', 34).reverse()) backUp(database, backups, noon(date));
		backUpLabelled(database, 'before-restore', backups, noon('2026-09-02'));
		writeFileSync(join(backups, 'notes.txt'), 'not a backup');

		expect(prune(backups)).toEqual([]);
		expect(names()).toEqual([
			'notes.txt',
			'perennial-2026-09-02T120000Z-before-restore.db',
			'perennial-2026-09-06.db',
			'perennial-2026-09-13.db',
			'perennial-2026-09-20.db',
			'perennial-2026-09-27.db',
			'perennial-2026-09-28.db',
			'perennial-2026-09-29.db',
			'perennial-2026-09-30.db',
			'perennial-2026-10-01.db',
			'perennial-2026-10-02.db',
			'perennial-2026-10-03.db',
			'perennial-2026-10-04.db'
		]);
	});
});

describe('restore', () => {
	it('puts a snapshot back, saving what it replaced', () => {
		const backup = backUp(database, backups, noon('2026-10-04'));
		addTask(database);
		database.close();

		const { restored, previous } = restore(backup.path, directory, backups);
		expect(restored.tasks).toBe(2);
		expect(previous).toMatch(/before-restore\.db$/);
		expect(verify(previous!).tasks).toBe(3);

		database = open(join(directory, DATABASE_FILE));
		expect(database.prepare('SELECT count(*) AS count FROM tasks').get()).toEqual({ count: 2 });
	});

	it('discards changes still waiting in the old write-ahead log', () => {
		const backup = backUp(database, backups, noon('2026-10-04'));
		// Left open, so this change is in the log beside the database rather than in it.
		addTask(database);
		expect(existsSync(join(directory, `${DATABASE_FILE}-wal`))).toBe(true);

		restore(backup.path, directory, backups);
		expect(existsSync(join(directory, `${DATABASE_FILE}-wal`))).toBe(false);
		expect(verify(join(directory, DATABASE_FILE)).tasks).toBe(2);
	});

	it('refuses a damaged snapshot, leaving the database alone', () => {
		const damaged = join(backups, 'perennial-2026-10-04.db');
		backUp(database, backups, noon('2026-10-04'));
		writeFileSync(damaged, 'Not a database at all, just some text. '.repeat(40));

		expect(() => restore(damaged, directory, backups)).toThrow(/not a usable/);
		expect(database.prepare('SELECT count(*) AS count FROM tasks').get()).toEqual({ count: 2 });
		expect(names()).toEqual(['perennial-2026-10-04.db']);
	});

	it('restores into a directory with no database yet', () => {
		const backup = backUp(database, backups, noon('2026-10-04'));
		const fresh = mkdtempSync(join(tmpdir(), 'perennial-fresh-'));

		expect(restore(backup.path, fresh, backups)).toEqual({
			restored: { tasks: 2, occurrences: 0, schema: 3 },
			previous: null
		});
	});
});

describe('backUpIfDue', () => {
	it('takes one snapshot a day, and reports where things stand', () => {
		expect(backupStatus()).toEqual({ directory: backups, latest: null, count: 0, error: null });

		backUpIfDue(database, noon('2026-10-04'));
		addTask(database);
		backUpIfDue(database, new Date('2026-10-04T23:00:00Z'));
		expect(verify(join(backups, 'perennial-2026-10-04.db')).tasks).toBe(2);

		backUpIfDue(database, noon('2026-10-05'));
		expect(backupStatus()).toEqual({ directory: backups, latest: '2026-10-05', count: 2, error: null });
	});

	it('writes to BACKUP_DIR when it is set', () => {
		const elsewhere = mkdtempSync(join(tmpdir(), 'perennial-elsewhere-'));
		vi.stubEnv('BACKUP_DIR', elsewhere);

		backUpIfDue(database, noon('2026-10-04'));
		expect(readdirSync(elsewhere)).toEqual(['perennial-2026-10-04.db']);
	});

	it('keeps a failure for Settings rather than throwing, and clears it once backups work', () => {
		const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
		writeFileSync(backups, 'in the way');

		backUpIfDue(database, noon('2026-10-04'));
		expect(backupStatus().error).toEqual(expect.any(String));
		expect(logged).toHaveBeenCalledOnce();

		vi.stubEnv('BACKUP_DIR', join(directory, 'elsewhere'));
		backUpIfDue(database, noon('2026-10-04'));
		expect(backupStatus().error).toBeNull();
		logged.mockRestore();
	});
});
