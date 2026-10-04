import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Channel, MessageLine, NotificationSettings } from '#lib/notifications.ts';
import { db } from '#lib/server/db.ts';
import {
	getNotificationSettings,
	getDeliveryStatuses,
	splitDigest,
	parseChannel,
	parseNotificationSettings,
	requestFor,
	saveNotificationSettings,
	send,
	sendDueReminders
} from '#lib/server/notifications.ts';
import { createTask } from '#lib/server/tasks.ts';
import { httpError } from '#lib/server/testing.ts';

const APP = 'https://todo.example.com';
const plain: MessageLine[] = [{ text: 'Hello' }];
const linked: MessageLine[] = [
	{ title: 'Fix <roof> & gutters', url: `${APP}/tasks/7`, text: 'is due today.' }
];

function bodyOf(init: RequestInit) {
	return JSON.parse(init.body as string);
}

describe('requestFor', () => {
	it('formats a Discord webhook', () => {
		const channel = { kind: 'discord', fields: { url: 'https://discord.com/api/webhooks/1/abc' } } as const;
		const { url, init } = requestFor(channel, plain);
		expect(url).toBe('https://discord.com/api/webhooks/1/abc?wait=true');
		expect(bodyOf(init)).toEqual({ content: 'Hello' });
		expect(bodyOf(requestFor(channel, linked).init).content).toBe(
			`[Fix <roof> & gutters](<${APP}/tasks/7>) is due today.`
		);
	});

	it('formats a Slack webhook, escaping what Slack treats as markup', () => {
		const channel = { kind: 'slack', fields: { url: 'https://hooks.slack.com/services/T/B/x' } } as const;
		expect(bodyOf(requestFor(channel, plain).init)).toEqual({ text: 'Hello' });
		expect(bodyOf(requestFor(channel, linked).init).text).toBe(
			`<${APP}/tasks/7|Fix &lt;roof&gt; &amp; gutters> is due today.`
		);
	});

	it('formats a Telegram bot message as HTML', () => {
		const channel = { kind: 'telegram', fields: { botToken: '123:abc', chatId: '42' } } as const;
		const { url, init } = requestFor(channel, linked);
		expect(url).toBe('https://api.telegram.org/bot123:abc/sendMessage');
		expect(bodyOf(init)).toMatchObject({
			chat_id: '42',
			parse_mode: 'HTML',
			text: `<a href="${APP}/tasks/7">Fix &lt;roof&gt; &amp; gutters</a> is due today.`
		});
	});

	it('sends ntfy plain text, with a token only when given', () => {
		const open = requestFor({ kind: 'ntfy', fields: { url: 'https://ntfy.sh/t', token: '' } }, plain);
		expect(open.init.body).toBe('Hello');
		expect(open.init.headers).toEqual({ title: 'Perennial' });

		const secured = requestFor(
			{ kind: 'ntfy', fields: { url: 'https://ntfy.sh/t', token: 'tk_1' } },
			plain
		);
		expect(secured.init.headers).toMatchObject({ authorization: 'Bearer tk_1' });
	});

	it('opens the task when an ntfy notification about one task is tapped, else the app', () => {
		const channel = { kind: 'ntfy', fields: { url: 'https://ntfy.sh/t', token: '' } } as const;
		const one = requestFor(channel, linked, APP);
		expect(one.init.body).toBe('Fix <roof> & gutters is due today.');
		expect(one.init.headers).toMatchObject({ click: `${APP}/tasks/7` });

		const several = requestFor(channel, [...linked, ...linked], APP);
		expect(several.init.headers).toMatchObject({ click: APP });
	});
});

