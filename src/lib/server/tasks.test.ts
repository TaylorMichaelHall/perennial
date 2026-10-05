import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '#lib/server/db.ts';
import {
	closeWindow,
	createTask,
	deleteTask,
	getTask,
	listTasks,
	parseTaskFields,
	reopenWindow,
	snoozeTask,
	updateTask
} from '#lib/server/tasks.ts';
import { httpError } from '#lib/server/testing.ts';
import { projectWindows, type TaskFields } from '#lib/tasks.ts';

function fields(overrides: Partial<TaskFields> = {}): TaskFields {
	return {
		title: 'Service the boiler',
		notes: '',
		opens_on: '2026-09-01',
		due_on: '2026-10-31',
		hard: false,
		repeat_every: 1,
		repeat_unit: 'year',
		repeat_from: 'schedule',
		tags: [],
		...overrides
	};
}

const oneOff = { repeat_every: null, repeat_unit: null };

beforeEach(() => {
	db().exec('DELETE FROM tasks;');
});

describe('parseTaskFields', () => {
	const input = { title: 'Renew passport', opens_on: '2026-08-01', due_on: '2026-11-14' };

	it('fills in the defaults for a task with only a name and dates', () => {
		expect(parseTaskFields(input)).toEqual({
			title: 'Renew passport',
			notes: '',
			opens_on: '2026-08-01',
			due_on: '2026-11-14',
			hard: false,
			repeat_every: null,
			repeat_unit: null,
			repeat_from: 'schedule',
			tags: []
		});
	});

	it('tidies tags into lower-case single words, each listed once', () => {
		const parsed = parseTaskFields({ ...input, tags: ['House', '#car', 'house', 'two words', ' '] });
		expect(parsed.tags).toEqual(['house', 'car', 'two', 'words']);
	});

	it('rejects tags that are not a list of strings, or too many, or too long', () => {
		expect(() => parseTaskFields({ ...input, tags: 'house' })).toThrow(httpError(400, /list/));
		expect(() => parseTaskFields({ ...input, tags: [1] })).toThrow(httpError(400, /list/));
		const many = Array.from({ length: 11 }, (_, index) => `tag${index}`);
		expect(() => parseTaskFields({ ...input, tags: many })).toThrow(httpError(400, /at most 10/));
		expect(() => parseTaskFields({ ...input, tags: ['a'.repeat(31)] })).toThrow(
			httpError(400, /too long/)
		);
	});

	it('trims the name and notes', () => {
		const parsed = parseTaskFields({ ...input, title: '  Renew passport ', notes: ' Form DS-82\n' });
		expect(parsed.title).toBe('Renew passport');
		expect(parsed.notes).toBe('Form DS-82');
	});

	it('keeps a repeat, a hard deadline and what the repeat is measured from', () => {
		const parsed = parseTaskFields({
			...input,
			hard: true,
			repeat_every: 6,
			repeat_unit: 'month',
			repeat_from: 'completion'
		});
		expect(parsed).toMatchObject({
			hard: true,
			repeat_every: 6,
			repeat_unit: 'month',
			repeat_from: 'completion'
		});
	});

	it('allows a window of a single day', () => {
		expect(parseTaskFields({ ...input, opens_on: '2026-11-14' }).opens_on).toBe('2026-11-14');
	});

	it('rejects anything that is not an object', () => {
		expect(() => parseTaskFields(null)).toThrow(httpError(400));
		expect(() => parseTaskFields('Renew passport')).toThrow(httpError(400));
	});

	it('requires a name of a sensible length', () => {
		expect(() => parseTaskFields({ ...input, title: '   ' })).toThrow(httpError(400, /name/));
		expect(() => parseTaskFields({ ...input, title: 42 })).toThrow(httpError(400, /name/));
		expect(() => parseTaskFields({ ...input, title: 'a'.repeat(201) })).toThrow(
			httpError(400, /too long/)
		);
		expect(parseTaskFields({ ...input, title: 'a'.repeat(200) }).title).toHaveLength(200);
	});

	it('rejects notes that are too long', () => {
		expect(() => parseTaskFields({ ...input, notes: 'a'.repeat(5001) })).toThrow(
			httpError(400, /notes/)
		);
	});

	it('requires real dates, with the due date no earlier than the start', () => {
		expect(() => parseTaskFields({ ...input, opens_on: '2026-02-30' })).toThrow(
			httpError(400, /started/)
		);
		expect(() => parseTaskFields({ ...input, due_on: undefined })).toThrow(httpError(400, /due/));
		expect(() => parseTaskFields({ ...input, due_on: '2026-07-31' })).toThrow(
			httpError(400, /before the start/)
		);
	});

	it('rejects a repeat that is out of range or has no unit', () => {
		for (const repeat_every of [0, 101, 1.5, '2']) {
			expect(() => parseTaskFields({ ...input, repeat_every, repeat_unit: 'year' })).toThrow(
				httpError(400, /Repeat every/)
			);
		}
		expect(() => parseTaskFields({ ...input, repeat_every: 2, repeat_unit: 'week' })).toThrow(
			httpError(400, /months or years/)
		);
	});

	it('ignores a unit when there is no repeat', () => {
		const parsed = parseTaskFields({ ...input, repeat_every: null, repeat_unit: 'year' });
		expect(parsed.repeat_unit).toBeNull();
	});
});

