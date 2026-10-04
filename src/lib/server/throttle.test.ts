import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { recordFailure, recordSuccess, secondsUntilAllowed } from '#lib/server/throttle.ts';

function fail(address: string, times: number) {
	for (let attempt = 0; attempt < times; attempt++) recordFailure(address);
}

describe('throttle', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('allows an address that has never failed', () => {
		expect(secondsUntilAllowed('10.0.0.1')).toBe(0);
	});

	it('forgives the first few wrong attempts', () => {
		fail('10.0.0.2', 4);
		expect(secondsUntilAllowed('10.0.0.2')).toBe(0);
	});

	it('locks an address out on the fifth failure, doubling with each one after', () => {
		fail('10.0.0.3', 5);
		expect(secondsUntilAllowed('10.0.0.3')).toBe(30);
		fail('10.0.0.3', 1);
		expect(secondsUntilAllowed('10.0.0.3')).toBe(60);
		fail('10.0.0.3', 1);
		expect(secondsUntilAllowed('10.0.0.3')).toBe(120);
	});

	it('never locks an address out for more than fifteen minutes', () => {
		fail('10.0.0.4', 50);
		expect(secondsUntilAllowed('10.0.0.4')).toBe(15 * 60);
	});

	it('counts down, and lets the address try again once the time is up', () => {
		fail('10.0.0.5', 5);
		vi.advanceTimersByTime(10_500);
		expect(secondsUntilAllowed('10.0.0.5')).toBe(20);
		vi.advanceTimersByTime(19_500);
		expect(secondsUntilAllowed('10.0.0.5')).toBe(0);
	});

	it('keeps counting failures after a lockout has passed', () => {
		fail('10.0.0.6', 5);
		vi.advanceTimersByTime(30_000);
		fail('10.0.0.6', 1);
		expect(secondsUntilAllowed('10.0.0.6')).toBe(60);
	});

	it('starts afresh after a successful sign-in', () => {
		fail('10.0.0.7', 6);
		recordSuccess('10.0.0.7');
		expect(secondsUntilAllowed('10.0.0.7')).toBe(0);
		fail('10.0.0.7', 4);
		expect(secondsUntilAllowed('10.0.0.7')).toBe(0);
	});

	it('tracks each address separately', () => {
		fail('10.0.0.8', 5);
		expect(secondsUntilAllowed('10.0.0.9')).toBe(0);
	});
});
