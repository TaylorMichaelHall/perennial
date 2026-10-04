<!-- The dialog for adding a task, or for editing, finishing, or deleting one. -->
<script lang="ts">
	import { calendar } from '#lib/calendar.svelte.ts';
	import { onMount, untrack } from 'svelte';
	import { refreshAll } from '$app/navigation';
	import { api, messageOf } from '#lib/api.ts';
	import DateField from '#lib/components/DateField.svelte';
	import { addMonths, formatDate, type RepeatUnit } from '#lib/dates.ts';
	import { MAX_NOTES_LENGTH, MAX_REPEAT_EVERY, MAX_TITLE_LENGTH } from '#lib/limits.ts';
	import { parseTags, statusOf, type RepeatFrom, type Task, type TaskFields } from '#lib/tasks.ts';
	import { closeEditor, closeTask, reopenTask, showToast, type Editor } from '#lib/ui.svelte.ts';

	interface Props {
		editor: Editor;
	}

	let { editor }: Props = $props();

	// The dialog is created afresh each time it opens, so the form deliberately
	// takes a one-time copy of the task it was opened with.
	// svelte-ignore state_referenced_locally
	const { task, suggestedTitle } = editor;
	const now = $derived(calendar.today);
	const status = $derived(task ? statusOf(task, now) : null);
	// Initial form values stay put while the user edits across midnight.
	const initialDay = untrack(() => calendar.today);

	let title = $state(task?.title ?? suggestedTitle);
	let notes = $state(task?.notes ?? '');
	let opensOn = $state(task?.opens_on ?? initialDay);
	let dueOn = $state(task?.due_on ?? addMonths(initialDay, 1));
	let hard = $state(task?.hard ?? false);
	let doesRepeat = $state(task ? task.repeat_every !== null : false);
	let repeatEvery = $state(task?.repeat_every ?? 1);
	let repeatUnit = $state<RepeatUnit>(task?.repeat_unit ?? 'year');
	let repeatFrom = $state<RepeatFrom>(task?.repeat_from ?? 'schedule');
	let tags = $state(task?.tags.join(' ') ?? '');

	let error = $state('');
	let saving = $state(false);
	let dialog: HTMLDialogElement;

	onMount(() => dialog.showModal());

	async function run(action: () => Promise<unknown>) {
		saving = true;
		error = '';
		try {
			await action();
			dialog.close();
		} catch (cause) {
			error = messageOf(cause);
			saving = false;
		}
	}

	function save(event: SubmitEvent) {
		event.preventDefault();
		const fields: TaskFields = {
			title,
			notes,
			opens_on: opensOn,
			due_on: dueOn,
			hard,
			repeat_every: doesRepeat ? repeatEvery : null,
			repeat_unit: doesRepeat ? repeatUnit : null,
			repeat_from: repeatFrom,
			tags: parseTags(tags)
		};

		run(async () => {
			if (task) await api('PUT', `/api/tasks/${task.id}`, fields);
			else await api('POST', '/api/tasks', fields);
			await refreshAll();
		});
	}

	function remove(task: Task) {
		if (!confirm(`Delete “${task.title}” and its history? This can’t be undone.`)) return;
		run(async () => {
			await api('DELETE', `/api/tasks/${task.id}`);
			await refreshAll();
			showToast('Deleted.');
		});
	}
</script>

