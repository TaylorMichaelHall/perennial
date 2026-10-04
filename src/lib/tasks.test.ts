import { describe, expect, it } from 'vitest';
import {
	isSnoozed,
	matchesSearch,
	nextWindow,
	parseTags,
	projectWindows,
	repeatLabel,
	statusOf,
	tagsOf,
	type Task
} from '#lib/tasks.ts';

function task(overrides: Partial<Task> = {}): Task {
	return {
		id: 1,
		version: 0,
		title: 'Drain the water heater',
		notes: '',
		opens_on: '2026-09-15',
		due_on: '2026-10-31',
		opens_day: 15,
		due_day: 31,
		tags: [],
		hard: false,
		repeat_every: 1,
		repeat_unit: 'year',
		repeat_from: 'schedule',
		done_on: null,
		snoozed_until: null,
		history: [],
		...overrides
	};
}

describe('statusOf', () => {
	it('is upcoming before the window opens', () => {
		expect(statusOf(task(), '2026-09-14')).toBe('upcoming');
	});

	it('is open on the first and last day of the window', () => {
		expect(statusOf(task(), '2026-09-15')).toBe('open');
		expect(statusOf(task(), '2026-10-31')).toBe('open');
	});

	it('is overdue after the due date', () => {
		expect(statusOf(task(), '2026-11-01')).toBe('overdue');
	});

	it('is done once a one-off task is finished', () => {
		expect(statusOf(task({ done_on: '2026-10-01' }), '2026-11-01')).toBe('done');
	});
});

describe('isSnoozed', () => {
	it('is set aside until the day the snooze ends', () => {
		const snoozed = task({ snoozed_until: '2026-10-10' });
		expect(isSnoozed(snoozed, '2026-10-09')).toBe(true);
		expect(isSnoozed(snoozed, '2026-10-10')).toBe(false);
	});

	it('is not snoozed when no date was picked, or once it is finished', () => {
		expect(isSnoozed(task(), '2026-10-09')).toBe(false);
		expect(isSnoozed(task({ snoozed_until: '2026-10-10', done_on: '2026-10-01' }), '2026-10-09')).toBe(
			false
		);
	});
});

describe('nextWindow', () => {
	it('is null for a task that does not repeat', () => {
		expect(nextWindow(task({ repeat_every: null, repeat_unit: null }), '2026-10-03')).toBeNull();
	});

	it('keeps to the schedule regardless of when the task was done', () => {
		expect(nextWindow(task(), '2026-11-20')).toEqual({
			opens_on: '2027-09-15',
			due_on: '2027-10-31',
			opens_day: 15,
			due_day: 31
		});
	});

	it('measures from the completion date, keeping the window the same length', () => {
		const filter = task({
			opens_on: '2026-12-01',
			due_on: '2026-12-21',
			repeat_every: 3,
			repeat_unit: 'month',
			repeat_from: 'completion'
		});
		expect(nextWindow(filter, '2026-12-10')).toEqual({
			opens_on: '2027-02-18',
			due_on: '2027-03-10',
			opens_day: 18,
			due_day: 10
		});
	});

	it('measures from the completion date even when the task was done late', () => {
		const filter = task({ repeat_from: 'completion' });
		expect(nextWindow(filter, '2026-11-20')).toMatchObject({
			opens_on: '2027-10-05',
			due_on: '2027-11-20'
		});
	});

	it('stays on schedule when a completion-based task is skipped', () => {
		const deck = task({ repeat_from: 'completion' });
		expect(nextWindow(deck, '2026-12-25', true)).toMatchObject({
			opens_on: '2027-09-15',
			due_on: '2027-10-31'
		});
	});

	it('aims for the day the window was meant for, not the one a short month left it on', () => {
		const february = task({
			opens_on: '2027-02-28',
			due_on: '2027-02-28',
			opens_day: 30,
			due_day: 31,
			repeat_unit: 'month'
		});
		expect(nextWindow(february, '2027-02-28')).toEqual({
			opens_on: '2027-03-30',
			due_on: '2027-03-31',
			opens_day: 30,
			due_day: 31
		});
	});

	it('aims for the 31st after a completion-based task is done on the 31st', () => {
		const filter = task({ repeat_unit: 'month', repeat_from: 'completion' });
		expect(nextWindow(filter, '2027-01-31')).toMatchObject({ due_on: '2027-02-28', due_day: 31 });
	});

	it('takes the days from the dates when it is told nothing else', () => {
		const { title, notes, hard, repeat_every, repeat_unit, repeat_from, tags } = task();
		const fields = { title, notes, hard, repeat_every, repeat_unit, repeat_from, tags };
		expect(nextWindow({ ...fields, opens_on: '2028-02-01', due_on: '2028-02-29' }, '2028-02-10')).toEqual({
			opens_on: '2029-02-01',
			due_on: '2029-02-28',
			opens_day: 1,
			due_day: 29
		});
	});
});

