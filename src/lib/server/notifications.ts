import { createHash } from 'node:crypto';
import { error } from '@sveltejs/kit';
import { addDays, daysBetween, isTimeZone, nowIn } from '#lib/dates.ts';
import {
	buildDigest,
	CHANNEL_KINDS,
	DEFAULT_NOTIFICATION_HOUR,
	isChannelKind,
	MAX_CHANNELS,
	type Channel,
	type ChannelField,
	type MessageLine,
	type NotificationSettings,
	type DeliveryStatus
} from '#lib/notifications.ts';
import { readSetting, writeSetting } from '#lib/server/db.ts';
import { listTasks } from '#lib/server/tasks.ts';

const SETTINGS_KEY = 'notifications';
/** The last date reminders were sent for, so each day is only covered once. */
const SENT_THROUGH_KEY = 'notifications_sent_through';

const CHECK_INTERVAL_MS = 5 * 60_000;
const SEND_TIMEOUT_MS = 10_000;
const TITLE = 'Perennial';
/** After the server has been off, how far back to look for missed reminders. */
const MAX_CATCH_UP_DAYS = 7;

export function getNotificationSettings(): NotificationSettings {
	const defaults = { channels: [], hour: DEFAULT_NOTIFICATION_HOUR, timeZone: 'UTC', appUrl: '' };
	const stored = readSetting(SETTINGS_KEY);
	return stored ? { ...defaults, ...JSON.parse(stored) } : defaults;
}

export function saveNotificationSettings(settings: NotificationSettings): void {
	writeSetting(SETTINGS_KEY, JSON.stringify(settings));
}

function parseField(field: ChannelField, value: unknown, kindLabel: string): string {
	const text = typeof value === 'string' ? value.trim() : '';
	const name = `${kindLabel} ${field.label[0].toLowerCase()}${field.label.slice(1)}`;

	if (!text) {
		if (field.optional) return '';
		error(400, `Fill in the ${name}.`);
	}
	if (text.length > 500) error(400, `The ${name} is too long.`);
	if (field.type === 'url' && !/^https?:\/\//i.test(text)) {
		error(400, `The ${name} should start with https://`);
	}
	return text;
}

/** Validates an untrusted channel, rejecting it with a 400 if it is unusable. */
export function parseChannel(input: unknown): Channel {
	const { kind, fields } = (input ?? {}) as Record<string, unknown>;
	if (!isChannelKind(kind)) error(400, 'Choose where to send notifications.');

	const preset = CHANNEL_KINDS[kind];
	const values = (fields ?? {}) as Record<string, unknown>;
	const parsed: Record<string, string> = {};
	for (const field of preset.fields) {
		parsed[field.key] = parseField(field, values[field.key], preset.label);
	}
	return { kind, fields: parsed };
}

export function parseNotificationSettings(input: Record<string, unknown>): NotificationSettings {
	const { channels, hour, timeZone, appUrl } = input;
	if (!Array.isArray(channels) || channels.length > MAX_CHANNELS) {
		error(400, `Send notifications to at most ${MAX_CHANNELS} places.`);
	}
	if (!Number.isInteger(hour) || (hour as number) < 0 || (hour as number) > 23) {
		error(400, 'Choose an hour of the day.');
	}
	if (!isTimeZone(timeZone)) error(400, 'That timezone isn’t recognised.');
	if (typeof appUrl !== 'string' || !/^https?:\/\/[^/]+$/i.test(appUrl)) {
		error(400, 'Expected the address this app is reached at.');
	}

	return { channels: channels.map(parseChannel), hour: hour as number, timeZone, appUrl };
}

const escapeHtml = (text: string) =>
	text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

/**
 * How each service writes a line of text and a link. Plain text needs escaping
 * wherever the service would otherwise read it as markup.
 */
const MARKUP: Record<
	Exclude<Channel['kind'], 'ntfy'>,
	{ text: (text: string) => string; link: (title: string, url: string) => string }
