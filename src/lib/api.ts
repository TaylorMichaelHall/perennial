/** Calls the JSON API, throwing an `Error` with a message fit to show the user. */
export async function api<T = unknown>(
	method: 'GET' | 'POST' | 'PUT' | 'DELETE',
	path: string,
	body?: unknown
): Promise<T> {
	const response = await fetch(path, {
		method,
		headers: { 'content-type': 'application/json' },
		body: method === 'GET' ? undefined : JSON.stringify(body ?? {})
	});
	const payload = await response.json().catch(() => null);

	if (!response.ok) {
		throw new Error(payload?.message ?? 'Something went wrong. Try again.');
	}
	return payload as T;
}

export function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : 'Something went wrong. Try again.';
}
