/** The browser's calendar day, shared by every date-sensitive view. */
import { endOfLocalDay, today } from '#lib/dates.ts';

export const calendar = $state({ today: today() });

/** Start once from the app layout; clean up timers and listeners when it unmounts. */
export function startDayClock(): () => void {
	let timer: ReturnType<typeof setTimeout>;
	const refresh = () => {
		clearTimeout(timer);
		calendar.today = today();
		// Wake at local midnight (including DST), with a minute cap to pick up
		// clock/timezone changes while the browser stays open.
		const delay = Math.max(1, Math.min(60_000, endOfLocalDay(calendar.today) - Date.now()));
		timer = setTimeout(refresh, delay);
	};
	const onVisible = () => {
		if (document.visibilityState === 'visible') refresh();
	};

	refresh();
	window.addEventListener('focus', refresh);
	window.addEventListener('pageshow', refresh);
	document.addEventListener('visibilitychange', onVisible);
	return () => {
		clearTimeout(timer);
		window.removeEventListener('focus', refresh);
		window.removeEventListener('pageshow', refresh);
		document.removeEventListener('visibilitychange', onVisible);
	};
}
