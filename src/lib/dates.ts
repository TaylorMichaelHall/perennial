/**
 * Calendar-date helpers.
 *
 * Every date in Perennial is a plain calendar day with no time or timezone,
 * stored as an ISO `YYYY-MM-DD` string. Arithmetic is done in UTC so that
 * daylight-saving changes can never shift a date by a day.
 */

export type ISODate = string;
export type RepeatUnit = 'month' | 'year';

const MS_PER_DAY = 86_400_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function toUTC(date: ISODate): number {
	const [year, month, day] = date.split('-').map(Number);
	return Date.UTC(year, month - 1, day);
}

function fromUTC(ms: number): ISODate {
	return new Date(ms).toISOString().slice(0, 10);
}

/** Whether `value` is a real calendar date in `YYYY-MM-DD` form. */
export function isISODate(value: unknown): value is ISODate {
	return typeof value === 'string' && ISO_DATE.test(value) && fromUTC(toUTC(value)) === value;
}

/** The calendar day that `moment` falls on in the local timezone. */
export function localDate(moment: Date | number): ISODate {
	const at = new Date(moment);
	return fromUTC(Date.UTC(at.getFullYear(), at.getMonth(), at.getDate()));
}

/** Today's date in the local timezone of whoever is asking. */
export function today(): ISODate {
	return localDate(Date.now());
}

/** The moment `date` ends in the local timezone, in milliseconds since the epoch. */
export function endOfLocalDay(date: ISODate): number {
	const [year, month, day] = date.split('-').map(Number);
	return new Date(year, month - 1, day + 1).getTime();
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: ISODate, to: ISODate): number {
	return Math.round((toUTC(to) - toUTC(from)) / MS_PER_DAY);
}

export function addDays(date: ISODate, days: number): ISODate {
	return fromUTC(toUTC(date) + days * MS_PER_DAY);
}

/** The day of the month, 1 to 31. */
export function dayOf(date: ISODate): number {
	return Number(date.slice(8, 10));
}

/**
 * Adds months, clamping to the last day of a shorter month (31 Jan + 1 month = 28 Feb).
 *
 * `day` is the day of the month to land on, which defaults to the one `date`
 * is on. Pass it to remember where a clamped date came from: 28 Feb aiming
 * for the 31st, plus 1 month, is 31 Mar.
 */
export function addMonths(date: ISODate, months: number, day = dayOf(date)): ISODate {
	const [year, month] = date.split('-').map(Number);
	const lastDayOfTarget = new Date(Date.UTC(year, month + months, 0)).getUTCDate();
	return fromUTC(Date.UTC(year, month - 1 + months, Math.min(day, lastDayOfTarget)));
}

export function addInterval(date: ISODate, every: number, unit: RepeatUnit, day?: number): ISODate {
	return addMonths(date, unit === 'year' ? every * 12 : every, day);
}

export function startOfMonth(date: ISODate): ISODate {
	return `${date.slice(0, 7)}-01`;
}

export function yearOf(date: ISODate): number {
	return Number(date.slice(0, 4));
}

/** Zero-based month index, matching `Date#getMonth`. */
export function monthOf(date: ISODate): number {
	return Number(date.slice(5, 7)) - 1;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
	const key = JSON.stringify(options);
	let cached = formatters.get(key);
	if (!cached) {
		cached = new Intl.DateTimeFormat(undefined, { ...options, timeZone: 'UTC' });
		formatters.set(key, cached);
	}
	return cached;
}

/** "9 Nov", or "9 Nov 2031" when the year differs from `relativeTo`. */
export function formatDate(date: ISODate, relativeTo: ISODate = today()): string {
	const sameYear = yearOf(date) === yearOf(relativeTo);
	return formatter({
		day: 'numeric',
		month: 'short',
		year: sameYear ? undefined : 'numeric'
	}).format(toUTC(date));
}

/** "Saturday, 3 October" */
export function formatLongDate(date: ISODate): string {
	return formatter({ weekday: 'long', day: 'numeric', month: 'long' }).format(toUTC(date));
}

export function formatMonth(date: ISODate, width: 'long' | 'short' | 'narrow'): string {
	return formatter({ month: width }).format(toUTC(date));
}

/** A rough, human length of time: "12 days", "5 weeks", "4 months", "9 years". */
export function formatSpan(days: number): string {
	const count = Math.abs(days);
	const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;

	if (count < 14) return plural(count, 'day');
	if (count < 70) return plural(Math.round(count / 7), 'week');
	if (count < 700) return plural(Math.round(count / 30.4375), 'month');
	return plural(Math.round(count / 365.25), 'year');
}

/** The current date and hour (0 to 23) on the clock in `timeZone`. */
export function nowIn(timeZone: string): { date: ISODate; hour: number } {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		hourCycle: 'h23'
	}).formatToParts(new Date());
	const part = (type: Intl.DateTimeFormatPartTypes) =>
		parts.find((candidate) => candidate.type === type)?.value ?? '';

	return {
		date: `${part('year')}-${part('month')}-${part('day')}`,
		hour: Number(part('hour'))
	};
}

export function isTimeZone(value: unknown): value is string {
	if (typeof value !== 'string') return false;
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: value });
		return true;
	} catch {
		return false;
	}
}