> = {
	discord: {
		text: (text) => text,
		// Angle brackets stop Discord from adding a preview card for every link.
		link: (title, url) => `[${title.replaceAll(']', '\\]')}](<${url}>)`
	},
	slack: {
		text: escapeHtml,
		link: (title, url) => `<${url}|${escapeHtml(title)}>`
	},
	telegram: {
		text: escapeHtml,
		link: (title, url) => `<a href="${url.replaceAll('"', '%22')}">${escapeHtml(title)}</a>`
	}
};

function plain(line: MessageLine): string {
	return line.title ? `${line.title} ${line.text}` : line.text;
}

/** The HTTP request that delivers `lines` to a channel, in that service's format. */
export function requestFor(
	channel: Channel,
	lines: MessageLine[],
	appUrl = ''
): { url: string; init: RequestInit } {
	const { fields } = channel;

	if (channel.kind === 'ntfy') {
		// ntfy shows plain text, and opens one address when the notification is tapped.
		const [only] = lines;
		const click = (lines.length === 1 && only.url) || appUrl;
		return {
			url: fields.url,
			init: {
				method: 'POST',
				headers: {
					title: TITLE,
					...(click ? { click } : {}),
					...(fields.token ? { authorization: `Bearer ${fields.token}` } : {})
				},
				body: lines.map(plain).join('\n')
			}
		};
	}

	const markup = MARKUP[channel.kind];
	const message = lines
		.map((line) =>
			line.title && line.url
				? `${markup.link(line.title, line.url)} ${markup.text(line.text)}`
				: markup.text(plain(line))
		)
		.join('\n');

	const json = (url: string, body: unknown) => ({
		url,
		init: {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		}
	});

	switch (channel.kind) {
		case 'discord': {
			const url = new URL(fields.url);
			// Ask Discord to confirm storage, rather than returning before delivery.
			url.searchParams.set('wait', 'true');
			return json(url.toString(), { content: message });
		}
		case 'slack':
			return json(fields.url, { text: message });
		case 'telegram':
			return json(`https://api.telegram.org/bot${fields.botToken}/sendMessage`, {
				chat_id: fields.chatId,
				text: message,
				parse_mode: 'HTML',
				link_preview_options: { is_disabled: true }
			});
	}
}

/** Delivers a message to one channel, throwing an explanation if it doesn't get through. */
export async function send(channel: Channel, lines: MessageLine[], appUrl = ''): Promise<void> {
	const { label } = CHANNEL_KINDS[channel.kind];
	const { url, init } = requestFor(channel, lines, appUrl);

	let response: Response;
	try {
		response = await fetch(url, { ...init, signal: AbortSignal.timeout(SEND_TIMEOUT_MS) });
	} catch {
		throw new Error(`Couldn’t reach ${label}. Check the address.`);
	}
	if (!response.ok) {
		throw new Error(`${label} refused the message (${response.status}). Check the details.`);
	}
}

/** Split on task boundaries, measuring the rendered text, including markup and UTF-8. */
export function splitDigest(channel: Channel, lines: MessageLine[], appUrl = ''): MessageLine[][] {
	// Conservative for every supported service, including Discord's 2,000-character limit.
	const fits = (part: MessageLine[]) => {
		const { init } = requestFor(channel, part, appUrl);
		const body = channel.kind === 'ntfy' ? init.body as string :
			(JSON.parse(init.body as string).content ?? JSON.parse(init.body as string).text) as string;
		return Buffer.byteLength(body, 'utf8') <= 1900;
	};
	const parts: MessageLine[][] = [];
	let current: MessageLine[] = [];
	for (const line of lines) {
		if (fits([...current, line])) { current.push(line); continue; }
		if (current.length) parts.push(current);
		current = [];
		if (fits([line])) { current = [line]; continue; }
		// An unusually long line uses plain fragments so links/HTML are never cut in half.
		let text = '';
		for (const character of plain(line) + (line.url ? ` ${line.url}` : '')) {
			if (!fits([{ text: text + character }])) {
				parts.push([{ text }]);
				text = '';
			}
			text += character;
		}
		if (text) current = [{ text }];
	}
	if (current.length) parts.push(current);
	return parts;
}

