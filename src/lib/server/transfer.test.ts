import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '#lib/server/db.ts';
import { closeWindow, createTask, listTasks, snoozeTask } from '#lib/server/tasks.ts';
import { httpError } from '#lib/server/testing.ts';
import {
	EXPORT_VERSION,
	exportData,
	importTasks,
	parseExport,
	type Export
} from '#lib/server/transfer.ts';
import type { TaskFields } from '#lib/tasks.ts';

function fields(overrides: Partial<TaskFields> = {}): TaskFields {
	return {
		title: 'Service the boiler',
		notes: 'Ask for Dave',
		opens_on: '2026-09-01',
		due_on: '2026-10-31',
		hard: true,
		repeat_every: 1,
		repeat_unit: 'year',
		repeat_from: 'schedule',
		tags: [],
		...overrides
	};
}

function file(overrides: Record<string, unknown> = {}): unknown {
	return { format: 'perennial', version: EXPORT_VERSION, tasks: [], ...overrides };
}

/** What is in the database, as the file would hold it: without the ids that only it knows. */
function storedTasks() {
	return listTasks().map((stored) => ({
		...stored,
		id: undefined,
		version: undefined,
		history: stored.history.map((past) => ({ ...past, id: undefined }))
	}));
}

const task = { title: 'Renew passport', opens_on: '2026-08-01', due_on: '2026-11-14' };

beforeEach(() => {
	db().exec('DELETE FROM tasks;');
});

describe('exportData', () => {
	it('tags the file with its format and version', () => {
		const exported = exportData(new Date('2026-10-03T12:00:00Z'));
		expect(exported).toEqual({
			format: 'perennial',
			version: EXPORT_VERSION,
			exported_at: '2026-10-03T12:00:00.000Z',
			tasks: []
		});
	});

	it('leaves out ids, which only mean something to one database', () => {
		const { id } = createTask(fields());
		closeWindow(id, '2026-10-12', false);

		const [exported] = exportData().tasks;
		expect(exported).not.toHaveProperty('id');
		expect(exported.history).toEqual([
			{ opens_on: '2026-09-01', due_on: '2026-10-31', closed_on: '2026-10-12', skipped: false, note: '' }
		]);
	});
});

describe('parseExport', () => {
	it('reads a file of every version up to the current one', () => {
		// If this fails, a version was bumped without a matching entry in UPGRADES.
		for (let version = 1; version <= EXPORT_VERSION; version++) {
			expect(() => parseExport(file({ version }))).not.toThrow();
		}
	});

	it('rejects anything that is not one of our files', () => {
		for (const input of [null, 'tasks', [], {}, { tasks: [] }, file({ format: 'todoist' })]) {
			expect(() => parseExport(input)).toThrow(httpError(400, /isn’t a Perennial export/));
		}
	});

	it('rejects a file with no usable version', () => {
		for (const version of [undefined, 0, 1.5, '1', null]) {
			expect(() => parseExport(file({ version }))).toThrow(httpError(400, /no version/));
		}
	});

	it('rejects a file from a newer version rather than guessing at it', () => {
		expect(() => parseExport(file({ version: EXPORT_VERSION + 1 }))).toThrow(
			httpError(400, /newer version/)
		);
	});

	it('rejects a file without a list of tasks', () => {
		expect(() => parseExport(file({ tasks: undefined }))).toThrow(httpError(400, /list of tasks/));
		expect(() => parseExport(file({ tasks: {} }))).toThrow(httpError(400, /list of tasks/));
	});

	it('fills in the defaults for a task with only a name and dates', () => {
		const [parsed] = parseExport(file({ tasks: [task] })).tasks;
		expect(parsed).toEqual({
			title: 'Renew passport',
			notes: '',
			opens_on: '2026-08-01',
			due_on: '2026-11-14',
			hard: false,
			repeat_every: null,
			repeat_unit: null,
			repeat_from: 'schedule',
			tags: [],
			opens_day: 1,
			due_day: 14,
			done_on: null,
			snoozed_until: null,
			history: []
		});
	});

	it('reads a version 1 file, from before tasks had tags or days to aim for', () => {
		const [parsed] = parseExport(file({ version: 1, tasks: [{ ...task, due_on: '2027-02-28' }] })).tasks;
		expect(parsed).toMatchObject({ tags: [], opens_day: 1, due_day: 28 });
	});

	it('keeps the days a window aims for, refusing ones its dates could not have come from', () => {
		const february = { ...task, due_on: '2027-02-28' };
		const [parsed] = parseExport(file({ tasks: [{ ...february, due_day: 31 }] })).tasks;
		expect(parsed.due_day).toBe(31);

		for (const due_day of [27, 32, 0, '31', 28.5]) {
			expect(() => parseExport(file({ tasks: [{ ...february, due_day }] }))).toThrow(
				httpError(400, /Task 1: due_day/)
			);
		}
		expect(() => parseExport(file({ tasks: [{ ...task, opens_day: 2 }] }))).toThrow(
			httpError(400, /opens_day/)
		);
	});

	it('says which task is wrong', () => {
		const input = file({ tasks: [task, task, { ...task, title: '' }] });
		expect(() => parseExport(input)).toThrow(httpError(400, /^Task 3: Give the task a name/));
	});

	it('rejects bad dates in a task or its history', () => {
		expect(() => parseExport(file({ tasks: [{ ...task, done_on: 'soon' }] }))).toThrow(
			httpError(400, /Task 1: .*finished date/)
		);
		expect(() => parseExport(file({ tasks: [{ ...task, snoozed_until: '2026-02-30' }] }))).toThrow(
			httpError(400, /snooze date/)
		);

		const past = { opens_on: '2025-08-01', due_on: '2025-11-14', closed_on: '2025-10-01' };
		for (const history of [
			'nope',
			[null],
			[{ ...past, closed_on: undefined }],
			[{ ...past, due_on: '2025-07-01' }]
		]) {
			expect(() => parseExport(file({ tasks: [{ ...task, history }] }))).toThrow(httpError(400));
		}
	});
});

