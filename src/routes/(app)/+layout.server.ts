import { getDateFormat } from '#lib/server/preferences.ts';
import { listTasks } from '#lib/server/tasks.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = () => ({ tasks: listTasks(), dateFormat: getDateFormat() });
