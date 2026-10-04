import { listTasks } from '#lib/server/tasks.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = () => ({ tasks: listTasks() });