describe('storing tasks', () => {
	it('creates a task that is open, with no history', () => {
		const task = createTask(fields({ hard: true, notes: 'Book early' }));
		expect(task).toEqual({
			...fields({ hard: true, notes: 'Book early' }),
			opens_day: 1,
			due_day: 31,
			id: task.id,
			version: 0,
			done_on: null,
			snoozed_until: null,
			history: []
		});
		expect(getTask(task.id)).toEqual(task);
	});

	it('lists tasks by due date, soonest first', () => {
		createTask(fields({ title: 'Later', due_on: '2027-01-31' }));
		createTask(fields({ title: 'Sooner', due_on: '2026-09-30' }));
		expect(listTasks().map((task) => task.title)).toEqual(['Sooner', 'Later']);
	});

	it('updates a task without disturbing its history', () => {
		const { id } = createTask(fields());
		closeWindow(id, '2026-10-01', false);

		const updated = updateTask(id, fields({ title: 'Service the furnace', hard: true }));
		expect(updated).toMatchObject({ title: 'Service the furnace', hard: true });
		expect(updated.history).toHaveLength(1);
	});

	it('keeps tags, and replaces them when the task is updated', () => {
		const { id } = createTask(fields({ tags: ['house', 'heating'] }));
		expect(getTask(id).tags).toEqual(['house', 'heating']);
		expect(updateTask(id, fields({ tags: ['house'] })).tags).toEqual(['house']);
	});

	it('deletes a task along with its history', () => {
		const { id } = createTask(fields());
		closeWindow(id, '2026-10-01', false);
		deleteTask(id);

		expect(listTasks()).toEqual([]);
		expect(db().prepare('SELECT * FROM occurrences').all()).toEqual([]);
	});

	it('answers 404 for a task that does not exist', () => {
		expect(() => getTask(999)).toThrow(httpError(404));
		expect(() => updateTask(999, fields())).toThrow(httpError(404));
		expect(() => snoozeTask(999, '2026-10-01')).toThrow(httpError(404));
		expect(() => closeWindow(999, '2026-10-01', false)).toThrow(httpError(404));
		expect(() => reopenWindow(999)).toThrow(httpError(404));
	});
});

