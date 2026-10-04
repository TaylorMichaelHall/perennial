import { describe, expect, it } from 'vitest';
import { addDays, formatDate } from '#lib/dates.ts';
import { buildDigest, type MessageLine } from '#lib/notifications.ts';
import type { Task } from '#lib/tasks.ts';

function task(overrides: Partial<Task> = {}): Task {
	return {
		id: 1,
		version: 0,
		title: 'Renew passport',
		notes: '',
		opens_on: '2026-08-01',
		due_on: '2026-11-14',
		opens_day: 1,
		due_day: 14,
		tags: [],
		hard: true,
		repeat_every: null,
		repeat_unit: null,
		repeat_from: 'schedule',
		done_on: null,
		snoozed_until: null,
		history: [],
		...overrides
	};
}

// Dates are written in the locale of whoever runs the tests.
const due = formatDate('2026-11-14', '2026-01-01');

/** The digest for a single day. */
function digestOn(day: string, tasks: Task[]): string[] {
	return sentences(buildDigest(tasks, addDays(day, -1), day));
}

function sentences(lines: MessageLine[]): string[] {
	return lines.map((line) => `${line.title} ${line.text}`);
}

describe('buildDigest', () => {
	it('announces a task on the day it opens', () => {
		expect(digestOn('2026-08-01', [task()])).toEqual([
			`Renew passport can be started. Due by ${due}.`
		]);
	});

	it('says nothing on an ordinary day inside the window', () => {
		expect(digestOn('2026-09-10', [task()])).toEqual([]);
	});

	it('warns a week before the due date', () => {
		expect(digestOn('2026-11-07', [task()])).toEqual([
			`Renew passport is due in 7 days, on ${due}.`
		]);
	});

	it('says so on the due date', () => {
		expect(digestOn('2026-11-14', [task()])).toEqual(['Renew passport is due today.']);
	});

	it('mentions an overdue task the day after, then weekly', () => {
		expect(digestOn('2026-11-15', [task()])).toHaveLength(1);
		expect(digestOn('2026-11-16', [task()])).toEqual([]);
		expect(digestOn('2026-11-28', [task()])).toEqual([
			`Renew passport is 2 weeks overdue. It was due ${due}.`
		]);
	});

	it('does not warn about a deadline before the window has opened', () => {
		const short = task({ opens_on: '2026-11-10' });
		expect(digestOn('2026-11-07', [short])).toEqual([]);
	});

	it('ignores finished tasks', () => {
		expect(digestOn('2026-11-14', [task({ done_on: '2026-10-01' })])).toEqual([]);
	});

	it('catches up on days that were missed, describing the task as it stands now', () => {
		expect(sentences(buildDigest([task()], '2026-07-30', '2026-08-03'))).toEqual([
			`Renew passport is due in 3 months, on ${due}.`
		]);
	});

	it('lists the most urgent task first', () => {
		const filter = task({ id: 2, title: 'Replace furnace filter', due_on: '2026-08-20' });
		const lines = digestOn('2026-08-01', [task(), filter]);
		expect(lines.map((line) => line.split(' can ')[0])).toEqual([
			'Replace furnace filter',
			'Renew passport'
		]);
	});

	it('stays quiet while a task is snoozed, and speaks up the day the snooze ends', () => {
		const snoozed = task({ snoozed_until: '2026-11-20' });
		expect(digestOn('2026-11-14', [snoozed])).toEqual([]);
		expect(digestOn('2026-11-15', [snoozed])).toEqual([]);
		expect(digestOn('2026-11-20', [snoozed])).toHaveLength(1);
	});

	it('links each task to its page when the app address is known', () => {
		const [line] = buildDigest([task()], '2026-07-31', '2026-08-01', 'https://todo.example.com');
		expect(line.url).toBe('https://todo.example.com/tasks/1');
		expect(buildDigest([task()], '2026-07-31', '2026-08-01')[0].url).toBeUndefined();
	});
});
