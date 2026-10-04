import { error } from '@sveltejs/kit';
import { dayOf, isISODate, type ISODate } from '#lib/dates.ts';
import {
	MAX_NOTES_LENGTH,
	MAX_REPEAT_EVERY,
	MAX_TAG_LENGTH,
	MAX_TAGS,
	MAX_TITLE_LENGTH
} from '#lib/limits.ts';
import { db, transaction } from '#lib/server/db.ts';
import { nextWindow, parseTags, type Occurrence, type Task, type TaskFields } from '#lib/tasks.ts';

type Row = Record<string, unknown>;

function toOccurrence(row: Row): Occurrence {
	return {
		id: row.id as number,
		opens_on: row.opens_on as ISODate,
		due_on: row.due_on as ISODate,
		closed_on: row.closed_on as ISODate,
		skipped: row.skipped === 1
	};
}

function toTask(row: Row, history: Occurrence[]): Task {
	return {
		id: row.id as number,
		version: row.version as number,
		title: row.title as string,
		notes: row.notes as string,
		opens_on: row.opens_on as ISODate,
		due_on: row.due_on as ISODate,
		opens_day: row.opens_day as number,
		due_day: row.due_day as number,
		hard: row.hard === 1,
		repeat_every: row.repeat_every as number | null,
		repeat_unit: row.repeat_unit as Task['repeat_unit'],
		repeat_from: row.repeat_from as Task['repeat_from'],
		tags: JSON.parse(row.tags as string),
		done_on: row.done_on as ISODate | null,
		snoozed_until: row.snoozed_until as ISODate | null,
		history
	};
}

export function listTasks(): Task[] {
	const historyByTask = new Map<number, Occurrence[]>();
	const occurrences = db()
		.prepare('SELECT * FROM occurrences ORDER BY closed_on DESC, id DESC')
		.all();

	for (const row of occurrences) {
		const taskId = row.task_id as number;
		const history = historyByTask.get(taskId) ?? [];
		history.push(toOccurrence(row));
		historyByTask.set(taskId, history);
	}

	return db()
		.prepare('SELECT * FROM tasks ORDER BY due_on, id')
		.all()
		.map((row) => toTask(row, historyByTask.get(row.id as number) ?? []));
}

export function getTask(id: number): Task {
	const row = db().prepare('SELECT * FROM tasks WHERE id = ?').get(id);
	if (!row) error(404, 'That task no longer exists.');

	const history = db()
		.prepare('SELECT * FROM occurrences WHERE task_id = ? ORDER BY closed_on DESC, id DESC')
		.all(id)
		.map(toOccurrence);
	return toTask(row, history);
}