describe('closeWindow', () => {
	it('stores completion notes and removes them when undone', () => {
		const { id } = createTask(fields());
		const completed = closeWindow(id, '2026-10-12', false, undefined, '  Replaced the washers on the hose  ');
		expect(completed.history[0].note).toBe('Replaced the washers on the hose');
		expect(reopenWindow(id).history).toEqual([]);
	});

	it('rejects invalid notes without completing the task', () => {
		const { id } = createTask(fields());
		for (const note of [null, 42, 'x'.repeat(5001)]) {
			expect(() => closeWindow(id, '2026-10-12', false, undefined, note)).toThrow(httpError(400));
		}
		expect(getTask(id).history).toEqual([]);
	});

	it('moves a repeating task on to its next window and files the old one', () => {
		const { id } = createTask(fields());
		const task = closeWindow(id, '2026-10-12', false);

		expect(task).toMatchObject({ opens_on: '2027-09-01', due_on: '2027-10-31', done_on: null });
		expect(task.history).toEqual([
			{
				id: task.history[0].id,
				opens_on: '2026-09-01',
				due_on: '2026-10-31',
				closed_on: '2026-10-12',
				note: '',
				skipped: false
			}
		]);
	});

	it('finishes a task that does not repeat', () => {
		const { id } = createTask(fields(oneOff));
		const task = closeWindow(id, '2026-10-12', false);

		expect(task).toMatchObject({ opens_on: '2026-09-01', due_on: '2026-10-31', done_on: '2026-10-12' });
		expect(task.history).toHaveLength(1);
	});

	it('refuses to close a task that is already finished, leaving it as it was', () => {
		const { id } = createTask(fields(oneOff));
		const finished = closeWindow(id, '2026-10-12', false);

		expect(() => closeWindow(id, '2026-10-13', false)).toThrow(httpError(409));
		expect(getTask(id)).toEqual(finished);
	});

	it('records a skip, and keeps a completion-based task on its schedule', () => {
		const { id } = createTask(fields({ repeat_from: 'completion' }));
		const task = closeWindow(id, '2026-12-25', true);

		expect(task).toMatchObject({ opens_on: '2027-09-01', due_on: '2027-10-31' });
		expect(task.history[0].skipped).toBe(true);
	});

	it('measures the next window of a completion-based task from the day it was done', () => {
		const { id } = createTask(fields({ repeat_from: 'completion' }));
		const task = closeWindow(id, '2026-09-10', false);
		expect(task).toMatchObject({ opens_on: '2027-07-12', due_on: '2027-09-10' });
	});

	it('files a completion dated in the past, and measures the next window from it', () => {
		const { id } = createTask(fields({ repeat_from: 'completion', repeat_every: 3, repeat_unit: 'month' }));
		const task = closeWindow(id, '2026-08-20', false);
		expect(task.due_on).toBe('2026-11-20');
		expect(task.history[0].closed_on).toBe('2026-08-20');
	});

	it('wakes a snoozed task', () => {
		const { id } = createTask(fields());
		snoozeTask(id, '2026-10-20');
		expect(closeWindow(id, '2026-10-12', false).snoozed_until).toBeNull();
	});

	it('lists history with the most recent first', () => {
		const { id } = createTask(fields());
		closeWindow(id, '2026-10-12', false);
		const task = closeWindow(id, '2027-10-05', true);
		expect(task.history.map((occurrence) => occurrence.closed_on)).toEqual([
			'2027-10-05',
			'2026-10-12'
		]);
		expect(listTasks()[0].history).toEqual(task.history);
	});
});

describe('reopenWindow', () => {
	it('puts a repeating task back in the window that was just closed', () => {
		const created = createTask(fields());
		closeWindow(created.id, '2026-10-12', false);
		expect(reopenWindow(created.id)).toEqual({ ...created, version: 2 });
	});

	it('reopens a finished one-off task', () => {
		const created = createTask(fields(oneOff));
		closeWindow(created.id, '2026-10-12', false);
		expect(reopenWindow(created.id)).toEqual({ ...created, version: 2 });
	});

	it('undoes one closure at a time', () => {
		const { id } = createTask(fields());
		closeWindow(id, '2026-10-12', false);
		closeWindow(id, '2027-10-05', false);

		const task = reopenWindow(id);
		expect(task).toMatchObject({ opens_on: '2027-09-01', due_on: '2027-10-31' });
		expect(task.history).toHaveLength(1);
	});

	it('undoes the window that was closed last, even when it was dated before an earlier one', () => {
		const { id } = createTask(fields());
		closeWindow(id, '2026-10-12', false);
		// Ticked off afterwards, but done earlier than the first was.
		closeWindow(id, '2026-10-01', false);

		const task = reopenWindow(id);
		expect(task).toMatchObject({ opens_on: '2027-09-01', due_on: '2027-10-31' });
		expect(task.history.map((past) => past.closed_on)).toEqual(['2026-10-12']);
	});

	it('has nothing to undo for a task that was never closed', () => {
		const { id } = createTask(fields());
		expect(() => reopenWindow(id)).toThrow(httpError(409));
	});
});