interface Delivery extends DeliveryStatus {
	sentThrough?: string;
	pending?: { day: string; parts: MessageLine[][]; next: number; appUrl: string };
	failures: number;
}

function deliveryKey(channel: Channel): string {
	const fields = Object.entries(channel.fields).sort(([a], [b]) => a.localeCompare(b));
	return 'notification_delivery_' + createHash('sha256').update(JSON.stringify([channel.kind, fields])).digest('hex');
}

function readDelivery(channel: Channel): Delivery {
	const stored = readSetting(deliveryKey(channel));
	return stored ? JSON.parse(stored) : { failures: 0 };
}

export function getDeliveryStatuses(): DeliveryStatus[] {
	return getNotificationSettings().channels.map((channel) => {
		const state = readDelivery(channel);
		return { lastSuccess: state.lastSuccess, lastError: state.lastError, nextRetry: state.nextRetry };
	});
}

// One worker owns delivery progress, even if saving settings overlaps a timer tick.
let inFlight: Promise<void> | undefined;
export function sendDueReminders(): Promise<void> {
	if (!inFlight) inFlight = deliverDue().finally(() => { inFlight = undefined; });
	return inFlight;
}

async function deliverDue(): Promise<void> {
	const settings = getNotificationSettings();
	const { date: today, hour } = nowIn(settings.timeZone);
	const channels = [...new Map(settings.channels.map((channel) => [deliveryKey(channel), channel])).values()];
	await Promise.all(channels.map(async (channel) => {
		const key = deliveryKey(channel);
		const state = readDelivery(channel);
		if (state.nextRetry && Date.now() < state.nextRetry) return;
		if (!state.pending) {
			if (hour < settings.hour) return;
			// Carry the old global checkpoint forward when upgrading.
			const sentThrough = state.sentThrough ?? readSetting(SENT_THROUGH_KEY);
			if (sentThrough && sentThrough >= today) return;
			const caughtUp = sentThrough && daysBetween(sentThrough, today) <= MAX_CATCH_UP_DAYS;
			const since = caughtUp ? sentThrough : addDays(today, -1);
			const parts = splitDigest(channel, buildDigest(listTasks(), since, today, settings.appUrl), settings.appUrl);
			if (!parts.length) {
				state.sentThrough = today;
				writeSetting(key, JSON.stringify(state));
				return;
			}
			state.pending = { day: today, parts, next: 0, appUrl: settings.appUrl };
			writeSetting(key, JSON.stringify(state));
		}
		try {
			const pending = state.pending;
			while (pending.next < pending.parts.length) {
				await send(channel, pending.parts[pending.next], pending.appUrl);
				pending.next++;
				// Resume after the last acknowledged part, including after a restart.
				writeSetting(key, JSON.stringify(state));
			}
			state.sentThrough = pending.day;
			state.lastSuccess = Date.now();
			state.failures = 0;
			delete state.pending;
			delete state.lastError;
			delete state.nextRetry;
		} catch (cause) {
			state.failures++;
			state.lastError = cause instanceof Error ? cause.message : 'Delivery failed.';
			state.nextRetry = Date.now() + Math.min(6 * 60 * 60_000, CHECK_INTERVAL_MS * 2 ** Math.min(state.failures - 1, 7));
			console.error(`Notification failed: ${state.lastError}`);
		}
		writeSetting(key, JSON.stringify(state));
	}));
}

let timer: ReturnType<typeof setInterval> | undefined;

/** Starts checking, every few minutes, whether reminders are due. */
export function startNotifier(): void {
	clearInterval(timer);
	const check = () => sendDueReminders().catch((cause) => console.error(cause));
	timer = setInterval(check, CHECK_INTERVAL_MS);
	// Don't let the timer alone keep the process alive when it is asked to stop.
	timer.unref();
	check();
}