describe('parseChannel', () => {
	it('keeps the fields its kind asks for, trimmed, and drops the rest', () => {
		const channel = parseChannel({
			kind: 'discord',
			fields: { url: ' https://discord.com/api/webhooks/1/abc ', colour: 'green' }
		});
		expect(channel).toEqual({
			kind: 'discord',
			fields: { url: 'https://discord.com/api/webhooks/1/abc' }
		});
	});

	it('leaves an optional field empty when it is not given', () => {
		expect(parseChannel({ kind: 'ntfy', fields: { url: 'http://ntfy.lan/t' } }).fields).toEqual({
			url: 'http://ntfy.lan/t',
			token: ''
		});
	});

	it('rejects a kind it does not know', () => {
		expect(() => parseChannel({ kind: 'email', fields: {} })).toThrow(httpError(400));
		expect(() => parseChannel({ kind: 'toString', fields: {} })).toThrow(httpError(400));
		expect(() => parseChannel(null)).toThrow(httpError(400));
	});

	it('names the field that is missing', () => {
		expect(() => parseChannel({ kind: 'telegram', fields: { botToken: '123:abc' } })).toThrow(
			httpError(400, 'Fill in the Telegram chat ID.')
		);
		expect(() => parseChannel({ kind: 'slack' })).toThrow(
			httpError(400, 'Fill in the Slack webhook URL.')
		);
	});

	it('requires an http(s) address where one is expected', () => {
		expect(() => parseChannel({ kind: 'slack', fields: { url: 'hooks.slack.com/x' } })).toThrow(
			httpError(400, /should start with https/)
		);
		expect(() => parseChannel({ kind: 'slack', fields: { url: 'javascript:alert(1)' } })).toThrow(
			httpError(400)
		);
	});

	it('rejects a value that is too long', () => {
		const url = `https://ntfy.sh/${'t'.repeat(500)}`;
		expect(() => parseChannel({ kind: 'ntfy', fields: { url } })).toThrow(
			httpError(400, /too long/)
		);
	});
});

describe('parseNotificationSettings', () => {
	const input = {
		channels: [{ kind: 'ntfy', fields: { url: 'https://ntfy.sh/t' } }],
		hour: 7,
		timeZone: 'America/Chicago',
		appUrl: 'https://todo.example.com'
	};

	it('accepts settings as the browser sends them', () => {
		expect(parseNotificationSettings(input)).toEqual({
			...input,
			channels: [{ kind: 'ntfy', fields: { url: 'https://ntfy.sh/t', token: '' } }]
		});
		expect(parseNotificationSettings({ ...input, channels: [], hour: 0 }).channels).toEqual([]);
	});

	it('limits how many places reminders are sent', () => {
		const channels = Array.from({ length: 11 }, () => input.channels[0]);
		expect(() => parseNotificationSettings({ ...input, channels })).toThrow(httpError(400));
		expect(() => parseNotificationSettings({ ...input, channels: 'ntfy' })).toThrow(httpError(400));
	});

	it('rejects a channel that is unusable', () => {
		expect(() => parseNotificationSettings({ ...input, channels: [{ kind: 'ntfy' }] })).toThrow(
			httpError(400, /ntfy topic URL/)
		);
	});

	it('requires an hour of the day', () => {
		for (const hour of [-1, 24, 7.5, '7', undefined]) {
			expect(() => parseNotificationSettings({ ...input, hour })).toThrow(httpError(400, /hour/));
		}
		expect(parseNotificationSettings({ ...input, hour: 23 }).hour).toBe(23);
	});

	it('requires a timezone that exists', () => {
		expect(() => parseNotificationSettings({ ...input, timeZone: 'Mars/Olympus' })).toThrow(
			httpError(400, /timezone/)
		);
	});

	it('requires the app address to be an origin, with no path', () => {
		for (const appUrl of ['https://todo.example.com/', 'todo.example.com', '', undefined]) {
			expect(() => parseNotificationSettings({ ...input, appUrl })).toThrow(httpError(400));
		}
		expect(parseNotificationSettings({ ...input, appUrl: 'http://nas:3000' }).appUrl).toBe(
			'http://nas:3000'
		);
	});
});

const ntfy: Channel = { kind: 'ntfy', fields: { url: 'https://ntfy.sh/t', token: '' } };
const slack: Channel = { kind: 'slack', fields: { url: 'https://hooks.slack.com/services/x' } };