describe('the days a window aims for', () => {
	const monthly = { opens_on: '2027-01-29', due_on: '2027-01-31', repeat_unit: 'month' } as const;
	const window = ({ opens_on, due_on }: { opens_on: string; due_on: string }) => [opens_on, due_on];

	it('comes back to the end of the month after a shorter one', () => {
		const { id } = createTask(fields(monthly));
		expect(window(closeWindow(id, '2027-01-31', false))).toEqual(['2027-02-28', '2027-02-28']);
		expect(window(closeWindow(id, '2027-02-28', false))).toEqual(['2027-03-29', '2027-03-31']);
		expect(window(closeWindow(id, '2027-03-31', true))).toEqual(['2027-04-29', '2027-04-30']);
		expect(getTask(id)).toMatchObject({ opens_day: 29, due_day: 31 });
	});

	it('returns to 29 February in the next leap year', () => {
		const { id } = createTask(fields({ opens_on: '2028-02-01', due_on: '2028-02-29' }));
		expect(closeWindow(id, '2028-02-10', false).due_on).toBe('2029-02-28');
		closeWindow(id, '2029-02-10', false);
		closeWindow(id, '2030-02-10', false);
		expect(closeWindow(id, '2031-02-10', false).due_on).toBe('2032-02-29');
	});

	it('survives an edit that leaves the dates alone', () => {
		const { id } = createTask(fields(monthly));
		const february = closeWindow(id, '2027-01-31', false);
		updateTask(id, fields({ ...monthly, ...february, title: 'Renamed' }));
		expect(closeWindow(id, '2027-02-28', false).due_on).toBe('2027-03-31');
	});

	it('follows a date that is moved', () => {
		const { id } = createTask(fields(monthly));
		closeWindow(id, '2027-01-31', false);
		const moved = updateTask(id, fields({ ...monthly, opens_on: '2027-02-20', due_on: '2027-02-27' }));
		expect(moved).toMatchObject({ opens_day: 20, due_day: 27 });
		expect(window(closeWindow(id, '2027-02-27', false))).toEqual(['2027-03-20', '2027-03-27']);
	});

	it('is put back by undoing, as it was before the window was closed', () => {
		const { id } = createTask(fields(monthly));
		const february = closeWindow(id, '2027-01-31', false);
		closeWindow(id, '2027-02-28', false);
		expect(reopenWindow(id)).toEqual({ ...february, version: february.version + 2 });
	});

	it('restarts from the day a completion-based task was done, and is put back by undoing', () => {
		const { id } = createTask(fields({ ...monthly, repeat_from: 'completion' }));
		const february = closeWindow(id, '2027-01-31', true);
		expect(february).toMatchObject({ due_on: '2027-02-28', due_day: 31 });

		const done = closeWindow(id, '2027-02-10', false);
		expect(done).toMatchObject({ opens_on: '2027-03-10', due_on: '2027-03-10', due_day: 10 });
		expect(reopenWindow(id)).toMatchObject({ due_on: '2027-02-28', opens_day: 29, due_day: 31 });
	});

	it('agrees with the windows the timeline projects', () => {
		const { id } = createTask(fields(monthly));
		const projected = projectWindows(getTask(id), '2027-12-31');

		for (const expected of projected) {
			const task = getTask(id);
			expect(window(closeWindow(id, task.due_on, false))).toEqual(window(expected));
			// However far along, the rest of the projection is unchanged.
			expect(projectWindows(getTask(id), '2027-12-31')).toEqual(
				projected.slice(projected.indexOf(expected) + 1)
			);
		}
	});
});

describe('snoozeTask', () => {
	it('sets a task aside, and wakes it again', () => {
		const { id } = createTask(fields());
		expect(snoozeTask(id, '2026-10-20').snoozed_until).toBe('2026-10-20');
		expect(snoozeTask(id, null).snoozed_until).toBeNull();
	});
});


describe('stale completion and undo protection', () => {
	it('rejects duplicate completion without advancing another window', () => {
		const original = createTask(fields());
		const completed = closeWindow(original.id, '2026-10-12', false, original.version);
		expect(() => closeWindow(original.id, '2026-10-12', false, original.version)).toThrow(httpError(409));
		expect(getTask(original.id)).toEqual(completed);
	});

	it('rejects a stale skip after editing a task', () => {
		const original = createTask(fields());
		const edited = updateTask(original.id, fields({ title: 'Changed' }));
		expect(() => closeWindow(original.id, '2026-10-12', true, original.version)).toThrow(httpError(409));
		expect(getTask(original.id)).toEqual(edited);
	});

	it('rejects duplicate undo and old completion tokens after an undo', () => {
		const original = createTask(fields());
		const completed = closeWindow(original.id, '2026-10-12', false, original.version);
		const reopened = reopenWindow(original.id, completed.version);
		expect(() => reopenWindow(original.id, completed.version)).toThrow(httpError(409));
		expect(() => closeWindow(original.id, '2026-10-12', false, original.version)).toThrow(httpError(409));
		expect(getTask(original.id)).toEqual(reopened);
	});

	it('does not undo a later occurrence from an older toast', () => {
		const original = createTask(fields());
		const first = closeWindow(original.id, '2026-10-12', false, original.version);
		const second = closeWindow(original.id, '2027-10-12', false, first.version);
		expect(() => reopenWindow(original.id, first.version)).toThrow(httpError(409));
		expect(getTask(original.id)).toEqual(second);
	});
});
