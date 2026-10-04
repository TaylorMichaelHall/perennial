import { json } from '@sveltejs/kit';
import { readJson } from '#lib/server/http.ts';
import {
	getDeliveryStatuses,
	parseNotificationSettings,
	saveNotificationSettings,
	sendDueReminders
} from '#lib/server/notifications.ts';
import type { RequestHandler } from './$types';

export const PUT: RequestHandler = async ({ request }) => {
	const settings = parseNotificationSettings(await readJson(request));
	saveNotificationSettings(settings);
	// Today's reminders may now be due; send them without holding up the reply.
	sendDueReminders().catch((cause) => console.error(cause));
	return json(settings);
};

export const GET: RequestHandler = () => json(getDeliveryStatuses());
