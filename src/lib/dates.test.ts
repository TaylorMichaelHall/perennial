import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	addDays,
	addInterval,
	addMonths,
	dateFormat,
	dayOf,
	daysBetween,
	entryFormat,
	formatDate,
	formatFullDate,
	formatLongDate,
	formatMonth,
	formatSpan,
	isDateFormat,
	isISODate,
	isTimeZone,
	monthOf,
	nowIn,
	parseDate,
	setDateFormat,
	startOfMonth,
	today,
	yearOf
} from '#lib/dates.ts';

afterEach(() => {
	vi.useRealTimers();
});

describe('isISODate', () => {
	it('accepts real calendar dates', () => {
		expect(isISODate('2028-02-29')).toBe(true);
	});

	it('rejects impossible dates and other shapes', () => {
		expect(isISODate('2027-02-29')).toBe(false);
		expect(isISODate('2027-2-9')).toBe(false);
		expect(isISODate(20270209)).toBe(false);
	});
});

describe('date arithmetic', () => {
	it('counts days across a daylight-saving change', () => {
		expect(daysBetween('2026-03-01', '2026-04-01')).toBe(31);
		expect(daysBetween('2026-04-01', '2026-03-01')).toBe(-31);
	});

	it('adds days across a year boundary', () => {
		expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
	});

	it('clamps to the end of a shorter month', () => {
		expect(addMonths('2027-01-31', 1)).toBe('2027-02-28');
		expect(addMonths('2028-02-29', 12)).toBe('2029-02-28');
	});

	it('lands on a chosen day of the month, or as near as the month allows', () => {
		expect(addMonths('2027-02-28', 1, 31)).toBe('2027-03-31');
		expect(addMonths('2027-03-31', 1, 31)).toBe('2027-04-30');
		expect(addMonths('2029-02-28', 36, 29)).toBe('2032-02-29');
		expect(addInterval('2027-02-28', 1, 'year', 29)).toBe('2028-02-29');
		expect(dayOf('2027-03-09')).toBe(9);
	});

	it('subtracts months', () => {
		expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
	});

	it('adds intervals of years', () => {
		expect(addInterval('2026-11-14', 10, 'year')).toBe('2036-11-14');
	});

	it('adds intervals of months', () => {
		expect(addInterval('2026-11-14', 3, 'month')).toBe('2027-02-14');
	});

	it('subtracts days across a leap day', () => {
		expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
		expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2);
	});

	it('takes a date apart', () => {
		expect(startOfMonth('2026-11-14')).toBe('2026-11-01');
		expect(yearOf('2026-11-14')).toBe(2026);
		expect(monthOf('2026-01-31')).toBe(0);
		expect(monthOf('2026-12-01')).toBe(11);
	});
});

describe('today', () => {
	it('is the date on the local clock', () => {
		vi.useFakeTimers({ now: new Date(2026, 11, 31, 23, 59) });
		expect(today()).toBe('2026-12-31');
		vi.advanceTimersByTime(60_000);
		expect(today()).toBe('2027-01-01');
	});
});

describe('nowIn', () => {
	it('gives the date and hour on the clock in a timezone', () => {
		vi.useFakeTimers({ now: new Date('2026-10-03T23:30:00Z') });
		expect(nowIn('UTC')).toEqual({ date: '2026-10-03', hour: 23 });
		expect(nowIn('Asia/Tokyo')).toEqual({ date: '2026-10-04', hour: 8 });
		expect(nowIn('America/Chicago')).toEqual({ date: '2026-10-03', hour: 18 });
	});

	it('calls midnight hour 0', () => {
		vi.useFakeTimers({ now: new Date('2026-10-03T00:15:00Z') });
		expect(nowIn('UTC')).toEqual({ date: '2026-10-03', hour: 0 });
	});
});

describe('isTimeZone', () => {
	it('accepts IANA timezone names and nothing else', () => {
		expect(isTimeZone('Europe/Paris')).toBe(true);
		expect(isTimeZone('UTC')).toBe(true);
		expect(isTimeZone('Mars/Olympus')).toBe(false);
		expect(isTimeZone('')).toBe(false);
		expect(isTimeZone(undefined)).toBe(false);
	});
});

