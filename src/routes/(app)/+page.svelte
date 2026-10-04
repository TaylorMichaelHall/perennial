<!-- The agenda: what can be done now, and what is coming up. -->
<script lang="ts">
	import { calendar } from '#lib/calendar.svelte.ts';
	import Search from '#lib/components/Search.svelte';
	import WindowMeter from '#lib/components/WindowMeter.svelte';
	import { daysBetween, formatDate, formatLongDate, formatSpan } from '#lib/dates.ts';
	import { isSnoozed, matchesSearch, repeatLabel, statusOf, type Task } from '#lib/tasks.ts';
	import { closeTask, openEditor, ui } from '#lib/ui.svelte.ts';

	let { data } = $props();

	const now = $derived(calendar.today);

	const STARTERS = [
		'Renew passport',
		'Drain the water heater',
		'Clean out the dryer duct',
		'Replace smoke alarm batteries',
		'Service the furnace'
	];

	// Snoozed tasks are set aside in a group of their own until their day comes.
	const found = $derived(data.tasks.filter((task) => matchesSearch(task, ui.search)));
	const snoozed = $derived(found.filter((task) => isSnoozed(task, now)));
	const byStatus = $derived(
		Object.groupBy(
			found.filter((task) => !isSnoozed(task, now)),
			(task) => statusOf(task, now)
		)
	);
	const overdue = $derived(byStatus.overdue ?? []);
	const open = $derived(byStatus.open ?? []);
	const done = $derived(byStatus.done ?? []);
	const upcoming = $derived(
		(byStatus.upcoming ?? []).toSorted((a, b) => a.opens_on.localeCompare(b.opens_on))
	);

	/** Upcoming tasks, grouped by how soon they open. */
	const horizons = $derived.by(() => {
		const opensWithin = (task: Task) => daysBetween(now, task.opens_on);
		return [
			{ heading: 'Opening in the next month', tasks: upcoming.filter((t) => opensWithin(t) <= 31) },
			{
				heading: 'Opening in the next year',
				tasks: upcoming.filter((t) => opensWithin(t) > 31 && opensWithin(t) <= 366)
			},
			{ heading: 'Further out', tasks: upcoming.filter((t) => opensWithin(t) > 366) }
		].filter((horizon) => horizon.tasks.length > 0);
	});

	const summary = $derived.by(() => {
		if (found.length === 0) return 'Nothing matches that search.';

		const actionable = overdue.length + open.length;
		if (actionable > 0) {
			const things = actionable === 1 ? '1 thing' : `${actionable} things`;
			const late = overdue.length > 0 ? ` ${overdue.length} overdue.` : '';
			return `${things} can be done now.${late}`;
		}

		const [next] = upcoming;
		if (next) {
			const wait = formatSpan(daysBetween(now, next.opens_on));
			return `Nothing needs doing right now. Next is “${next.title}”, which opens in ${wait}.`;
		}
		return 'Nothing needs doing right now.';
	});

	function timeLeft(task: Task): string {
		const days = daysBetween(now, task.due_on);
		if (days === 0) return 'Last day';
		return `${formatSpan(days)} left`;
	}

	/** The line under a task's name: how it repeats, its tags, and the start of its notes. */
	function note(task: Task): string {
		const tags = task.tags.map((tag) => `#${tag}`).join(' ');
		return [repeatLabel(task), tags, task.notes.split('\n')[0]].filter(Boolean).join(', ');
	}

	function deadline(task: Task): string {
		return `${task.hard ? 'Due by' : 'Aim for'} ${formatDate(task.due_on, now)}`;
	}
</script>