describe('importTasks', () => {
	it('restores everything that was exported', () => {
		const first = createTask(
			fields({ opens_on: '2026-12-31', due_on: '2026-12-31', repeat_unit: 'month', tags: ['house'] })
		);
		// Two windows on, it is 28 February and still aiming for the 31st.
		closeWindow(first.id, '2026-10-12', false);
		closeWindow(first.id, '2027-10-01', true);
		const second = createTask(fields({ title: 'Renew passport', repeat_every: null, repeat_unit: null }));
		closeWindow(second.id, '2026-10-13', false);
		const third = createTask(fields({ title: 'Clean the dryer duct' }));
		snoozeTask(third.id, '2026-12-01');

		const before = storedTasks();
		// Through JSON, as a real file would travel.
		const exported = JSON.parse(JSON.stringify(exportData())) as Export;

		db().exec('DELETE FROM tasks;');
		expect(importTasks(parseExport(exported).tasks)).toBe(3);

		const after = storedTasks();
		expect(after).toEqual(before);
		expect(after.find((stored) => stored.title === first.title)).toMatchObject({
			due_on: '2027-02-28',
			due_day: 31,
			tags: ['house']
		});
	});

	it('keeps the most recent window first, so that undoing reopens the right one', () => {
		const { id } = createTask(fields());
		closeWindow(id, '2026-10-12', false);
		closeWindow(id, '2027-10-12', false);
		const exported = parseExport(JSON.parse(JSON.stringify(exportData())));

		db().exec('DELETE FROM tasks;');
		importTasks(exported.tasks);

		expect(listTasks()[0].history.map((past) => past.closed_on)).toEqual([
			'2027-10-12',
			'2026-10-12'
		]);
	});

	it('adds to the tasks already there', () => {
		createTask(fields());
		const exported = parseExport(JSON.parse(JSON.stringify(exportData())));

		importTasks(exported.tasks);
		expect(listTasks()).toHaveLength(2);
	});

	it('adds nothing if any task is refused', () => {
		const input = file({ tasks: [task, { ...task, due_on: '2026-01-01' }] });
		expect(() => importTasks(parseExport(input).tasks)).toThrow();
		expect(listTasks()).toEqual([]);
	});
});

it('preserves completion notes through export and import', () => {
	const { id } = createTask(fields());
	closeWindow(id, '2026-10-12', false, undefined, 'Replaced the washers on the hose');
	const exported = exportData();
	db().exec('DELETE FROM tasks');
	importTasks(parseExport(exported).tasks);
	expect(listTasks()[0].history[0].note).toBe('Replaced the washers on the hose');
});

it('reads version 2 history without completion notes', () => {
	const parsed = parseExport(file({ version: 2, tasks: [{ ...task, history: [{ opens_on: '2025-08-01', due_on: '2025-11-14', closed_on: '2025-10-01', skipped: false }] }] }));
	expect(parsed.tasks[0].history[0].note).toBe('');
});