describe('projectWindows', () => {
	it('lists the windows that open up to the horizon', () => {
		expect(projectWindows(task(), '2028-12-31')).toEqual([
			{ opens_on: '2027-09-15', due_on: '2027-10-31' },
			{ opens_on: '2028-09-15', due_on: '2028-10-31' }
		]);
	});

	it('does not drift when a date is clamped to a shorter month', () => {
		const monthly = task({
			opens_on: '2027-01-31',
			due_on: '2027-01-31',
			opens_day: 31,
			due_day: 31,
			repeat_unit: 'month'
		});
		const [february, march] = projectWindows(monthly, '2027-03-31');
		expect(february.due_on).toBe('2027-02-28');
		expect(march.due_on).toBe('2027-03-31');
	});

	it('projects from a clamped window towards the day it aims for', () => {
		const february = task({
			opens_on: '2027-02-28',
			due_on: '2027-02-28',
			opens_day: 31,
			due_day: 31,
			repeat_unit: 'month'
		});
		expect(projectWindows(february, '2027-04-30').map((window) => window.due_on)).toEqual([
			'2027-03-31',
			'2027-04-30'
		]);
	});

	it('includes a window that opens on the horizon, and none after it', () => {
		expect(projectWindows(task(), '2027-09-15')).toHaveLength(1);
		expect(projectWindows(task(), '2027-09-14')).toEqual([]);
	});

	it('is empty for a task that does not repeat', () => {
		expect(projectWindows(task({ repeat_every: null, repeat_unit: null }), '2030-01-01')).toEqual(
			[]
		);
	});
});

describe('repeatLabel', () => {
	it('describes the interval in words', () => {
		expect(repeatLabel(task())).toBe('Every year');
		expect(repeatLabel(task({ repeat_unit: 'month' }))).toBe('Every month');
		expect(repeatLabel(task({ repeat_every: 6, repeat_unit: 'month' }))).toBe('Every 6 months');
		expect(repeatLabel(task({ repeat_every: 10 }))).toBe('Every 10 years');
		expect(repeatLabel(task({ repeat_every: null, repeat_unit: null }))).toBeNull();
	});
});

describe('parseTags', () => {
	it('splits on spaces and commas into lower-case words, each listed once', () => {
		expect(parseTags('House, car  #Garden house')).toEqual(['house', 'car', 'garden']);
		expect(parseTags('  ')).toEqual([]);
	});
});

describe('matchesSearch', () => {
	const boiler = task({ title: 'Service the boiler', notes: 'Ask for Dave', tags: ['house', 'heating'] });

	it('matches everything when nothing is typed', () => {
		expect(matchesSearch(boiler, '')).toBe(true);
		expect(matchesSearch(boiler, '  ')).toBe(true);
	});

	it('looks in the name, notes and tags, in any case', () => {
		expect(matchesSearch(boiler, 'BOIL')).toBe(true);
		expect(matchesSearch(boiler, 'dave')).toBe(true);
		expect(matchesSearch(boiler, 'heat')).toBe(true);
		expect(matchesSearch(boiler, 'passport')).toBe(false);
	});

	it('needs every word to be found', () => {
		expect(matchesSearch(boiler, 'dave boiler')).toBe(true);
		expect(matchesSearch(boiler, 'dave passport')).toBe(false);
	});

	it('matches a whole tag when the word starts with #', () => {
		expect(matchesSearch(boiler, '#house')).toBe(true);
		expect(matchesSearch(boiler, '#House service')).toBe(true);
		expect(matchesSearch(boiler, '#heat')).toBe(false);
		expect(matchesSearch(boiler, '#dave')).toBe(false);
	});
});

describe('tagsOf', () => {
	it('lists each tag in use once, in alphabetical order', () => {
		expect(tagsOf([task({ tags: ['house', 'car'] }), task({ tags: ['car'] }), task()])).toEqual([
			'car',
			'house'
		]);
	});
});