<dialog bind:this={dialog} onclose={closeEditor} aria-labelledby="task-dialog-title">
	<form onsubmit={save}>
		<h2 id="task-dialog-title">{task ? 'Edit task' : 'Add a task'}</h2>

		{#if task}
			<div class="finish">
				{#if status === 'done'}
					<button type="button" class="button quiet" onclick={() => run(() => reopenTask(task))}>
						Reopen
					</button>
				{:else}
					<button type="button" class="button quiet" onclick={() => run(() => closeTask(task))}>
						{status === 'upcoming' ? 'Mark done early' : 'Mark done'}
					</button>
					{#if task.repeat_every}
						<button
							type="button"
							class="button quiet"
							onclick={() => run(() => closeTask(task, { skipped: true }))}
						>
							Skip this time
						</button>
					{/if}
				{/if}
			</div>
		{/if}

		<label class="field">
			<span>Name</span>
			<input
				class="input"
				bind:value={title}
				placeholder="Renew passport"
				maxlength={MAX_TITLE_LENGTH}
				required
			/>
		</label>

		<div class="pair">
			<label class="field">
				<span>Can be started</span>
				<DateField bind:value={opensOn} required />
			</label>
			<label class="field">
				<span>Due by</span>
				<DateField bind:value={dueOn} min={opensOn} required />
			</label>
		</div>

		<fieldset class="field">
			<legend>If it runs late</legend>
			<div class="choices">
				<label>
					<input type="radio" bind:group={hard} value={false} />
					It can slip a little
				</label>
				<label>
					<input type="radio" bind:group={hard} value={true} />
					It’s a hard deadline
				</label>
			</div>
		</fieldset>

		<fieldset class="field">
			<legend>Repeats</legend>
			<div class="choices">
				<label>
					<input type="radio" bind:group={doesRepeat} value={false} />
					Just once
				</label>
				<!-- Kept together, so a narrow screen wraps "every so many years" as one. -->
				<div class="interval">
					<label>
						<input type="radio" bind:group={doesRepeat} value={true} />
						Every
					</label>
					<input
						class="input every"
						type="number"
						min="1"
						max={MAX_REPEAT_EVERY}
						bind:value={repeatEvery}
						disabled={!doesRepeat}
						aria-label="Number of months or years"
					/>
					<select
						class="input unit"
						bind:value={repeatUnit}
						disabled={!doesRepeat}
						aria-label="Months or years"
					>
						<option value="month">{repeatEvery === 1 ? 'month' : 'months'}</option>
						<option value="year">{repeatEvery === 1 ? 'year' : 'years'}</option>
					</select>
				</div>
			</div>
		</fieldset>

		{#if doesRepeat}
			<fieldset class="field">
				<legend>The next one is counted from</legend>
				<div class="choices">
					<label>
						<input type="radio" bind:group={repeatFrom} value="schedule" />
						The due date
					</label>
					<label>
						<input type="radio" bind:group={repeatFrom} value="completion" />
						The day it gets done
					</label>
				</div>
			</fieldset>
		{/if}

		<label class="field">
			<span>Tags</span>
			<input class="input" bind:value={tags} placeholder="house car" autocapitalize="off" />
		</label>

		<label class="field">
			<span>Notes</span>
			<textarea class="input" rows="3" bind:value={notes} maxlength={MAX_NOTES_LENGTH}></textarea>
		</label>

		{#if task && task.history.length > 0}
			<section class="history">
				<h3>History</h3>
				<ul>
					{#each task.history as occurrence (occurrence.id)}
						<li>
							{occurrence.skipped ? 'Skipped' : 'Done'}
							{formatDate(occurrence.closed_on, now)}
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		{#if error}
			<p class="form-error" role="alert">{error}</p>
		{/if}

		<footer>
			{#if task}
				<button type="button" class="button quiet danger" onclick={() => remove(task)}>
					Delete
				</button>
			{/if}
			<button type="button" class="button quiet cancel" onclick={() => dialog.close()}>
				Cancel
			</button>
			<button class="button" disabled={saving}>{task ? 'Save changes' : 'Add task'}</button>
		</footer>
	</form>
</dialog>

<style>
	dialog {
		width: min(100vw - 2rem, 32rem);
		max-height: calc(100dvh - 2rem);
		padding: 0;
		overscroll-behavior: contain;
		border: 1px solid var(--rule);
		border-radius: 14px;
		background: var(--paper);
		color: var(--ink);
		box-shadow: 0 24px 60px -20px color-mix(in oklab, var(--ink) 45%, transparent);
	}

	dialog[open] {
		animation: open 160ms ease-out;
	}

	dialog::backdrop {
		background: color-mix(in oklab, light-dark(#14251f, #000) 40%, transparent);
	}

	@keyframes open {
		from {
			opacity: 0;
			translate: 0 0.5rem;
		}
	}

	form {
		--inset: 1.75rem;
		display: grid;
		gap: 1.25rem;
		padding: var(--inset) var(--inset) 0;
	}

	h2 {
		font-size: var(--text-title);
	}

	.finish {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	/* Side by side while each date has room to be read; stacked otherwise. */
	.pair {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 9.5rem), 1fr));
		gap: 1rem;
	}

	fieldset {
		min-width: 0;
		margin: 0;
		padding: 0;
		border: 0;
	}

	.choices {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 1.25rem;
		min-width: 0;
		min-height: 2.5rem;
	}

	.choices label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	input[type='radio'] {
		width: 1.125rem;
		height: 1.125rem;
		margin: 0;
		accent-color: var(--ink);
	}

	.interval {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		/* Lets the two fields narrow rather than poke past the form's edge. */
		min-width: 0;
	}

	.every {
		width: 4.5rem;
		margin-left: 0.25rem;
	}

	.unit {
		width: auto;
	}

	.input:disabled {
		opacity: 0.5;
	}

	.history h3 {
		font-size: var(--text-small);
		font-weight: 600;
		color: var(--ink-soft);
	}

	.history ul {
		max-height: 7.5rem;
		margin: 0.375rem 0 0;
		padding: 0;
		overflow-y: auto;
		list-style: none;
	}

	footer {
		display: flex;
		gap: 0.5rem;
		margin-inline: calc(-1 * var(--inset));
		padding: 0.25rem var(--inset) var(--inset);
		background: var(--paper);
	}

	.cancel {
		margin-left: auto;
	}

	/* With the height to spare, saving stays in reach however long the form is. */
	@media (min-height: 40rem) {
		footer {
			position: sticky;
			bottom: 0;
			margin-top: -0.25rem;
			padding-block: 1rem;
			border-top: 1px solid var(--rule);
		}
	}

	@media (max-width: 26rem) {
		form {
			--inset: 1.25rem;
		}

		/* Three buttons no longer fit abreast: saving takes a line of its own. */
		footer:has(.danger) {
			flex-wrap: wrap;
		}

		footer:has(.danger) .button:not(.quiet) {
			order: -1;
			flex: 1 0 100%;
		}
	}
</style>
