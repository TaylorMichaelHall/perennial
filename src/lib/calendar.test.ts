import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { calendar, startDayClock } from '#lib/calendar.svelte.ts';
import { isSnoozed, statusOf, type Task } from '#lib/tasks.ts';

let browser: EventTarget;
let documentEvents: EventTarget & { visibilityState: string };
let stop: (() => void) | undefined;

const task: Task = {
	id: 1, version: 0, title: 'Renew passport', notes: '',
	opens_on: '2026-10-04', due_on: '2026-10-04', hard: true,
	opens_day: 4, due_day: 4, tags: [],
	repeat_every: null, repeat_unit: null, repeat_from: 'schedule',
	done_on: null, snoozed_until: '2026-10-04', history: []
};

beforeEach(() => {
	vi.stubEnv('TZ', 'America/Chicago');
	vi.useFakeTimers();
	browser = new EventTarget();
	documentEvents = Object.assign(new EventTarget(), { visibilityState: 'visible' });
	vi.stubGlobal('window', browser);
	vi.stubGlobal('document', documentEvents);
});

afterEach(() => {
	stop?.();
	stop = undefined;
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
});

describe('browser calendar', () => {
	it('updates at midnight so windows open, snoozes end, and deadlines become overdue', () => {
		vi.setSystemTime(new Date(2026, 9, 3, 23, 59, 59, 999));
		stop = startDayClock();
		expect(calendar.today).toBe('2026-10-03');
		expect(statusOf(task, calendar.today)).toBe('upcoming');
		expect(isSnoozed(task, calendar.today)).toBe(true);

		vi.advanceTimersByTime(1);
		expect(calendar.today).toBe('2026-10-04');
		expect(statusOf(task, calendar.today)).toBe('open');
		expect(isSnoozed(task, calendar.today)).toBe(false);

		vi.advanceTimersByTime(24 * 60 * 60_000);
		expect(calendar.today).toBe('2026-10-05');
		expect(statusOf(task, calendar.today)).toBe('overdue');
	});

	it.each(['focus', 'pageshow', 'visibilitychange'])('catches up on %s after the browser sleeps for several days', (event) => {
		vi.setSystemTime(new Date(2026, 9, 3, 12));
		stop = startDayClock();
		// Change the clock without executing timers, as with a suspended tab.
		vi.setSystemTime(new Date(2026, 9, 8, 12));
		(event === 'visibilitychange' ? documentEvents : browser).dispatchEvent(new Event(event));
		expect(calendar.today).toBe('2026-10-08');
		expect(vi.getTimerCount()).toBe(1);
	});

	it('waits until a hidden tab is visible before handling its visibility event', () => {
		vi.setSystemTime(new Date(2026, 9, 3, 12));
		stop = startDayClock();
		vi.setSystemTime(new Date(2026, 9, 4, 12));
		documentEvents.visibilityState = 'hidden';
		documentEvents.dispatchEvent(new Event('visibilitychange'));
		expect(calendar.today).toBe('2026-10-03');
		documentEvents.visibilityState = 'visible';
		documentEvents.dispatchEvent(new Event('visibilitychange'));
		expect(calendar.today).toBe('2026-10-04');
	});

	it.each([
		{ start: '2026-03-08T00:00:00', hours: 23, next: '2026-03-09' },
		{ start: '2026-11-01T00:00:00', hours: 25, next: '2026-11-02' }
	])('follows local midnight on a $hours-hour daylight-saving day', ({ start, hours, next }) => {
		vi.setSystemTime(new Date(start));
		stop = startDayClock();
		vi.advanceTimersByTime(hours * 60 * 60_000 - 1);
		expect(calendar.today).not.toBe(next);
		vi.advanceTimersByTime(1);
		expect(calendar.today).toBe(next);
	});

	it('picks up a timezone change while the app remains open', () => {
		vi.setSystemTime(new Date('2026-10-04T02:00:00Z'));
		stop = startDayClock();
		expect(calendar.today).toBe('2026-10-03');
		vi.stubEnv('TZ', 'Asia/Tokyo');
		vi.advanceTimersByTime(60_000);
		expect(calendar.today).toBe('2026-10-04');
	});

	it('removes listeners and timers when the layout unmounts', () => {
		vi.setSystemTime(new Date(2026, 9, 3, 12));
		const cleanup = startDayClock();
		cleanup();
		vi.setSystemTime(new Date(2026, 9, 8, 12));
		browser.dispatchEvent(new Event('focus'));
		browser.dispatchEvent(new Event('pageshow'));
		documentEvents.dispatchEvent(new Event('visibilitychange'));
		expect(calendar.today).toBe('2026-10-03');
		expect(vi.getTimerCount()).toBe(0);
	});
});
