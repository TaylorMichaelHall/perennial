import { backupStatus } from '#lib/server/backups.ts';
import { listApiKeys } from '#lib/server/keys.ts';
import { getNotificationSettings, getDeliveryStatuses } from '#lib/server/notifications.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => ({
	notifications: getNotificationSettings(),
	deliveries: getDeliveryStatuses(),
	apiKeys: listApiKeys(),
	backups: backupStatus()
});
