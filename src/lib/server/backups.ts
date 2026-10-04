/**
 * Backups of the database: a snapshot each day, thinned out as they age, and
 * the means to check one and put it back.
 *
 * A snapshot is a complete SQLite database, so it holds everything the live
 * one does, the password hash and notification destinations included. It is
 * taken with `VACUUM INTO`, which is safe while the app is running.
 *
 * This file imports nothing but Node itself, so that `scripts/backup.mjs` can
 * use it without the rest of the app.
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const DATABASE_FILE = 'perennial.db';

/** How many of the most recent daily snapshots to keep. */
const KEEP_DAILY = 7;
/** Beyond those, the last snapshot of each of this many weeks and months. */
const KEEP_WEEKLY = 5;
const KEEP_MONTHLY = 12;
// The last snapshot of every year is kept for good.

const CHECK_INTERVAL_MS = 60 * 60_000;
const MS_PER_DAY = 86_400_000;
/** 1 January 1970 was a Thursday; counting from the Monday after it makes weeks end on a Sunday. */
const FIRST_MONDAY_MS = 4 * MS_PER_DAY;

/** A daily snapshot, which retention may remove: `perennial-2026-10-04.db`. */
const DAILY = /^perennial-(\d{4}-\d{2}-\d{2})\.db$/;
/** Any snapshot. One with a label after its date was taken for a reason and is never removed. */
const ANY = /^perennial-(\d{4}-\d{2}-\d{2}).*\.db$/;

export function dataDirectory(): string {
	return process.env.DATA_DIR || 'data';
}

export function backupDirectory(): string {
	return process.env.BACKUP_DIR || join(dataDirectory(), 'backups');
}

export interface Backup {
	name: string;
	path: string;
	/** The day it was taken, in UTC. */
	date: string;
	bytes: number;
	/** Whether retention may remove it once it is old enough. */
	daily: boolean;
}

/** What a snapshot was found to hold when it was checked. */
export interface Verified {
	tasks: number;
	occurrences: number;
	/** How many schema migrations had been applied to it. */
	schema: number;
}

/**
 * Checks that the file at `path` is a sound Perennial database, and counts
 * what is in it. Throws, saying what is wrong, if it isn't.
 */
export function verify(path: string): Verified {
	if (!existsSync(path)) throw new Error(`${path} doesn’t exist.`);

	let database: DatabaseSync | undefined;
	try {
		database = new DatabaseSync(path, { readOnly: true });
		const { integrity_check: verdict } = database.prepare('PRAGMA integrity_check').get() as {
			integrity_check: string;
		};
		if (verdict !== 'ok') throw new Error(verdict);

		const count = (table: string) =>
			(database!.prepare(`SELECT count(*) AS count FROM ${table}`).get() as { count: number }).count;
		const { user_version: schema } = database.prepare('PRAGMA user_version').get() as {
			user_version: number;
		};
		return { tasks: count('tasks'), occurrences: count('occurrences'), schema };
	} catch (cause) {
		const reason = cause instanceof Error ? cause.message : String(cause);
		throw new Error(`${path} is not a usable Perennial database: ${reason}`, { cause });
	} finally {
		database?.close();
	}
}

/**
 * Writes a snapshot of `database` to `path`, replacing any file already there.
 * The snapshot is checked before it takes that name, so a file with a backup's
 * name is always one that could be restored.
 */
export function snapshot(database: DatabaseSync, path: string): Verified {
	const partial = `${path}.partial`;
	rmSync(partial, { force: true });
	try {
		database.prepare('VACUUM INTO ?').run(partial);
		const verified = verify(partial);
		renameSync(partial, path);
		return verified;
	} catch (cause) {
		rmSync(partial, { force: true });
		throw cause;
	}
}

/** Every snapshot in `directory`, most recent first. */
export function listBackups(directory = backupDirectory()): Backup[] {
	if (!statSync(directory, { throwIfNoEntry: false })?.isDirectory()) return [];

	return readdirSync(directory)
		.flatMap((name): Backup[] => {
			const date = name.match(ANY)?.[1];
			if (!date) return [];
			const path = join(directory, name);
			return [{ name, path, date, bytes: statSync(path).size, daily: DAILY.test(name) }];
		})
		.sort((a, b) => b.name.localeCompare(a.name));
}

/**
 * Which daily snapshots to keep, given the dates of all of them, most recent
 * first: the last few days, then the last one of each recent week and month,
 * then the last one of every year.
 */
