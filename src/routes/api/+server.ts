import { json } from '@sveltejs/kit';
import {
	MAX_NOTES_LENGTH,
	MAX_REPEAT_EVERY,
	MAX_TAG_LENGTH,
	MAX_TAGS,
	MAX_TITLE_LENGTH
} from '#lib/limits.ts';
import type { RequestHandler } from './$types';

const TASK_FIELDS = {
	title: `string, required, at most ${MAX_TITLE_LENGTH} characters`,
	notes: `string, optional, at most ${MAX_NOTES_LENGTH} characters`,
	opens_on: 'date, required: the first day the task can be done',
	due_on: 'date, required: the day the task is due by, on or after opens_on',
	hard: 'boolean, default false: true if missing the due date has real consequences',
	repeat_every: `integer 1 to ${MAX_REPEAT_EVERY} or null, default null: null for a task that happens once`,
	repeat_unit: '"month" or "year", required when repeat_every is set',
	repeat_from:
		'"schedule" or "completion", default "schedule": whether the next window is measured from the previous due date, or from the day the task was actually done',
	tags: `array of strings, default []: at most ${MAX_TAGS} single words of up to ${MAX_TAG_LENGTH} characters, stored in lower case without a leading #`
};

/**
 * Describes the API to whoever asks, without needing a key, so that a script
 * or an AI agent can learn what it can do here before it has been let in.
 */
export const GET: RequestHandler = ({ url }) => {
	const base = `${url.origin}/api`;

	return json({
		name: 'Perennial',
		description:
			'A to-do list for the long term: things that come around once a year, or once a decade. Each task has a window, from the day it can first be started (opens_on) to the day it is due (due_on). Closing a window as done or skipped files it in the task’s history; a repeating task then moves on to its next window, and a one-off task is finished.',
		base_url: base,
		authentication: {
			scheme: 'Bearer token',
			header: 'Authorization: Bearer <api key>',
			how_to_get_a_key: `The owner mints one under Settings, API keys, at ${url.origin}/settings. A key may have an expiry date.`,
			scope: 'A key can use every endpoint listed here and nothing else.'
		},
		conventions: {
			bodies: 'Requests with a body send a JSON object with Content-Type: application/json.',
			dates:
				'Every date is a calendar day as YYYY-MM-DD, with no time or timezone. The server does not know the owner’s timezone, so where an endpoint needs today’s date, send it.',
			errors:
				'A failed request has a 4xx or 5xx status and a body of {"message": "..."} saying what to fix. Send Accept: application/json.'
		},
		task: {
			id: 'integer',
			version: 'integer: changes with every task mutation; send the current value when closing or reopening',
			...TASK_FIELDS,
			opens_day:
				'integer 1 to 31, read-only: the day of the month opens_on aims for. A repeat that should open on the 31st opens on the 28th in February and the 31st again in March.',
			due_day: 'integer 1 to 31, read-only: the same for due_on',
			done_on: 'date or null: set once a task that doesn’t repeat has been finished',
			snoozed_until:
				'date or null: while this is in the future the task is set aside and sends no reminders',
			history:
				'array of past windows, most recent first, each {id, opens_on, due_on, closed_on, skipped, note}',
			status:
				'Not stored; work it out from today’s date. "done" if done_on is set, "upcoming" if today is before opens_on, "overdue" if today is after due_on, otherwise "open".'
		},
		endpoints: [
			{
				method: 'GET',
				path: '/api',
				description: 'This document. Needs no key.'
			},
			{
				method: 'GET',
				path: '/api/tasks',
				description:
					'Lists every task, finished ones included, ordered by due date. Add ?q= to search: every word must appear in the task’s title, notes or tags, and a word written as #house (%23house in a URL) only matches that tag.',
				returns: 'array of tasks'
			},
			{
				method: 'POST',
				path: '/api/tasks',
				description: 'Adds a task.',
				body: TASK_FIELDS,
				returns: 'the new task, with status 201'
			},
			{
				method: 'GET',
				path: '/api/tasks/{id}',
				description: 'Fetches one task.',
				returns: 'the task'
			},
			{
				method: 'PUT',
				path: '/api/tasks/{id}',
				description:
					'Replaces a task’s fields. Send all of them, not just the ones that change; any left out go back to their defaults.',
				body: TASK_FIELDS,
				returns: 'the updated task'
			},
			{
				method: 'DELETE',
				path: '/api/tasks/{id}',
				description: 'Deletes a task and its history. This cannot be undone.',
				returns: '{"ok": true}'
			},
			{
				method: 'POST',
				path: '/api/tasks/{id}/close',
				description:
					'Closes the task’s current window, as done or as skipped. Answers 409 if the task is already finished.',
				body: {
					version: 'integer, required: current task version; stale requests return 409',
					on: 'date, required: the day it was done or skipped. Usually today, but an earlier day is fine; a task that repeats from completion measures its next window from it.',
					skipped: 'boolean, default false: true to skip the window rather than mark it done',
					note: 'optional completion note, at most 5000 characters; stored in history'
				},
				returns: 'the updated task, now in its next window or finished'
			},
			{
				method: 'POST',
				path: '/api/tasks/{id}/reopen',
				description:
					'Undoes the most recent close, putting the task back in that window. Answers 409 if the task has no history.',
				body: { version: 'integer, required: current task version; stale requests return 409' },
				returns: 'the updated task'
			},
			{
				method: 'POST',
				path: '/api/tasks/{id}/snooze',
				description: 'Sets a task aside, with no reminders, until a date; or wakes it.',
				body: { until: 'date to snooze until, or null to wake the task now' },
				returns: 'the updated task'
			}
		],
		example: `curl -H "Authorization: Bearer $PERENNIAL_API_KEY" ${base}/tasks`
	});
};
