/**
 * Exporting tasks to a file and importing them from one.
 *
 * The file is meant to outlive the app version that wrote it, so it carries a
 * `version`. Whenever the shape changes, bump `EXPORT_VERSION` and add an entry
 * to `UPGRADES` that rewrites the previous shape into the new one; files from
 * every older version are then still accepted. Never edit an upgrade that has
 * shipped.
 *
 * Only tasks and their history are exported. The password, API keys and
 * notification destinations hold secrets and belong to one installation.
 */

import { error, isHttpError } from '@sveltejs/kit';
import { addMonths, dayOf, isISODate, type ISODate } from '#lib/dates.ts';
import { db, transaction } from '#lib/server/db.ts';
import { listTasks, parseTaskFields } from '#lib/server/tasks.ts';
import type { Occurrence, Task } from '#lib/tasks.ts';

export const EXPORT_FORMAT = 'perennial';
export const EXPORT_VERSION = 2;

type Json = Record<string, unknown>;

/**
 * `UPGRADES[n - 1]` turns a version `n` file into a version `n + 1` one, so
 * the list is always one shorter than `EXPORT_VERSION`.
 */
const UPGRADES: ((file: Json) => Json)[] = [
	// Version 2 added `tags`, `opens_day` and `due_day`. A task without them
	// has no tags and aims for the days its dates are on, as it does when read.
	(file) => file
];

/** A window as it is written to a file. Ids belong to one database, so they stay out. */
export type ExportedOccurrence = Omit<Occurrence, 'id'>;

export type ExportedTask = Omit<Task, 'id' | 'version' | 'history'> & { history: ExportedOccurrence[] };

export interface Export {
	format: typeof EXPORT_FORMAT;
	version: number;
	/** When the file was written, as an ISO timestamp. For the reader's benefit; nothing relies on it. */
	exported_at: string;
	tasks: ExportedTask[];
}

export function exportData(now = new Date()): Export {
	return {
		format: EXPORT_FORMAT,
		version: EXPORT_VERSION,
		exported_at: now.toISOString(),
		tasks: listTasks().map(withoutIds)
	};
}

function withoutIds(task: Task): ExportedTask {
	const exported: Partial<Task> = { ...task };
	delete exported.id;
	delete exported.version;
	return {
		...(exported as Omit<Task, 'id' | 'version' | 'history'>),
		history: task.history.map((past) => ({
			opens_on: past.opens_on,
			due_on: past.due_on,
			closed_on: past.closed_on,
			skipped: past.skipped
		}))
	};
}

/** Rejects `input` with a 400 unless it is one of our files, bringing an older one up to date. */
export function parseExport(input: unknown): Export {
	if (typeof input !== 'object' || input === null || (input as Json).format !== EXPORT_FORMAT) {
		error(400, 'That isn’t a Perennial export.');
	}
	let file = input as Json;

	const { version } = file;
	if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
		error(400, 'That export has no version, so it can’t be read safely.');
	}
	if (version > EXPORT_VERSION) {
		error(
			400,
			`That export was made by a newer version of Perennial (format ${version}; this one reads up to ${EXPORT_VERSION}). Update Perennial and try again.`
		);
	}
	for (let from = version; from < EXPORT_VERSION; from++) file = UPGRADES[from - 1](file);

	if (!Array.isArray(file.tasks)) error(400, 'That export has no list of tasks.');
	return {
		format: EXPORT_FORMAT,
		version: EXPORT_VERSION,
		exported_at: typeof file.exported_at === 'string' ? file.exported_at : '',
		tasks: file.tasks.map((task, index) => inTask(index + 1, () => parseTask(task)))
	};
}

/** Prefixes a rejection with which task it was about, so a long file is easy to fix. */
function inTask<T>(position: number, work: () => T): T {
	try {
		return work();
	} catch (cause) {
		if (isHttpError(cause)) error(cause.status, `Task ${position}: ${cause.body.message}`);
		throw cause;
	}
}

function optionalDate(value: unknown, what: string): ISODate | null {
	if (value === null || value === undefined) return null;
	if (!isISODate(value)) error(400, `${what} isn’t a date.`);
	return value;
}

/** The day of the month `date` aims for, which has to be one that lands on `date` in its month. */
function anchorDay(value: unknown, date: ISODate, name: string): number {
	if (value === null || value === undefined) return dayOf(date);
	const day = Number.isInteger(value) ? (value as number) : 0;
	if (day < 1 || day > 31 || addMonths(date, 0, day) !== date) {
		error(400, `${name} doesn’t match its date.`);
	}
	return day;
}

function parseTask(input: unknown): ExportedTask {
	const fields = parseTaskFields(input);
	const body = input as Json;

	const history = body.history ?? [];
	if (!Array.isArray(history)) error(400, 'The history should be a list.');

	return {
		...fields,
		opens_day: anchorDay(body.opens_day, fields.opens_on, 'opens_day'),
		due_day: anchorDay(body.due_day, fields.due_on, 'due_day'),
		done_on: optionalDate(body.done_on, 'The finished date'),
		snoozed_until: optionalDate(body.snoozed_until, 'The snooze date'),
		history: history.map(parseOccurrence)
	};
}

function parseOccurrence(input: unknown): ExportedOccurrence {
	if (typeof input !== 'object' || input === null) error(400, 'Expected a past window.');
	const { opens_on, due_on, closed_on, skipped } = input as Json;

	if (!isISODate(opens_on) || !isISODate(due_on) || !isISODate(closed_on)) {
		error(400, 'A past window has a date that isn’t a date.');
	}
	if (due_on < opens_on) error(400, 'A past window is due before it opens.');
	return { opens_on, due_on, closed_on, skipped: skipped === true };
}

/**
 * Adds the tasks to the ones already here, all or nothing. Nothing is
 * replaced, so importing the same file twice gives two of everything.
 */
export function importTasks(tasks: ExportedTask[]): number {
	return transaction(() => {
		const insertTask = db().prepare(
			`INSERT INTO tasks
			   (title, notes, opens_on, due_on, opens_day, due_day, hard, repeat_every, repeat_unit,
			    repeat_from, tags, done_on, snoozed_until)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		);
		const insertOccurrence = db().prepare(
			'INSERT INTO occurrences (task_id, opens_on, due_on, closed_on, skipped) VALUES (?, ?, ?, ?, ?)'
		);

		for (const task of tasks) {
			const { lastInsertRowid } = insertTask.run(
				task.title,
				task.notes,
				task.opens_on,
				task.due_on,
				task.opens_day,
				task.due_day,
				task.hard ? 1 : 0,
				task.repeat_every,
				task.repeat_unit,
				task.repeat_from,
				JSON.stringify(task.tags),
				task.done_on,
				task.snoozed_until
			);
			// The file lists the most recent first; store the oldest first, as it happened.
			for (const past of [...task.history].reverse()) {
				insertOccurrence.run(
					lastInsertRowid,
					past.opens_on,
					past.due_on,
					past.closed_on,
					past.skipped ? 1 : 0
				);
			}
		}
		return tasks.length;
	});
}
