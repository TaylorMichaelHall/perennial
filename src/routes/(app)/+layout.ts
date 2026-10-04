import { setDateFormat } from '#lib/dates.ts';
import type { LayoutLoad } from './$types';

// The app is rendered in the browser only. What counts as "today" depends on
// the viewer's timezone, which the server has no way of knowing.
export const ssr = false;

export const load: LayoutLoad = ({ data }) => {
	// Before anything is drawn, so that every date on the page is written the chosen way.
	setDateFormat(data.dateFormat);
	return data;
};
