/**
 * App-wide interface state: the task editor, the toast, and the task actions
 * that any view can trigger.
 */

import { refreshAll } from '$app/navigation';
import { api, messageOf } from '#lib/api.ts';
import { formatDate, today, type ISODate } from '#lib/dates.ts';
import type { Task } from '#lib/tasks.ts';

export interface Editor {
	/** The task being edited, or `null` when adding a new one. */
	task: Task | null;
	/** A name to start a new task with. */
	suggestedTitle: string;
}

export interface Toast {
	message: string;
	undo?: () => void;
}

export const ui = $state<{ editor: Editor | null; toast: Toast | null; search: string }>({
	editor: null,
	toast: null,
	/** What the agenda and the timeline are narrowed to; see `matchesSearch`. */
	search: ''
});

export function openEditor(task: Task | null = null, suggestedTitle = ''): void {
	ui.editor = { task, suggestedTitle };
}

export function closeEditor(): void {
	ui.editor = null;
}

export function showToast(message: string, undo?: () => void): void {
	ui.toast = { message, undo };
}

export function dismissToast(): void {
	ui.toast = null;
}

/**
 * Marks a task's current window done (or skips it) and offers to undo. `on` is
 * the day it happened, for a task that was done before it was ticked off.
 */
export async function closeTask(
	task: Task,
	{ skipped = false, on = today() }: { skipped?: boolean; on?: ISODate } = {}
): Promise<void> {
	try {
		const updated = await api<Task>('POST', `/api/tasks/${task.id}/close`, {
			on,
			version: task.version,
			skipped
		});
		await refreshAll();

		const outcome = skipped ? 'Skipped.' : 'Marked done.';
		const next = updated.done_on ? '' : ` Opens again ${formatDate(updated.opens_on)}.`;
		showToast(outcome + next, () => reopenTask(updated));
	} catch (error) {
		showToast(messageOf(error));
	}
}

/** Sets a task aside until `until`, or wakes it when `until` is `null`. */
export async function snoozeTask(task: Task, until: ISODate | null): Promise<void> {
	try {
		await api('POST', `/api/tasks/${task.id}/snooze`, { until });
		await refreshAll();
		if (until) {
			showToast(`Snoozed until ${formatDate(until)}.`, () => snoozeTask(task, task.snoozed_until));
		} else {
			dismissToast();
		}
	} catch (error) {
		showToast(messageOf(error));
	}
}

/** Puts a task back into the window it was most recently done or skipped in. */
export async function reopenTask(task: Task): Promise<void> {
	try {
		await api('POST', `/api/tasks/${task.id}/reopen`, { version: task.version });
		await refreshAll();
		dismissToast();
	} catch (error) {
		showToast(messageOf(error));
	}
}
