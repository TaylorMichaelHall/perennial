<!-- One task in full: where a reminder links to, to act on the task or snooze it. -->
<script lang="ts">
	import { calendar } from '#lib/calendar.svelte.ts';
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import WindowMeter from '#lib/components/WindowMeter.svelte';
	import { addDays, addMonths, daysBetween, formatDate, formatSpan } from '#lib/dates.ts';
	import { isSnoozed, repeatLabel, statusOf } from '#lib/tasks.ts';
	import { closeTask, openEditor, reopenTask, snoozeTask, ui } from '#lib/ui.svelte.ts';

	let { data } = $props();

	const now = $derived(calendar.today);
	const tomorrow = $derived(addDays(now, 1));

	const task = $derived(data.tasks.find((candidate) => candidate.id === Number(page.params.id)));
	const status = $derived(task ? statusOf(task, now) : null);
	const snoozed = $derived(task ? isSnoozed(task, now) : false);

	let customDate = $state(untrack(() => addDays(calendar.today, 14)));
	let doneOn = $state(untrack(() => addDays(calendar.today, -1)));

	const summary = $derived.by(() => {
		if (!task) return '';
		const due = formatDate(task.due_on, now);
		const deadline = `${task.hard ? 'due by' : 'aim for'} ${due}`;

		switch (status) {
			case 'done':
				return `Finished ${formatDate(task.done_on ?? now, now)}.`;
			case 'overdue':
				return `${formatSpan(daysBetween(task.due_on, now))} overdue. It was due ${due}.`;
			case 'upcoming':
				return `Opens ${formatDate(task.opens_on, now)}, in ${formatSpan(daysBetween(now, task.opens_on))}; ${deadline}.`;
			default:
				return task.due_on === now
					? 'Can be done now, and today is the last day.'
					: `Can be done now, with ${formatSpan(daysBetween(now, task.due_on))} left; ${deadline}.`;
		}
	});
</script>

<main>
	<a class="back" href="/">Back to the agenda</a>

	{#if !task || !status}
		<h1>That task no longer exists</h1>
		<p class="summary">It may have been deleted since the reminder was sent.</p>
	{:else}
		<header>
			<h1>{task.title}</h1>
			<p class="summary" class:late={status === 'overdue'}>{summary}</p>
		</header>

		{#if status !== 'done'}
			<div class="window">
				<WindowMeter window={task} {status} hard={task.hard} today={now} />
				<span>{formatDate(task.opens_on, now)}</span>
				<span>{formatDate(task.due_on, now)}</span>
			</div>
		{/if}

		{#if repeatLabel(task) || task.notes || task.tags.length > 0}
			<div class="about">
				{#if repeatLabel(task)}<p>{repeatLabel(task)}</p>{/if}
				{#if task.tags.length > 0}
					<p class="tags">
						{#each task.tags as tag (tag)}
							<!-- The agenda, narrowed to the tasks that share this tag. -->
							<a href="/" onclick={() => (ui.search = `#${tag}`)}>#{tag}</a>
						{/each}
					</p>
				{/if}
				{#if task.notes}<p class="notes">{task.notes}</p>{/if}
			</div>
		{/if}

		<div class="actions">
			{#if status === 'done'}
				<button class="button" onclick={() => reopenTask(task)}>Reopen</button>
			{:else}
				<button class="button" onclick={() => closeTask(task)}>
					{status === 'upcoming' ? 'Mark done early' : 'Mark done'}
				</button>
				{#if task.repeat_every}
					<button class="button quiet" onclick={() => closeTask(task, { skipped: true })}>
						Skip this time
					</button>
				{/if}
			{/if}
			<button class="button quiet" onclick={() => openEditor(task)}>Edit</button>
		</div>

		{#if status !== 'done'}
			<section>
				<h2>Done on another day</h2>
				<p>
					If it was done before today, say when.
					{#if task.repeat_every && task.repeat_from === 'completion'}
						The next one is counted from that day.
					{/if}
				</p>
				<form
					class="actions"
					onsubmit={(event) => {
						event.preventDefault();
						closeTask(task, { on: doneOn });
					}}
				>
					<label class="field">
						<span>Done on</span>
						<input class="input" type="date" bind:value={doneOn} max={now} required />
					</label>
					<button class="button quiet">Mark done on this day</button>
				</form>
			</section>
		{/if}

		{#if status === 'open' || status === 'overdue'}
			<section>
				<h2>Snooze</h2>
				{#if snoozed && task.snoozed_until}
					<p>Snoozed until {formatDate(task.snoozed_until, now)}. No reminders until then.</p>
					<div class="actions">
						<button class="button quiet" onclick={() => snoozeTask(task, null)}>End snooze</button>
					</div>
				{:else}
					<p>Set it aside for now. Reminders stop and start again on the day you pick.</p>
					<div class="actions">
						<button class="button quiet" onclick={() => snoozeTask(task, addDays(now, 7))}>
							Snooze 1 week
						</button>
						<button class="button quiet" onclick={() => snoozeTask(task, addMonths(now, 1))}>
							Snooze 1 month
						</button>
					</div>
					<form
						class="actions"
						onsubmit={(event) => {
							event.preventDefault();
							snoozeTask(task, customDate);
						}}
					>
						<label class="field">
							<span>Or until</span>
							<input class="input" type="date" bind:value={customDate} min={tomorrow} required />
						</label>
						<button class="button quiet">Snooze</button>
					</form>
				{/if}
			</section>
		{/if}

		{#if task.history.length > 0}
			<section>
				<h2>History</h2>
				<ul>
					{#each task.history as occurrence (occurrence.id)}
						<li>{occurrence.skipped ? 'Skipped' : 'Done'} {formatDate(occurrence.closed_on, now)}</li>
					{/each}
				</ul>
			</section>
		{/if}
	{/if}
</main>

<style>
	main {
		display: grid;
		gap: 2rem;
		max-width: 50rem;
		margin: 0 auto;
		padding: clamp(1.5rem, 4vw, 2.5rem) var(--page-margin) 6rem;
	}

	main > * {
		max-width: 34rem;
	}

	.back {
		justify-self: start;
		margin-block: -0.625rem;
		padding-block: 0.625rem;
		color: var(--ink-soft);
		font-weight: 500;
		text-underline-offset: 0.2em;
	}

	h1 {
		font-size: var(--text-display);
		overflow-wrap: anywhere;
	}

	.summary {
		margin-top: 0.5rem;
		font-size: var(--text-large);
		color: var(--ink-soft);
		text-wrap: pretty;
	}

	.summary.late {
		color: var(--beet);
	}

	.window {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 0.5rem;
		font-size: var(--text-small);
		color: var(--ink-soft);
	}

	.window :global(.meter) {
		grid-column: 1 / -1;
		height: 10px;
		border-radius: 5px;
	}

	.notes {
		margin-top: 0.5rem;
		overflow-wrap: anywhere;
		white-space: pre-wrap;
	}

	.about p:first-child:not(.notes) {
		color: var(--ink-soft);
	}

	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 0.75rem;
		color: var(--ink-soft);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: 0.5rem;
	}

	section {
		display: grid;
		gap: 0.875rem;
		padding-top: 1.5rem;
		border-top: 1px solid var(--rule);
	}

	h2 {
		font-size: var(--text-large);
	}

	section p {
		color: var(--ink-soft);
	}

	ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}
</style>
