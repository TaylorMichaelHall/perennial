import { error } from '@sveltejs/kit';
import { isDateFormat, setDateFormat, type DateFormat } from '#lib/dates.ts';
import { readSetting, writeSetting } from '#lib/server/db.ts';

const DATE_FORMAT_KEY = 'date_format';

export function getDateFormat(): DateFormat {
	const stored = readSetting(DATE_FORMAT_KEY);
	return isDateFormat(stored) ? stored : 'auto';
}

/** Saves the format, and writes reminders in it from now on. */
export function saveDateFormat(format: unknown): DateFormat {
	if (!isDateFormat(format)) error(400, 'Choose a date format.');
	writeSetting(DATE_FORMAT_KEY, format);
	setDateFormat(format);
	return format;
}