export function datesToKeep(dates: string[]): Set<string> {
	const keep = new Set(dates.slice(0, KEEP_DAILY));

	const lastOfEach = (period: (date: string) => unknown, periods: number) => {
		const seen = new Set<unknown>();
		for (const date of dates) {
			const key = period(date);
			if (seen.has(key)) continue;
			if (seen.size === periods) return;
			seen.add(key);
			keep.add(date);
		}
	};
	lastOfEach((date) => Math.floor((Date.parse(date) - FIRST_MONDAY_MS) / (7 * MS_PER_DAY)), KEEP_WEEKLY);
	lastOfEach((date) => date.slice(0, 7), KEEP_MONTHLY);
	lastOfEach((date) => date.slice(0, 4), Infinity);

	return keep;
}

/** Removes the daily snapshots that retention no longer keeps, and returns their names. */
export function prune(directory = backupDirectory()): string[] {
	const daily = listBackups(directory).filter((backup) => backup.daily);
	const keep = datesToKeep(daily.map((backup) => backup.date));

	const removed = daily.filter((backup) => !keep.has(backup.date));
	for (const backup of removed) rmSync(backup.path);
	return removed.map((backup) => backup.name);
}

function utcDate(moment: Date): string {
	return moment.toISOString().slice(0, 10);
}

/** Takes today's snapshot, replacing an earlier one from the same day, then thins out old ones. */
export function backUp(database: DatabaseSync, directory = backupDirectory(), now = new Date()): Backup {
	mkdirSync(directory, { recursive: true });
	const name = `perennial-${utcDate(now)}.db`;
	const path = join(directory, name);
	snapshot(database, path);
	const backup = { name, path, date: utcDate(now), bytes: statSync(path).size, daily: true };
	prune(directory);
	return backup;
}

/**
 * Takes a snapshot that retention never removes, named for why it was taken:
 * `perennial-2026-10-04T091500Z-before-restore.db`.
 */
export function backUpLabelled(
	database: DatabaseSync,
	label: string,
	directory = backupDirectory(),
	now = new Date()
): string {
	mkdirSync(directory, { recursive: true });
	const time = now.toISOString().slice(11, 19).replaceAll(':', '');
	const path = join(directory, `perennial-${utcDate(now)}T${time}Z-${label}.db`);
	snapshot(database, path);
	return path;
}

/**
 * Replaces the database in `directory` with the snapshot at `source`. The app
 * must be stopped first: it would carry on writing to the file it has open.
 *
 * The snapshot is checked before anything is touched, and the database being
 * replaced is itself saved to `backups` first, so a restore can be undone.
 * Returns where that copy went, or `null` if there was no database to save.
 */
export function restore(
	source: string,
	directory = dataDirectory(),
	backups = backupDirectory()
): { restored: Verified; previous: string | null } {
	verify(source);

	const target = join(directory, DATABASE_FILE);
	let previous: string | null = null;
	if (existsSync(target)) {
		const current = new DatabaseSync(target);
		try {
			previous = backUpLabelled(current, 'before-restore', backups);
		} catch {
			// Too damaged to snapshot, which may be why it is being replaced. Keep it as it is.
			mkdirSync(backups, { recursive: true });
			previous = join(backups, `damaged-${Date.now()}.db`);
			copyFileSync(target, previous);
		} finally {
			current.close();
		}
	}

	mkdirSync(directory, { recursive: true });
	const incoming = `${target}.restoring`;
	copyFileSync(source, incoming);
	// Left in place, the old write-ahead log would be replayed over the restored file.
	rmSync(`${target}-wal`, { force: true });
	rmSync(`${target}-shm`, { force: true });
	renameSync(incoming, target);

	return { restored: verify(target), previous };
}

/** What Settings shows about backups. */
export interface BackupStatus {
	directory: string;
	/** The day of the most recent snapshot, or `null` if there are none yet. */
	latest: string | null;
	count: number;
	/** Why the last attempt failed, or `null` if it worked. */
	error: string | null;
}

let lastError: string | null = null;

export function backupStatus(): BackupStatus {
	const backups = listBackups();
	return {
		directory: backupDirectory(),
		latest: backups[0]?.date ?? null,
		count: backups.length,
		error: lastError
	};
}

/** Takes today's snapshot unless there already is one. Never throws; a failure is kept for Settings. */
export function backUpIfDue(database: DatabaseSync, now = new Date()): void {
	try {
		const today = utcDate(now);
		const done = listBackups().some((backup) => backup.daily && backup.date === today);
		if (!done) backUp(database, backupDirectory(), now);
		lastError = null;
	} catch (cause) {
		lastError = cause instanceof Error ? cause.message : String(cause);
		console.error(`Backup failed: ${lastError}`);
	}
}

let timer: ReturnType<typeof setInterval> | undefined;

/** Backs up now if today's snapshot is missing, and checks again every hour. */
export function startBackups(database: () => DatabaseSync): void {
	if (timer) return;
	const check = () => backUpIfDue(database());
	check();
	timer = setInterval(check, CHECK_INTERVAL_MS);
	// Don't keep the process alive just to take backups.
	timer.unref();
}
