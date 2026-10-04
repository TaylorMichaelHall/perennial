<!--
	The timeline: every task's windows laid out along a shared axis of months
	and years, like the sowing chart on a seed packet.
-->
<script lang="ts">
	import { calendar } from '#lib/calendar.svelte.ts';
	import { tick, untrack } from 'svelte';
	import {
		addDays,
		addMonths,
		daysBetween,
		formatDate,
		formatMonth,
		formatSpan,
		monthOf,
		startOfMonth,
		yearOf,
		type ISODate
	} from '#lib/dates.ts';
	import {
		isSnoozed,
		matchesSearch,
		projectWindows,
		statusOf,
		type Status,
		type Task,
		type Window
	} from '#lib/tasks.ts';
	import Search from '#lib/components/Search.svelte';
	import { openEditor, ui } from '#lib/ui.svelte.ts';

	let { data } = $props();

	const ZOOMS = [
		{ months: 12, label: '1 year', short: '1y' },
		{ months: 36, label: '3 years', short: '3y' },
		{ months: 120, label: '10 years', short: '10y' }
	];
	const AVERAGE_DAYS_PER_MONTH = 30.4375;
	const YEARS_AHEAD = 15;
	/** How far in from the left edge today sits when the view is centred on it. */
	const TODAY_INSET = 0.2;
	/**
	 * Enough of the past that today can sit at its inset at the widest zoom. With
	 * less, that view is stopped short by the start of the chart, and zooming
	 * back in from it lands on a later date.
	 */
	const MONTHS_BEFORE_TODAY = Math.ceil(ZOOMS.at(-1)!.months * TODAY_INSET);
	/** A year narrower than this, in pixels, has no room for its label. */
	const MIN_YEAR_LABEL_WIDTH = 64;
	const MIN_BAR_WIDTH = 6;
	/** Pointer travel before a press on the timeline counts as a drag. */
	const DRAG_THRESHOLD = 4;

	const now = $derived(calendar.today);
	// Keep the chart's origin fixed so midnight never shifts a panned view.
	const initialDay = untrack(() => calendar.today);
	const start = startOfMonth(addMonths(initialDay, -MONTHS_BEFORE_TODAY));
	const end = `${yearOf(initialDay) + YEARS_AHEAD}-01-01`;

	/** Below this width, three years of windows are too small to read. */
	const NARROW_VIEWPORT = 640;

	function defaultZoom(width: number): number {
		return width < NARROW_VIEWPORT ? 12 : 36;
	}

	let visibleMonths = $state(defaultZoom(innerWidth));
	/** Once a zoom has been picked by hand, turning the screen leaves it alone. */
	let zoomChosen = false;
	let scroller = $state<HTMLDivElement>();
	let canvas = $state<HTMLDivElement>();
	let viewportWidth = $state(0);

	const pxPerDay = $derived(viewportWidth / (visibleMonths * AVERAGE_DAYS_PER_MONTH));
	const pxPerMonth = $derived(pxPerDay * AVERAGE_DAYS_PER_MONTH);
	const totalWidth = $derived(daysBetween(start, end) * pxPerDay);

	function x(date: ISODate): number {
		return daysBetween(start, date) * pxPerDay;
	}

	/** Left edge and width of a window, whose due date is inclusive. */
	function span(window: Window): string {
		const left = x(window.opens_on);
		const width = Math.max(MIN_BAR_WIDTH, x(addDays(window.due_on, 1)) - left);
		return `left: ${left}px; width: ${width}px`;
	}

	const months: ISODate[] = [];
	for (let month = start; month < end; month = addMonths(month, 1)) months.push(month);

	const years = months.filter((month, index) => index === 0 || monthOf(month) === 0);

	const monthLabels = $derived(pxPerMonth >= 56 ? 'short' : pxPerMonth >= 15 ? 'narrow' : null);

	interface Row {
		task: Task;
		status: Status;
		summary: string;
		future: Window[];
	}

	const rows = $derived(
		data.tasks
			.filter((task) => !task.done_on && matchesSearch(task, ui.search))
			.map((task): Row => {
				const status = statusOf(task, now);
				return { task, status, summary: summarise(task, status), future: projectWindows(task, end) };
			})
	);

	function summarise(task: Task, status: Status): string {
		if (isSnoozed(task, now)) return `snoozed until ${formatDate(task.snoozed_until ?? now, now)}`;
		if (status === 'overdue') return `${formatSpan(daysBetween(task.due_on, now))} overdue`;
		if (status === 'upcoming') return `opens ${formatDate(task.opens_on, now)}`;
		return `open until ${formatDate(task.due_on, now)}`;
	}

	function describe(window: Window): string {
		return `${formatDate(window.opens_on, now)} to ${formatDate(window.due_on, now)}`;
	}

	function describeClosed(occurrence: { skipped: boolean; closed_on: ISODate }): string {
		return `${occurrence.skipped ? 'Skipped' : 'Done'} ${formatDate(occurrence.closed_on, now)}`;
	}

	function scrollToToday(behavior: ScrollBehavior = 'smooth') {
		scroller?.scrollTo({ left: x(now) - viewportWidth * TODAY_INSET, behavior });
	}

	/** Changes zoom while keeping the same date under the same point on screen. */
	async function zoomTo(months: number) {
		if (!scroller) return;
		zoomChosen = true;
		tip = null;
		const anchor = viewportWidth * TODAY_INSET;
		const anchorDays = (scroller.scrollLeft + anchor) / pxPerDay;
		visibleMonths = months;
		await tick();
		scroller.scrollLeft = anchorDays * pxPerDay - anchor;
	}

	// Centres on today at first, then holds the same date in place whenever the
	// view changes width, as it does when a phone or tablet is turned.
	let laidOutWidth = 0;
	$effect(() => {
		const width = viewportWidth;
		if (width === 0 || width === laidOutWidth) return;

		untrack(() => {
			if (!scroller) return;
			if (laidOutWidth === 0) {
				laidOutWidth = width;
				scrollToToday('instant');
				return;
			}

			const pxPerDayBefore = laidOutWidth / (visibleMonths * AVERAGE_DAYS_PER_MONTH);
			const anchorDays = (scroller.scrollLeft + laidOutWidth * TODAY_INSET) / pxPerDayBefore;
			laidOutWidth = width;
			if (!zoomChosen) visibleMonths = defaultZoom(width);
			tick().then(() => {
				if (scroller) scroller.scrollLeft = anchorDays * pxPerDay - width * TODAY_INSET;
			});
		});
	});

	// A touch screen has no hover, so tapping a mark shows its dates instead.
	let tip = $state<{ text: string; x: number; y: number } | null>(null);
	let tipWidth = $state(0);
	const TIP_MARGIN = 8;

	/** The tip is centred on the tap, but kept within the visible stretch. */
	const tipLeft = $derived.by(() => {
		if (!tip || !scroller) return 0;
		const half = tipWidth / 2 + TIP_MARGIN;
		const leftmost = scroller.scrollLeft + half;
		const rightmost = scroller.scrollLeft + viewportWidth - half;
		return Math.max(leftmost, Math.min(rightmost, tip.x));
	});

	function onclick(event: MouseEvent) {
		const mark = (event.target as Element).closest<HTMLElement>('[data-tip]');
		if (!mark || !canvas) {
			tip = null;
			return;
		}
		const bounds = canvas.getBoundingClientRect();
		tip = {
			text: mark.dataset.tip ?? '',
			x: event.clientX - bounds.left,
			y: mark.getBoundingClientRect().top - bounds.top
		};
	}

	// Dragging the timeline with a mouse pans it, as a touch drag already does.
	let drag: { startX: number; scrollLeft: number; moved: boolean } | null = null;
	let dragging = $state(false);

	function onpointerdown(event: PointerEvent) {
		if (event.pointerType !== 'mouse' || event.button !== 0 || !scroller) return;
		drag = { startX: event.clientX, scrollLeft: scroller.scrollLeft, moved: false };
	}

	function onpointermove(event: PointerEvent) {
		if (!drag || !scroller) return;
		const distance = event.clientX - drag.startX;
		if (!drag.moved) {
			if (Math.abs(distance) < DRAG_THRESHOLD) return;
			drag.moved = true;
			dragging = true;
			scroller.setPointerCapture(event.pointerId);
		}
		scroller.scrollLeft = drag.scrollLeft - distance;
	}

	function onpointerup() {
		dragging = false;
		// Keep `drag` until the click that follows a drag has been swallowed.
		if (!drag?.moved) drag = null;
	}

	function onclickcapture(event: MouseEvent) {
		if (!drag) return;
		drag = null;
		event.stopPropagation();
		event.preventDefault();
	}
