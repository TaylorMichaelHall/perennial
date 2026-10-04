#!/usr/bin/env node
/**
 * Lists, takes, checks and restores backups of the database.
 *
 *   docker compose exec perennial node backup.mjs            list the backups
 *   docker compose exec perennial node backup.mjs now        take one now
 *   docker compose exec perennial node backup.mjs verify     check every backup can be read
 *
 * Restoring replaces the database, so stop the app first:
 *
 *   docker compose stop
 *   docker compose run --rm perennial node backup.mjs restore perennial-2026-10-04.db
 *   docker compose start
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
	backUp,
	backupDirectory,
	DATABASE_FILE,
	dataDirectory,
	listBackups,
	restore,
	verify
} from '#lib/server/backups.ts';

const [command = 'list', argument] = process.argv.slice(2);

function describe({ tasks, occurrences }) {
	return `${tasks} ${tasks === 1 ? 'task' : 'tasks'}, ${occurrences} past ${occurrences === 1 ? 'window' : 'windows'}`;
}

/** A backup may be named on its own or given as a path. */
function locate(name) {
	const inDirectory = join(backupDirectory(), name);
	return existsSync(inDirectory) ? inDirectory : name;
}

const commands = {
	list() {
		const backups = listBackups();
		if (backups.length === 0) return console.log(`No backups in ${backupDirectory()} yet.`);
		for (const backup of backups) {
			console.log(`${backup.name}  ${(backup.bytes / 1024).toFixed(0).padStart(6)} KB`);
		}
	},

	now() {
		const path = join(dataDirectory(), DATABASE_FILE);
		if (!existsSync(path)) throw new Error(`There is no database at ${path} to back up yet.`);
		const database = new DatabaseSync(path);
		try {
			const backup = backUp(database);
			console.log(`Saved ${backup.path} (${describe(verify(backup.path))}).`);
		} finally {
			database.close();
		}
	},

	verify() {
		const paths = argument ? [locate(argument)] : listBackups().map((backup) => backup.path);
		if (paths.length === 0) throw new Error(`No backups in ${backupDirectory()} to check.`);

		const failures = paths.filter((path) => {
			try {
				console.log(`ok      ${path} (${describe(verify(path))})`);
				return false;
			} catch (cause) {
				console.log(`FAILED  ${cause.message}`);
				return true;
			}
		});
		if (failures.length > 0) process.exitCode = 1;
	},

	restore() {
		if (!argument) throw new Error('Say which backup to restore. Run this with no arguments to list them.');
		const { restored, previous } = restore(locate(argument));
		console.log(`Restored ${argument} (${describe(restored)}).`);
		if (previous) console.log(`The database it replaced was saved as ${previous}.`);
		console.log('Start Perennial again to use it.');
	}
};

try {
	if (!Object.hasOwn(commands, command)) {
		throw new Error(`Unknown command “${command}”. Use list, now, verify or restore.`);
	}
	commands[command]();
} catch (cause) {
	console.error(cause.message);
	process.exitCode = 1;
}