{#snippet details(task: Task)}
	<a class="details" href="/tasks/{task.id}">
		<span class="title">{task.title}</span>
		{#if note(task)}
			<span class="note">{note(task)}</span>
		{/if}
	</a>
{/snippet}

{#snippet actionable(task: Task, status: 'open' | 'overdue')}
	<li class="task">
		<button class="check" onclick={() => closeTask(task)} aria-label="Mark “{task.title}” done">
			<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 8.5 2.8 2.8L12 5.5" /></svg>
		</button>
		{@render details(task)}
		<div class="when">
			{#if status === 'overdue'}
				<strong class="late">{formatSpan(daysBetween(task.due_on, now))} overdue</strong>
				<span>Was due {formatDate(task.due_on, now)}</span>
			{:else}
				<strong>{timeLeft(task)}</strong>
				<span>{deadline(task)}</span>
			{/if}
			<WindowMeter window={task} {status} hard={task.hard} today={now} />
		</div>
	</li>
{/snippet}

<main>
	{#if data.tasks.length === 0}
		<section class="empty">
			<h1>Nothing here yet</h1>
			<p>
				Add the things that come around once a year, or once a decade. Each one gets a window: the
				day it can be started and the day it’s due.
			</p>
			<p>Start with one of these, or add your own.</p>
			<ul class="starters">
				{#each STARTERS as starter (starter)}
					<li>
						<button class="button quiet" onclick={() => openEditor(null, starter)}>{starter}</button>
					</li>
				{/each}
			</ul>
		</section>
	{:else}
		<header>
			<h1>{formatLongDate(now)}</h1>
			<p>{summary}</p>
			<Search tasks={data.tasks} />
		</header>

		{#if overdue.length > 0}
			<section>
				<h2>Overdue</h2>
				<ul>
					{#each overdue as task (task.id)}
						{@render actionable(task, 'overdue')}
					{/each}
				</ul>
			</section>
		{/if}

		{#if open.length > 0}
			<section>
				<h2>Can be done now</h2>
				<ul>
					{#each open as task (task.id)}
						{@render actionable(task, 'open')}
					{/each}
				</ul>
			</section>
		{/if}

		{#each horizons as horizon (horizon.heading)}
			<section>
				<h2>{horizon.heading}</h2>
				<ul>
					{#each horizon.tasks as task (task.id)}
						<li class="task upcoming">
							{@render details(task)}
							<div class="when">
								<strong>Opens {formatDate(task.opens_on, now)}</strong>
								<span>{deadline(task)}</span>
							</div>
						</li>
					{/each}
				</ul>
			</section>
		{/each}

		{#if snoozed.length > 0}
			<section>
				<h2>Snoozed</h2>
				<ul>
					{#each snoozed as task (task.id)}
						<li class="task upcoming">
							{@render details(task)}
							<div class="when">
								<strong>Back {formatDate(task.snoozed_until ?? now, now)}</strong>
								<span>{deadline(task)}</span>
							</div>
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		{#if done.length > 0}
			<details>
				<summary>Finished ({done.length})</summary>
				<ul>
					{#each done as task (task.id)}
						<li class="task upcoming">
							{@render details(task)}
							<div class="when">
								<span>Done {formatDate(task.done_on ?? now, now)}</span>
							</div>
						</li>
					{/each}
				</ul>
			</details>
		{/if}
	{/if}
</main>

<style>
	main {
		max-width: 50rem;
		margin: 0 auto;
		padding: clamp(2rem, 6vw, 4rem) var(--page-margin) 6rem;
	}

	header h1,
	.empty h1 {
		font-size: var(--text-display);
	}

	header :global(search) {
		margin-top: 1.5rem;
	}

	header p {
		max-width: 38rem;
		margin-top: 0.5rem;
		font-size: var(--text-large);
		color: var(--ink-soft);
		text-wrap: pretty;
	}

	section,
	details {
		margin-top: 3rem;
	}

	h2 {
		padding-bottom: 0.625rem;
		border-bottom: 1px solid var(--ink);
		font-size: var(--text-large);
	}

	ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.task {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) 11rem;
		align-items: center;
		gap: 1rem;
		padding: 0.875rem 0;
		border-bottom: 1px solid var(--rule);
	}

	.task.upcoming {
		grid-template-columns: minmax(0, 1fr) 11rem;
	}

	.check {
		position: relative;
		display: grid;
		width: 1.75rem;
		height: 1.75rem;
		padding: 0;
		border: 1.5px solid var(--ink-soft);
		border-radius: 50%;
		background: none;
		place-items: center;
	}

	.check svg {
		width: 1rem;
		fill: none;
		stroke: var(--paper);
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
		opacity: 0;
	}

	/* The circle stays small; the area that takes a tap is finger-sized. */
	.check::after {
		content: '';
		position: absolute;
		inset: -0.5rem;
	}

	.check:active {
		border-color: var(--ink);
		background: var(--ink);
	}

	.check:active svg {
		opacity: 1;
	}

	/* Only where hovering is real: on a touch screen it would stick after a tap. */
	@media (hover: hover) {
		.check:hover {
			border-color: var(--ink);
			background: var(--ink);
		}

		.check:hover svg {
			opacity: 1;
		}
	}

	.details {
		display: grid;
		/* Padding the row's own spacing absorbs, for a taller target to tap. */
		margin-block: -0.5rem;
		padding-block: 0.5rem;
		text-decoration: none;
	}

	.title {
		font-size: 1.0625rem;
		font-weight: 600;
		overflow-wrap: anywhere;
	}

	.details:hover .title {
		text-decoration: underline;
		text-underline-offset: 0.2em;
	}

	.note {
		overflow: hidden;
		color: var(--ink-soft);
		font-size: var(--text-small);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.when {
		display: grid;
		font-size: var(--text-small);
		color: var(--ink-soft);
	}

	.when strong {
		font-size: var(--text-body);
		font-weight: 600;
		color: var(--ink);
	}

	.when strong.late {
		color: var(--beet);
	}

	.when :global(.meter) {
		margin-top: 0.5rem;
	}

	summary {
		color: var(--ink-soft);
		font-weight: 500;
		cursor: pointer;
	}

	.empty {
		display: grid;
		gap: 1rem;
		max-width: 34rem;
	}

	.empty p {
		color: var(--ink-soft);
		font-size: var(--text-large);
		text-wrap: pretty;
	}

	.empty p + p {
		margin-top: 1rem;
		font-size: var(--text-body);
	}

	.starters {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	@media (max-width: 36rem) {
		.task {
			grid-template-columns: auto minmax(0, 1fr);
		}

		.task.upcoming {
			grid-template-columns: minmax(0, 1fr);
		}

		.task:not(.upcoming) .when {
			grid-column: 2;
		}
	}
</style>
