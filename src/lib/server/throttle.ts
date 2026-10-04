/**
 * Slows down password guessing. After a few wrong attempts from one address,
 * further attempts are refused for a period that doubles with each failure.
 * State lives in memory: a restart clears it, which is fine for this purpose.
 */

const FREE_ATTEMPTS = 5;
const BASE_LOCKOUT_MS = 30_000;
const MAX_LOCKOUT_MS = 15 * 60_000;

interface Attempts {
	failures: number;
	lockedUntil: number;
}

const attemptsByAddress = new Map<string, Attempts>();

/** Seconds until `address` may try again, or 0 if it may try now. */
export function secondsUntilAllowed(address: string): number {
	const lockedUntil = attemptsByAddress.get(address)?.lockedUntil ?? 0;
	return Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000));
}

export function recordFailure(address: string): void {
	const attempts = attemptsByAddress.get(address) ?? { failures: 0, lockedUntil: 0 };
	attempts.failures += 1;

	const excess = attempts.failures - FREE_ATTEMPTS;
	if (excess >= 0) {
		attempts.lockedUntil = Date.now() + Math.min(BASE_LOCKOUT_MS * 2 ** excess, MAX_LOCKOUT_MS);
	}
	attemptsByAddress.set(address, attempts);
}

export function recordSuccess(address: string): void {
	attemptsByAddress.delete(address);
}