// Dates are written in the locale of whoever runs the tests, so these check
// what is mentioned rather than the exact wording.
describe('formatting', () => {
	it('leaves the year out of a date in the same year', () => {
		expect(formatDate('2026-11-09', '2026-01-01')).toMatch(/9/);
		expect(formatDate('2026-11-09', '2026-01-01')).not.toMatch(/2026/);
		expect(formatDate('2031-11-09', '2026-01-01')).toMatch(/2031/);
	});

	it('measures the year against today by default', () => {
		vi.useFakeTimers({ now: new Date(2026, 5, 15) });
		expect(formatDate('2026-11-09')).toBe(formatDate('2026-11-09', '2026-01-01'));
		expect(formatDate('2027-11-09')).toMatch(/2027/);
	});

	it('does not shift a date into the day before or after', () => {
		expect(formatLongDate('2026-10-03')).toMatch(/3/);
		expect(formatLongDate('2026-10-03')).not.toMatch(/2026/);
		expect(formatMonth('2026-01-01', 'long')).toBe(formatMonth('2026-01-31', 'long'));
		expect(formatMonth('2026-01-31', 'long')).not.toBe(formatMonth('2026-02-01', 'long'));
	});
});

describe('a chosen date format', () => {
	afterEach(() => setDateFormat('auto'));

	it('writes a date with a named month in the order asked for', () => {
		expect(formatDate('2026-11-09', '2026-01-01', 'day-month')).toBe('9 Nov');
		expect(formatDate('2031-11-09', '2026-01-01', 'day-month')).toBe('9 Nov 2031');
		expect(formatDate('2031-11-09', '2026-01-01', 'month-day')).toBe('Nov 9, 2031');
		expect(formatLongDate('2026-10-03', 'month-day')).toBe('Saturday, October 3');
	});

	it('keeps the year in a date written in figures', () => {
		expect(formatDate('2026-11-09', '2026-01-01', 'dmy')).toBe('09/11/2026');
		expect(formatDate('2026-11-09', '2026-01-01', 'mdy')).toBe('11/09/2026');
		expect(formatDate('2026-11-09', '2026-01-01', 'dmy-dots')).toBe('09.11.2026');
		expect(formatDate('2026-11-09', '2026-01-01', 'iso')).toBe('2026-11-09');
		expect(formatLongDate('2026-10-03', 'iso')).toMatch(/, 2026-10-03$/);
	});

	it('is used wherever no format is asked for, once set', () => {
		setDateFormat('iso');
		expect(dateFormat()).toBe('iso');
		expect(formatDate('2026-11-09', '2026-01-01')).toBe('2026-11-09');
		expect(formatFullDate('2026-11-09')).toBe('2026-11-09');
	});

	it('recognises its own names and nothing else', () => {
		expect(isDateFormat('dmy')).toBe(true);
		expect(isDateFormat('ymd')).toBe(false);
		expect(isDateFormat(undefined)).toBe(false);
	});

	it('is typed in figures, in the same order', () => {
		expect(entryFormat('auto')).toBeUndefined();
		expect(entryFormat('day-month')).toBe('dmy');
		expect(entryFormat('month-day')).toBe('mdy');
		expect(entryFormat('iso')).toBe('iso');
	});
});

describe('parseDate', () => {
	it('reads a date in the order of its format, with any separator', () => {
		expect(parseDate('09/11/2026', 'dmy')).toBe('2026-11-09');
		expect(parseDate('09/11/2026', 'mdy')).toBe('2026-09-11');
		expect(parseDate(' 9.11.2026 ', 'dmy-dots')).toBe('2026-11-09');
		expect(parseDate('9-11-2026', 'dmy')).toBe('2026-11-09');
		expect(parseDate('2026-11-09', 'iso')).toBe('2026-11-09');
	});

	it('refuses what is not a date', () => {
		expect(parseDate('', 'dmy')).toBeUndefined();
		expect(parseDate('09/11', 'dmy')).toBeUndefined();
		expect(parseDate('09/11/26', 'dmy')).toBeUndefined();
		expect(parseDate('31/02/2026', 'dmy')).toBeUndefined();
		expect(parseDate('13/13/2026', 'mdy')).toBeUndefined();
		expect(parseDate('2026-11-09', 'dmy')).toBeUndefined();
	});
});

describe('formatSpan', () => {
	it('picks the unit that reads most naturally', () => {
		expect(formatSpan(1)).toBe('1 day');
		expect(formatSpan(13)).toBe('13 days');
		expect(formatSpan(42)).toBe('6 weeks');
		expect(formatSpan(120)).toBe('4 months');
		expect(formatSpan(3650)).toBe('10 years');
	});

	it('changes unit at two weeks, ten weeks and about two years', () => {
		expect(formatSpan(0)).toBe('0 days');
		expect(formatSpan(14)).toBe('2 weeks');
		expect(formatSpan(69)).toBe('10 weeks');
		expect(formatSpan(70)).toBe('2 months');
		expect(formatSpan(699)).toBe('23 months');
		expect(formatSpan(700)).toBe('2 years');
	});

	it('measures a span in the past the same way', () => {
		expect(formatSpan(-1)).toBe('1 day');
		expect(formatSpan(-42)).toBe('6 weeks');
	});
});
