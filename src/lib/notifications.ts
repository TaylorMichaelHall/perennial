/**
 * Notifications: where reminders are sent, and which tasks are worth a
 * reminder on a given day.
 */

import { addDays, daysBetween, formatDate, formatSpan, type ISODate } from '#lib/dates.ts';
import { isSnoozed, statusOf, type Task } from '#lib/tasks.ts';

export interface ChannelField {
	key: string;
	label: string;
	placeholder?: string;
	/** `url` fields must be an http(s) address. */
	type: 'url' | 'text';
	optional?: boolean;
}

/**
 * The services a reminder can be sent to. Each is a preset for a plain HTTP
 * request; `requestFor` in `server/notifications.ts` holds the matching format.
 */
export const CHANNEL_KINDS = {
	discord: {
		label: 'Discord',
		fields: [
			{
				key: 'url',
				label: 'Webhook URL',
				type: 'url',
				placeholder: 'https://discord.com/api/webhooks/…'
			}
		]
	},
	ntfy: {
		label: 'ntfy',
		fields: [
			{ key: 'url', label: 'Topic URL', type: 'url', placeholder: 'https://ntfy.sh/my-topic' },
			{ key: 'token', label: 'Access token, if the topic needs one', type: 'text', optional: true }
		]
	},
	slack: {
		label: 'Slack',
		fields: [
			{
				key: 'url',
				label: 'Webhook URL',
				type: 'url',
				placeholder: 'https://hooks.slack.com/services/…'
			}
		]
	},
	telegram: {
		label: 'Telegram',
		fields: [
			{ key: 'botToken', label: 'Bot token', type: 'text', placeholder: '123456:ABC…' },
			{ key: 'chatId', label: 'Chat ID', type: 'text', placeholder: '123456789' }
		]
	}
} as const satisfies Record<string, { label: string; fields: readonly ChannelField[] }>;

export type ChannelKind = keyof typeof CHANNEL_KINDS;

export interface Channel {
	kind: ChannelKind;
	/** Values for the kind's fields, keyed by `ChannelField.key`. */
	fields: Record<string, string>;
}

export interface NotificationSettings {
	channels: Channel[];
	/** Hour of the day (0 to 23) that reminders go out, in `timeZone`. */
	hour: number;
	/** IANA timezone name, taken from the browser that saved the settings. */
	timeZone: string;
	/**
	 * Where the app is reached, e.g. `https://todo.example.com`, also taken from
	 * the browser. Reminders link back to it; empty if not yet known.
	 */
	appUrl: string;
}

/** One line of a message. When `title` and `url` are set, the title links there. */
export interface MessageLine {
	title?: string;
	url?: string;
	text: string;
}

export const DEFAULT_NOTIFICATION_HOUR = 9;
export const MAX_CHANNELS = 10;

export function isChannelKind(value: unknown): value is ChannelKind {
	return typeof value === 'string' && Object.hasOwn(CHANNEL_KINDS, value);
}

/** How long before a due date the "running out of time" reminder is sent. */
const WARNING_DAYS = 7;
/** How often a task that stays overdue is mentioned again. */
const OVERDUE_REPEAT_DAYS = 7;

/** Whether `task` reaches a moment worth a reminder on `day`. */
function isNotable(task: Task, day: ISODate): boolean {
	if (day < task.opens_on) return false;
	if (day === task.opens_on || day === task.due_on) return true;
	if (day === addDays(task.due_on, -WARNING_DAYS)) return true;
	if (day === task.snoozed_until) return true;

	const daysOverdue = daysBetween(task.due_on, day);
	return daysOverdue === 1 || (daysOverdue > 0 && daysOverdue % OVERDUE_REPEAT_DAYS === 0);
}

/** What to say about `task` today, written to follow its title. */
function describe(task: Task, today: ISODate): string {
	const due = formatDate(task.due_on, today);

	if (statusOf(task, today) === 'overdue') {
		return `is ${formatSpan(daysBetween(task.due_on, today))} overdue. It was due ${due}.`;
	}
	if (task.due_on === today) return 'is due today.';
	if (task.opens_on === today) {
		return `can be started. ${task.hard ? 'Due by' : 'Aim for'} ${due}.`;
	}
	return `is due in ${formatSpan(daysBetween(today, task.due_on))}, on ${due}.`;
}

/**
 * One line for each task that became notable after `since`, up to and
 * including `today`, described as it stands today. Looking back over a range
 * rather than at a single day means nothing is missed if the server was off
 * when a reminder was due.
 *
 * A task is notable on the day it opens, a week before it is due, on the day
 * it is due, the day after, every week it stays overdue, and the day a snooze
 * ends. A snoozed task is left out entirely.
 *
 * With an `appUrl`, each task's title links to its page.
 */
export function buildDigest(
	tasks: Task[],
	since: ISODate,
	today: ISODate,
	appUrl = ''
): MessageLine[] {
	const days: ISODate[] = [];
	for (let day = addDays(since, 1); day <= today; day = addDays(day, 1)) days.push(day);

	return tasks
		.filter((task) => !task.done_on && !isSnoozed(task, today))
		.filter((task) => days.some((day) => isNotable(task, day)))
		.toSorted((a, b) => a.due_on.localeCompare(b.due_on))
		.map((task) => ({
			title: task.title,
			url: appUrl ? `${appUrl}/tasks/${task.id}` : undefined,
			text: describe(task, today)
		}));
}

/** Delivery metadata only; destination credentials stay out of status responses. */
export interface DeliveryStatus {
	lastSuccess?: number;
	lastError?: string;
	nextRetry?: number;
}
