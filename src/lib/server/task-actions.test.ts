import { beforeEach, describe, expect, it } from 'vitest';
import { POST as close } from '../../routes/api/tasks/[id]/close/+server.ts';
import { POST as reopen } from '../../routes/api/tasks/[id]/reopen/+server.ts';
import { db } from '#lib/server/db.ts';
import { createTask, getTask } from '#lib/server/tasks.ts';
import { httpError } from '#lib/server/testing.ts';

function event(id: number, body: unknown): Parameters<typeof close>[0] {
	return {
		params: { id: String(id) },
		request: new Request('http://localhost/api/tasks', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		})
	} as Parameters<typeof close>[0];
}

function undoEvent(id: number, body: unknown): Parameters<typeof reopen>[0] {
	return event(id, body) as unknown as Parameters<typeof reopen>[0];
}

beforeEach(() => db().exec('DELETE FROM tasks;'));

function task() {
	return createTask({
		title: 'Service furnace', notes: '', opens_on: '2026-09-01', due_on: '2026-10-31',
		hard: false, repeat_every: 1, repeat_unit: 'year', repeat_from: 'schedule', tags: []
	});
}

describe('completion and undo API', () => {
	it.each([undefined, null, -1, 0.5, '0', Number.MAX_SAFE_INTEGER + 1])('rejects invalid version %s before changing a task', async (version) => {
		const original = task();
		await expect(close(event(original.id, { on: '2026-10-12', version }))).rejects.toEqual(httpError(400));
		await expect(reopen(undoEvent(original.id, { version }))).rejects.toEqual(httpError(400));
		expect(getTask(original.id)).toEqual(original);
	});

	it('closes and undoes once, rejecting repeated requests', async () => {
		const original = task();
		const body = { on: '2026-10-12', version: original.version };
		const response = await close(event(original.id, body));
		const completed = await response.json();
		expect(completed.version).toBe(original.version + 1);
		await expect(close(event(original.id, body))).rejects.toEqual(httpError(409));
		expect(getTask(original.id).history).toHaveLength(1);
		await reopen(undoEvent(original.id, { version: completed.version }));
		await expect(reopen(undoEvent(original.id, { version: completed.version }))).rejects.toEqual(httpError(409));
		expect(getTask(original.id).history).toHaveLength(0);
	});
});
