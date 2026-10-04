import { error, json } from '@sveltejs/kit';
import { messageOf } from '#lib/api.ts';
import { readJson } from '#lib/server/http.ts';
import { parseChannel, send } from '#lib/server/notifications.ts';
import type { RequestHandler } from './$types';

/** Sends a test message to a channel, which need not have been saved yet. */
export const POST: RequestHandler = async ({ request }) => {
	const channel = parseChannel((await readJson(request)).channel);
	try {
		await send(channel, [{ text: 'This is a test from Perennial. Reminders will arrive here.' }]);
	} catch (cause) {
		error(502, messageOf(cause));
	}
	return json({ ok: true });
};