function isListOfStrings(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/** Validates untrusted input from the task form, rejecting it with a 400 if it is unusable. */
export function parseTaskFields(input: unknown): TaskFields {
	if (typeof input !== 'object' || input === null) error(400, 'Expected a task.');
	const body = input as Record<string, unknown>;

	const title = typeof body.title === 'string' ? body.title.trim() : '';
	if (!title) error(400, 'Give the task a name.');
	if (title.length > MAX_TITLE_LENGTH) error(400, 'That name is too long.');

	const notes = typeof body.notes === 'string' ? body.notes.trim() : '';
	if (notes.length > MAX_NOTES_LENGTH) error(400, 'Those notes are too long.');

	const listed = body.tags ?? [];
	if (!isListOfStrings(listed)) error(400, 'Send the tags as a list.');
	const tags = parseTags(listed.join(' '));
	if (tags.length > MAX_TAGS) error(400, `Use at most ${MAX_TAGS} tags.`);
	if (tags.some((tag) => tag.length > MAX_TAG_LENGTH)) error(400, 'One of those tags is too long.');

	const { opens_on, due_on } = body;
	if (!isISODate(opens_on)) error(400, 'Choose the date this can be started.');
	if (!isISODate(due_on)) error(400, 'Choose the date this is due by.');
	if (due_on < opens_on) error(400, 'The due date can’t be before the start date.');

	const fields: TaskFields = {
		title,
		notes,
		opens_on,
		due_on,
		hard: body.hard === true,
		repeat_every: null,
		repeat_unit: null,
		repeat_from: body.repeat_from === 'completion' ? 'completion' : 'schedule',
		tags
	};

	if (body.repeat_every !== null && body.repeat_every !== undefined) {
		const every = body.repeat_every;
		const unit = body.repeat_unit;
		if (!Number.isInteger(every) || (every as number) < 1 || (every as number) > MAX_REPEAT_EVERY) {
			error(400, `Repeat every 1 to ${MAX_REPEAT_EVERY} months or years.`);
		}
		if (unit !== 'month' && unit !== 'year') error(400, 'Repeat by months or years.');
		fields.repeat_every = every as number;
		fields.repeat_unit = unit;
	}

	return fields;
}

export function createTask(fields: TaskFields): Task {
	const { lastInsertRowid } = db()
		.prepare(
			`INSERT INTO tasks
			   (title, notes, opens_on, due_on, opens_day, due_day, hard, repeat_every, repeat_unit, repeat_from, tags)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.run(
			fields.title,
			fields.notes,
			fields.opens_on,
			fields.due_on,
			dayOf(fields.opens_on),
			dayOf(fields.due_on),
			fields.hard ? 1 : 0,
			fields.repeat_every,
			fields.repeat_unit,
			fields.repeat_from,
			JSON.stringify(fields.tags)
		);
	return getTask(Number(lastInsertRowid));
}

export function updateTask(id: number, fields: TaskFields): Task {
	return transaction(() => {
		const task = getTask(id);
		// A date that is left alone keeps aiming where it was; one that is moved aims for its new day.
		const opens_day = fields.opens_on === task.opens_on ? task.opens_day : dayOf(fields.opens_on);
		const due_day = fields.due_on === task.due_on ? task.due_day : dayOf(fields.due_on);

		db()
			.prepare(
				`UPDATE tasks
				 SET version = version + 1, title = ?, notes = ?, opens_on = ?, due_on = ?,
				     opens_day = ?, due_day = ?, hard = ?, repeat_every = ?, repeat_unit = ?,
				     repeat_from = ?, tags = ?
				 WHERE id = ?`
			)
			.run(
				fields.title,
				fields.notes,
				fields.opens_on,
				fields.due_on,
				opens_day,
				due_day,
				fields.hard ? 1 : 0,
				fields.repeat_every,
				fields.repeat_unit,
				fields.repeat_from,
				JSON.stringify(fields.tags),
				id
			);
		return getTask(id);
	});
}

export function deleteTask(id: number): void {
	db().prepare('DELETE FROM tasks WHERE id = ?').run(id);
}

/**
 * Closes a task's current window, either because it was done or because it is
 * being skipped. The window is filed in the task's history; a repeating task
 * then moves on to its next window and a one-off task is finished.
 */
export function closeWindow(id: number, closedOn: ISODate, skipped: boolean, expectedVersion?: number): Task {
	return transaction(() => {
		const task = getTask(id);
		checkVersion(task, expectedVersion);
		if (task.done_on) error(409, 'That task is already finished.');

		db()
			.prepare(
				`INSERT INTO occurrences (task_id, opens_on, due_on, opens_day, due_day, closed_on, skipped)
				 VALUES (?, ?, ?, ?, ?, ?, ?)`
			)
			.run(id, task.opens_on, task.due_on, task.opens_day, task.due_day, closedOn, skipped ? 1 : 0);

		const next = nextWindow(task, closedOn, skipped);
		if (next) {
			db()
				.prepare(
					`UPDATE tasks
					 SET version = version + 1, opens_on = ?, due_on = ?, opens_day = ?, due_day = ?,
					     snoozed_until = NULL
					 WHERE id = ?`
				)
				.run(next.opens_on, next.due_on, next.opens_day, next.due_day, id);
		} else {
			db()
				.prepare('UPDATE tasks SET version = version + 1, done_on = ?, snoozed_until = NULL WHERE id = ?')
				.run(closedOn, id);
		}

		return getTask(id);
	});
}

/** Sets a task aside until `until`, or wakes it again when `until` is `null`. */
export function snoozeTask(id: number, until: ISODate | null): Task {
	const { changes } = db().prepare('UPDATE tasks SET version = version + 1, snoozed_until = ? WHERE id = ?').run(until, id);
	if (changes === 0) error(404, 'That task no longer exists.');
	return getTask(id);
}

/** Undoes the most recent `closeWindow`, putting the task back in that window. */
export function reopenWindow(id: number, expectedVersion?: number): Task {
	return transaction(() => {
		const task = getTask(id);
		checkVersion(task, expectedVersion);
		// The last window to be closed, which a completion dated in the past
		// can leave further down the history than the top.
		const latest = db()
			.prepare('SELECT * FROM occurrences WHERE task_id = ? ORDER BY id DESC LIMIT 1')
			.get(id);
		if (!latest) error(409, 'There is nothing to undo for that task.');

		db()
			.prepare(
				`UPDATE tasks
				 SET version = version + 1, opens_on = ?, due_on = ?, opens_day = ?, due_day = ?,
				     done_on = NULL
				 WHERE id = ?`
			)
			.run(
				latest.opens_on,
				latest.due_on,
				latest.opens_day ?? dayOf(latest.opens_on as ISODate),
				latest.due_day ?? dayOf(latest.due_on as ISODate),
				id
			);
		db().prepare('DELETE FROM occurrences WHERE id = ?').run(latest.id);

		return getTask(id);
	});
}

function checkVersion(task: Task, expectedVersion?: number): void {
	if (expectedVersion !== undefined && task.version !== expectedVersion) {
		error(409, "This task has changed. Refresh it before trying again.");
	}
}
