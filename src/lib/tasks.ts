/**
 * The task model and the rules for how a task's window moves through time.
 * Shared by the server (to advance windows) and the client (to draw them).
 */

import {
	addDays,
	addInterval,
	dayOf,
	daysBetween,
	type ISODate,
	type RepeatUnit
} from '#lib/dates.ts';

/** The span of days in which a task can be done. Both ends are inclusive. */
export interface Window {
	opens_on: ISODate;
	due_on: ISODate;
}

/** A past window that was either finished or skipped. */
export interface Occurrence extends Window {
	id: number;
	closed_on: ISODate;
	skipped: boolean;
}

/**
 * The days of the month a repeating task's window aims for.
 *
 * A window that should open or fall due on the 31st lands on the 28th in
 * February. Stepping on from that date alone would stay on the 28th for good,
 * so the day that was meant is kept alongside the window, and every later
 * window is measured against it: 31 Jan, 28 Feb, 31 Mar.
 */
export interface Anchor {
	opens_day: number;
	due_day: number;
}

export type RepeatFrom = 'schedule' | 'completion';

export interface TaskFields extends Window {
	title: string;
	notes: string;
	/** A hard deadline has real consequences when missed; a soft one is a target. */
	hard: boolean;
	repeat_every: number | null;
	repeat_unit: RepeatUnit | null;
	/**
	 * What the next window is measured from: the previous due date (`schedule`,
	 * e.g. taxes) or the day the task was actually done (`completion`, e.g.
	 * replacing a filter).
	 */
	repeat_from: RepeatFrom;
	/** Lower-case single words to group tasks by, e.g. `house` or `car`. */
	tags: string[];
}

export interface Task extends TaskFields, Anchor {
	/** Increases whenever this task changes; send it when closing or reopening. */
	version: number;
	id: number;
	/** Set once a task that doesn't repeat has been finished. */
	done_on: ISODate | null;
	/** While this date is in the future, the task is set aside and sends no reminders. */
	snoozed_until: ISODate | null;
	/** Most recent first. */
	history: Occurrence[];
}

export type Status = 'upcoming' | 'open' | 'overdue' | 'done';

export function statusOf(task: Task, today: ISODate): Status {
	if (task.done_on) return 'done';
	if (today < task.opens_on) return 'upcoming';
	if (today > task.due_on) return 'overdue';
	return 'open';
}

/** Whether the task has been set aside until a later day. */
export function isSnoozed(task: Task, today: ISODate): boolean {
	return !task.done_on && task.snoozed_until !== null && task.snoozed_until > today;
}

function repeats<T extends TaskFields>(
	task: T
): task is T & { repeat_every: number; repeat_unit: RepeatUnit } {
	return task.repeat_every !== null && task.repeat_unit !== null;
}

/** The day of the month `date` is aiming for, which is never earlier than the day it is on. */
function aim(date: ISODate, day: number | undefined): number {
	return Math.max(day ?? 0, dayOf(date));
}

/**
 * The window `steps` repeats after the task's current one, staying on schedule.
 * Measured from the current window in one stride and aimed at the anchor, so
 * that month-end clamping (31 Jan -> 28 Feb) never compounds.
 */
function windowAfter(task: Recurring, steps: number): Window {
	const every = task.repeat_every * steps;
	const opens_day = aim(task.opens_on, task.opens_day);
	const due_day = aim(task.due_on, task.due_day);
	return {
		opens_on: addInterval(task.opens_on, every, task.repeat_unit, opens_day),
		due_on: addInterval(task.due_on, every, task.repeat_unit, due_day)
	};
}

type Recurring = TaskFields & Partial<Anchor> & { repeat_every: number; repeat_unit: RepeatUnit };

/**
 * The window that follows the current one once it is closed on `closedOn`,
 * with the days of the month it aims for, or `null` if the task doesn't repeat.
 *
 * Skipping always stays on schedule: not doing something shouldn't reset
 * the clock on when it is next needed.
 */
export function nextWindow(
	task: TaskFields & Partial<Anchor>,
	closedOn: ISODate,
	skipped = false
): (Window & Anchor) | null {
	if (!repeats(task)) return null;

	if (task.repeat_from === 'completion' && !skipped) {
		// The clock restarts on the day it was done, so that day is the new anchor.
		const due_on = addInterval(closedOn, task.repeat_every, task.repeat_unit);
		const opens_on = addDays(due_on, -daysBetween(task.opens_on, task.due_on));
		return { opens_on, due_on, opens_day: dayOf(opens_on), due_day: dayOf(closedOn) };
	}

	return {
		...windowAfter(task, 1),
		opens_day: aim(task.opens_on, task.opens_day),
		due_day: aim(task.due_on, task.due_day)
	};
}

/**
 * Future windows of a repeating task, assuming each one is closed on its due
 * date. Stops at the first window that opens after `until`.
 */
export function projectWindows(task: TaskFields & Partial<Anchor>, until: ISODate): Window[] {
	const windows: Window[] = [];
	if (!repeats(task)) return windows;

	for (let step = 1; ; step++) {
		const window = windowAfter(task, step);
		if (window.opens_on > until) return windows;
		windows.push(window);
	}
}

/** "Every year", "Every 6 months", or `null` for a one-off task. */
export function repeatLabel(task: TaskFields): string | null {
	if (!repeats(task)) return null;
	const { repeat_every: every, repeat_unit: unit } = task;
	return every === 1 ? `Every ${unit}` : `Every ${every} ${unit}s`;
}

/**
 * Splits what was typed into tags: lower-case single words, without the `#`
 * they may be written with, each listed once.
 */
export function parseTags(text: string): string[] {
	const tags = text
		.split(/[\s,]+/)
		.map((tag) => tag.replace(/^#+/, '').toLowerCase())
		.filter(Boolean);
	return [...new Set(tags)];
}

/**
 * Whether a task matches a search. Every word has to be found in the task's
 * name, notes or tags, in any case; a word written as `#house` only matches
 * the tag `house`. An empty search matches everything.
 */
export function matchesSearch(task: TaskFields, query: string): boolean {
	const text = [task.title, task.notes, ...task.tags].join('\n').toLowerCase();
	return query
		.toLowerCase()
		.split(/\s+/)
		.filter(Boolean)
		.every((word) => (word.startsWith('#') ? task.tags.includes(word.slice(1)) : text.includes(word)));
}

/** Every tag in use, in alphabetical order. */
export function tagsOf(tasks: TaskFields[]): string[] {
	return [...new Set(tasks.flatMap((task) => task.tags))].sort();
}