</script>

<main>
	<div class="toolbar">
		<h1>Timeline</h1>
		<div class="zoom" role="group" aria-label="Zoom">
			{#each ZOOMS as zoom (zoom.months)}
				<button
					aria-label={zoom.label}
					aria-pressed={visibleMonths === zoom.months}
					onclick={() => zoomTo(zoom.months)}
				>
					<span class="wide">{zoom.label}</span><span class="narrow">{zoom.short}</span>
				</button>
			{/each}
		</div>
		<button class="button quiet" onclick={() => scrollToToday()}>
			<span><span class="wide">Go to&nbsp;</span><span class="today">today</span></span>
		</button>
		{#if data.tasks.length > 0}
			<div class="search"><Search tasks={data.tasks} /></div>
		{/if}
	</div>

	{#if rows.length === 0 && ui.search.trim()}
		<p class="empty">Nothing matches that search.</p>
	{:else if rows.length === 0}
		<p class="empty">
			Nothing to show yet. <button onclick={() => openEditor()}>Add a task</button> and its window appears
			here.
		</p>
	{:else}
		<!-- The dates a tap reveals are also on each task's own page, for the keyboard. -->
		<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
		<div
			class="scroller"
			class:dragging
			bind:this={scroller}
			bind:clientWidth={viewportWidth}
			{onpointerdown}
			{onpointermove}
			{onpointerup}
			onpointercancel={onpointerup}
			{onclickcapture}
			{onclick}
			ondragstart={(event) => event.preventDefault()}
			onscroll={() => (tip = null)}
		>
			<div
				class="canvas"
				bind:this={canvas}
				style:width="{totalWidth}px"
				style:--viewport-width="{viewportWidth}px"
			>
				<div class="grid" aria-hidden="true">
					{#each months as month (month)}
						{#if monthOf(month) === 0}
							<i class="year-line" style:left="{x(month)}px"></i>
						{:else if monthLabels}
							<i style:left="{x(month)}px"></i>
						{/if}
					{/each}
					<i class="today-line" style:left="{x(now)}px"></i>
				</div>

				<div class="axis" aria-hidden="true">
					<div class="years">
						{#each years as year, index (year)}
							{@const width = x(years[index + 1] ?? end) - x(year)}
							<!-- The chart starts part of the way through its first year. -->
							{#if width >= MIN_YEAR_LABEL_WIDTH}
								<div style:left="{x(year)}px" style:width="{width}px">
									<span>{yearOf(year)}</span>
								</div>
							{/if}
						{/each}
					</div>
					<div class="months">
						{#if monthLabels}
							{#each months as month (month)}
								<span style:left="{x(month)}px" style:width="{pxPerMonth}px">
									{formatMonth(month, monthLabels)}
								</span>
							{/each}
						{/if}
						<b style:left="{x(now)}px">Today</b>
					</div>
				</div>

				<ol>
					{#each rows as { task, status, summary, future } (task.id)}
						<li>
							<a class="label" href="/tasks/{task.id}">
								<span class="title">{task.title}</span>
								<span class="summary {status}">{summary}</span>
							</a>

							<div class="lane" class:hard={task.hard}>
								{#each task.history as occurrence (occurrence.id)}
									{#if occurrence.closed_on >= start}
										<i
											class="closed"
											class:skipped={occurrence.skipped}
											style:left="{x(occurrence.closed_on)}px"
											title={describeClosed(occurrence)}
											data-tip={describeClosed(occurrence)}
										></i>
									{/if}
								{/each}

								{#if status === 'overdue'}
									<i
										class="lateness"
										style:left="{x(task.due_on)}px"
										style:width="{x(now) - x(task.due_on)}px"
									></i>
								{/if}
								<i
									class="bar {status}"
									style={span(task)}
									title={describe(task)}
									data-tip={describe(task)}
								></i>

								{#each future as window (window.opens_on)}
									<i
										class="bar future"
										style={span(window)}
										title={describe(window)}
										data-tip={describe(window)}
									></i>
								{/each}
							</div>
						</li>
					{/each}
				</ol>

				{#if tip}
					<p
						class="tip"
						role="status"
						bind:offsetWidth={tipWidth}
						style:left="{tipLeft}px"
						style:top="{tip.y}px"
					>
						{tip.text}
					</p>
				{/if}
			</div>
		</div>

		<ul class="legend" aria-label="Legend">
			<li><i class="bar open"></i> Open now</li>
			<li><i class="bar upcoming"></i> Upcoming</li>
			<li><i class="bar overdue"></i> Overdue</li>
			<li class="hard"><i class="bar upcoming"></i> Hard deadline</li>
			<li><i class="closed"></i> Done</li>
		</ul>
	{/if}
</main>

<style>
	main {
		display: grid;
		grid-template-rows: auto minmax(0, 1fr) auto;
		height: calc(100dvh - var(--header-height));
	}

	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem 1rem;
		padding: 1.25rem var(--page-margin);
	}

	h1 {
		margin-right: auto;
		font-size: var(--text-title);
	}

	.search {
		flex-basis: 100%;
	}

	.zoom {
		display: flex;
		padding: 3px;
		border: 1px solid var(--rule);
		border-radius: var(--radius);
	}

	.zoom button {
		min-height: 2rem;
		padding: 0 0.75rem;
		border: 0;
		border-radius: 5px;
		background: none;
		color: var(--ink-soft);
		font-weight: 500;
	}

	.zoom button[aria-pressed='true'] {
		background: var(--ink);
		color: var(--paper);
	}

	.narrow {
		display: none;
	}

	.today {
		text-transform: lowercase;
	}

	.empty {
		padding: 2rem var(--page-margin);
		color: var(--ink-soft);
		font-size: var(--text-large);
	}

	.empty button {
		padding: 0;
		border: 0;
		background: none;
		color: var(--ink);
		text-decoration: underline;
		text-underline-offset: 0.2em;
	}

	.scroller {
		overflow: auto;
		border-block: 1px solid var(--rule);
		background: var(--surface);
		cursor: grab;
		overscroll-behavior-x: contain;
		/* A drag pans the chart, so it mustn't select the text it passes over. */
		user-select: none;
		-webkit-user-select: none;
	}

	.scroller.dragging {
		cursor: grabbing;
	}

	.canvas {
		position: relative;
		min-height: 100%;
		padding-bottom: 2rem;
	}

	/* Every mark on the canvas is placed by its left edge, in pixels from the start. */
	.canvas i,
	.years div,
	.months span,
	.months b,
	.tip {
		position: absolute;
	}

	/* Grid */

	.grid {
		position: absolute;
		inset: 0;
	}

	.grid i {
		inset-block: 0;
		width: 1px;
		background: var(--rule-faint);
	}

	.grid .year-line {
		background: var(--rule);
	}

	.grid .today-line {
		z-index: 1;
		background: var(--ink);
	}

	/* Axis */

	.axis {
		position: sticky;
		top: 0;
		z-index: 3;
		height: 4.25rem;
		border-bottom: 1px solid var(--rule);
		background: var(--surface);
		font-size: var(--text-small);
	}

	.years div {
		top: 0.5rem;
	}

	.years span {
		position: sticky;
		left: var(--page-margin);
		padding-inline: 0.5rem;
		/* Opaque, so the incoming year covers the outgoing one as they pass. */
		background: var(--surface);
		font-family: var(--font-display);
		font-size: var(--text-large);
		font-weight: 500;
		line-height: 1.4;
	}

	.months span {
		bottom: 0.375rem;
		padding-left: 0.5rem;
		overflow: hidden;
		color: var(--ink-soft);
	}

	.months b {
		bottom: 0;
		padding: 0.0625rem 0.4375rem;
		border-radius: 4px 4px 4px 0;
		background: var(--ink);
		color: var(--surface);
		font-weight: 600;
	}

	/* Rows */

	ol {
		position: relative;
		margin: 0;
		padding: 0.5rem 0 0;
		list-style: none;
	}

	li {
		padding-top: 0.75rem;
	}

	.label {
		position: sticky;
		left: var(--page-margin);
		z-index: 2;
		display: inline-flex;
		align-items: baseline;
		gap: 0.625rem;
		/* Never wider than the view, or its end could not be scrolled to. */
		max-width: calc(var(--viewport-width) - 2 * var(--page-margin));
		padding: 0 0.5rem;
		border-radius: 4px;
		text-decoration: none;
		/* A soft backing keeps the label legible where it crosses grid lines. */
		background: color-mix(in oklab, var(--surface) 85%, transparent);
		white-space: nowrap;
	}

	.title {
		min-width: 0;
		overflow: hidden;
		font-weight: 600;
		text-overflow: ellipsis;
	}

	.label:hover .title {
		text-decoration: underline;
		text-underline-offset: 0.2em;
	}

	.summary {
		flex: none;
		font-size: var(--text-small);
		color: var(--ink-soft);
	}

	.summary.open {
		color: var(--ripe-ink);
	}

	.summary.overdue {
		color: var(--beet);
	}

	.lane {
		position: relative;
		height: 1.5rem;
		margin-top: 0.25rem;
	}

	/* Windows */

	.bar {
		top: 0.375rem;
		height: 0.75rem;
		border-radius: 0.375rem;
		background: var(--sage);
	}

	/* A soft deadline trails off; a hard one stops dead. */
	:not(.hard) > .bar {
		mask-image: linear-gradient(to right, #000 calc(100% - min(1.75rem, 60%)), rgb(0 0 0 / 0.3));
	}

	.hard > .bar {
		border-start-end-radius: 0;
		border-end-end-radius: 0;
		box-shadow: 2px 0 0 var(--ink);
	}

	.hard > .bar::after {
		content: '';
		position: absolute;
		inset: -0.25rem -2px -0.25rem auto;
		width: 2px;
		background: var(--ink);
	}

	.bar.open {
		background: var(--ripe);
	}

	.bar.overdue {
		background: var(--beet);
	}

	.bar.future {
		background: color-mix(in oklab, var(--sage) 45%, transparent);
	}

	.hard > .bar.future {
		box-shadow: none;
	}

	.hard > .bar.future::after {
		background: var(--ink-soft);
	}

	.lateness {
		top: 0.375rem;
		height: 0.75rem;
		background: repeating-linear-gradient(
			-45deg,
			var(--beet) 0 2px,
			transparent 2px 6px
		);
	}

	.closed {
		top: 0.4375rem;
		width: 0.625rem;
		height: 0.625rem;
		border: 2px solid var(--ink-soft);
		border-radius: 50%;
		background: var(--ink-soft);
		translate: -50% 0;
	}

	.closed.skipped {
		background: none;
	}

	/* Legend */

	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem 1.5rem;
		margin: 0;
		padding: 0.75rem var(--page-margin);
		list-style: none;
		font-size: var(--text-small);
		color: var(--ink-soft);
	}

	.legend li {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0;
	}

	.legend i {
		position: relative;
		top: 0;
		flex: none;
		translate: none;
	}

	.legend .bar {
		width: 1.75rem;
	}

	/* Tip */

	/*
	 * The pointer and the pressed state also tell touch browsers that a mark
	 * takes taps; without them a tap is handed to the nearest link instead.
	 */
	.lane [data-tip] {
		cursor: pointer;
	}

	.lane [data-tip]:active {
		filter: brightness(0.85);
	}

	.tip {
		z-index: 2;
		margin: -0.375rem 0 0;
		padding: 0.25rem 0.625rem;
		border-radius: var(--radius);
		background: var(--ink);
		color: var(--surface);
		font-size: var(--text-small);
		font-weight: 600;
		white-space: nowrap;
		translate: -50% -100%;
		pointer-events: none;
		animation: tip 120ms ease-out;
	}

	@keyframes tip {
		from {
			opacity: 0;
			translate: -50% calc(-100% + 0.25rem);
		}
	}

	/* Fingers need more to aim at than a pointer does. */
	@media (pointer: coarse) {
		.zoom button {
			min-height: 2.25rem;
		}

		.label::after {
			content: '';
			position: absolute;
			inset: -0.5rem 0;
		}

		/* A window is a thin bar; the whole height of its lane takes the tap. */
		.lane .bar::before,
		.lane .closed::before {
			content: '';
			position: absolute;
			inset: -0.5rem -0.25rem;
		}
	}

	/* On a phone the chart needs the room: the bar above it shrinks to one line. */
	@media (max-width: 34rem) {
		.toolbar {
			flex-wrap: nowrap;
			gap: 0.75rem;
			padding-block: 0.75rem;
		}

		h1 {
			position: absolute;
			width: 1px;
			height: 1px;
			overflow: hidden;
			clip-path: inset(50%);
		}

		.zoom,
		.zoom button {
			flex: 1;
		}

		.toolbar .wide {
			display: none;
		}

		.narrow {
			display: inline;
		}

		.today {
			text-transform: capitalize;
		}

		.legend {
			gap: 0.25rem 1rem;
			padding-block: 0.5rem;
		}

		.legend .bar {
			width: 1.25rem;
		}
	}

	/* A phone on its side: little height, so everything around the chart gives way. */
	@media (max-height: 30rem) {
		.toolbar {
			padding-block: 0.5rem;
		}

		.legend {
			padding-block: 0.375rem;
		}

		.axis {
			height: 3.5rem;
		}

		.years div {
			top: 0.125rem;
		}
	}
</style>