describe('send', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('posts the request for the channel', async () => {
		const fetch = vi.fn(async () => new Response('ok'));
		vi.stubGlobal('fetch', fetch);
		await send(ntfy, plain, APP);

		expect(fetch).toHaveBeenCalledWith(
			'https://ntfy.sh/t',
			expect.objectContaining({ method: 'POST', body: 'Hello', signal: expect.any(AbortSignal) })
		);
	});

	it('explains when the service cannot be reached', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
		await expect(send(ntfy, plain)).rejects.toThrow('Couldn’t reach ntfy. Check the address.');
	});

	it('explains when the service refuses the message', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('no', { status: 404 })));
		await expect(send(slack, plain)).rejects.toThrow(
			'Slack refused the message (404). Check the details.'
		);
	});
});

describe('stored settings', () => {
	beforeEach(() => {
		db().exec('DELETE FROM settings;');
	});

	it('default to no channels, at nine in the morning', () => {
		expect(getNotificationSettings()).toEqual({ channels: [], hour: 9, timeZone: 'UTC', appUrl: '' });
	});

	it('are read back as they were saved', () => {
		const settings = { channels: [ntfy], hour: 18, timeZone: 'Europe/Paris', appUrl: APP };
		saveNotificationSettings(settings);
		expect(getNotificationSettings()).toEqual(settings);
	});

	it('fill in anything missing from settings saved by an older version', () => {
		saveNotificationSettings({ channels: [ntfy], hour: 18 } as unknown as NotificationSettings);
		expect(getNotificationSettings()).toMatchObject({ hour: 18, timeZone: 'UTC', appUrl: '' });
	});
});

describe('sendDueReminders', () => {
	const fetch = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => new Response('ok'));
	const at = (time: string) => vi.setSystemTime(new Date(`${time}:00Z`));
	const bodies = () => fetch.mock.calls.map(([, init]: unknown[]) => (init as RequestInit).body);

	beforeEach(() => {
		vi.useFakeTimers();
		vi.stubGlobal('fetch', fetch);
		fetch.mockClear();
		db().exec('DELETE FROM settings; DELETE FROM tasks;');

		saveNotificationSettings({ channels: [ntfy], hour: 9, timeZone: 'UTC', appUrl: APP });
		createTask({
			title: 'Renew passport',
			notes: '',
			opens_on: '2026-08-01',
			due_on: '2026-11-14',
			hard: true,
			repeat_every: null,
			repeat_unit: null,
			repeat_from: 'schedule', tags: []
		});
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('waits for the chosen hour, then sends the day’s reminders once', async () => {
		at('2026-11-14T08:59');
		await sendDueReminders();
		expect(fetch).not.toHaveBeenCalled();

		at('2026-11-14T09:00');
		await sendDueReminders();
		expect(bodies()).toEqual(['Renew passport is due today.']);

		at('2026-11-14T09:05');
		await sendDueReminders();
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it('keeps the hour by the clock in the chosen timezone', async () => {
		saveNotificationSettings({ channels: [ntfy], hour: 9, timeZone: 'Asia/Tokyo', appUrl: APP });

		// Nine in the morning on the 14th in Tokyo.
		at('2026-11-14T00:00');
		await sendDueReminders();
		expect(bodies()).toEqual(['Renew passport is due today.']);
	});

	it('sends nothing on a day with nothing to say', async () => {
		at('2026-09-10T12:00');
		await sendDueReminders();
		expect(fetch).not.toHaveBeenCalled();
	});

	it('sends nothing when there is nowhere to send it', async () => {
		saveNotificationSettings({ channels: [], hour: 9, timeZone: 'UTC', appUrl: APP });
		at('2026-11-14T12:00');
		await sendDueReminders();
		expect(fetch).not.toHaveBeenCalled();
	});

	it('catches up on a reminder that fell due while the server was off', async () => {
		at('2026-11-12T12:00');
		await sendDueReminders();
		expect(fetch).not.toHaveBeenCalled();

		at('2026-11-16T12:00');
		await sendDueReminders();
		expect(bodies()).toEqual([expect.stringMatching(/^Renew passport is 2 days overdue\./)]);
	});

	it('looks back no further than yesterday after a long time off', async () => {
		at('2026-08-15T12:00');
		await sendDueReminders();

		// The due date and the day after are both long past; the 30th is no weekly reminder.
		at('2026-11-30T12:00');
		await sendDueReminders();
		expect(fetch).not.toHaveBeenCalled();
	});

	it('retries only the failed channel after its backoff', async () => {
		const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
		saveNotificationSettings({ channels: [slack, ntfy], hour: 9, timeZone: 'UTC', appUrl: APP });
		fetch.mockResolvedValueOnce(new Response('no', { status: 500 }));

		at('2026-11-14T12:00');
		await sendDueReminders();
		expect(fetch).toHaveBeenCalledTimes(2);
		expect(logged).toHaveBeenCalledWith(expect.stringContaining('Slack refused the message (500)'));

		await sendDueReminders();
		expect(fetch).toHaveBeenCalledTimes(2);
		expect(getDeliveryStatuses()[0]).toMatchObject({ lastError: expect.stringContaining('500'), nextRetry: expect.any(Number) });
		at('2026-11-14T12:05');
		await sendDueReminders();
		expect(fetch).toHaveBeenCalledTimes(3);
		expect(fetch.mock.calls[2][0]).toBe(slack.fields.url);
		expect(getDeliveryStatuses()[0]).toMatchObject({ lastSuccess: expect.any(Number) });
		expect(getDeliveryStatuses()[0].lastError).toBeUndefined();
	});

	it('shares an in-flight delivery between overlapping checks', async () => {
		at('2026-11-14T12:00');
		await Promise.all([sendDueReminders(), sendDueReminders(), sendDueReminders()]);
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it('resumes a partially sent digest from persistent progress', async () => {
		for (let i = 0; i < 25; i++) createTask({
			title: `Task ${i} ` + 'x'.repeat(150), notes: '', opens_on: '2026-11-01', due_on: '2026-11-14',
			hard: false, repeat_every: null, repeat_unit: null, repeat_from: 'schedule', tags: []
		});
		fetch.mockResolvedValueOnce(new Response('ok')).mockResolvedValueOnce(new Response('no', { status: 500 }));
		vi.spyOn(console, 'error').mockImplementation(() => {});
		at('2026-11-14T12:00');
		await sendDueReminders();
		const firstBody = fetch.mock.calls[0][1].body;
		const failedBody = fetch.mock.calls[1][1].body;
		const row = db().prepare("SELECT value FROM settings WHERE key LIKE 'notification_delivery_%'").get();
		expect(JSON.parse(row!.value as string).pending.next).toBe(1);
		at('2026-11-15T00:00');
		vi.resetModules();
		const restarted = await import('#lib/server/notifications.ts');
		await restarted.sendDueReminders();
		expect(fetch.mock.calls[2][1].body).toBe(failedBody);
		expect(fetch.mock.calls.slice(2).some((call) => call[1].body === firstBody)).toBe(false);
		expect(getDeliveryStatuses()[0].lastError).toBeUndefined();
	});
});


describe('large digests', () => {
	it.each(['discord', 'slack', 'telegram', 'ntfy'] as const)('keeps %s requests small without losing task lines', (kind) => {
		const channel: Channel = { kind, fields: { url: ntfy.fields.url, botToken: '123:abc', chatId: '42' } };
		const lines = Array.from({ length: 100 }, (_, i) => ({ title: `Task ${i} <&> 🌱`, url: `${APP}/tasks/${i}`, text: 'is due today.' }));
		const parts = splitDigest(channel, lines, APP);
		expect(parts.length).toBeGreaterThan(1);
		expect(parts.flat()).toEqual(lines);
		for (const part of parts) {
			const { init } = requestFor(channel, part, APP);
			const rendered = kind === 'ntfy' ? init.body as string : bodyOf(init).content ?? bodyOf(init).text;
			expect(Buffer.byteLength(rendered, 'utf8')).toBeLessThanOrEqual(1900);
		}
	});

	it('splits oversized Unicode lines without breaking HTML or dropping text', () => {
		const channel: Channel = { kind: 'telegram', fields: { botToken: '123:abc', chatId: '42' } };
		const text = '🌱<&>'.repeat(1000);
		const parts = splitDigest(channel, [{ text }]);
		expect(parts.flat().map((line) => line.text).join('')).toBe(text);
		for (const part of parts) expect(Buffer.byteLength(bodyOf(requestFor(channel, part).init).text)).toBeLessThanOrEqual(1900);
	});
});
