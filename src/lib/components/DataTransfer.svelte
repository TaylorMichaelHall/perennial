<!-- Saves every task to a file, and adds the tasks from a saved file. -->
<script lang="ts">
	import { refreshAll } from '$app/navigation';
	import { api, messageOf } from '#lib/api.ts';
	import { today } from '#lib/dates.ts';
	import { showToast } from '#lib/ui.svelte.ts';

	let error = $state('');
	let busy = $state(false);
	let picker: HTMLInputElement;

	async function exportTasks() {
		busy = true;
		error = '';
		try {
			const response = await fetch('/api/export');
			if (!response.ok) throw new Error('Couldn’t export your tasks. Try again.');

			const link = document.createElement('a');
			link.href = URL.createObjectURL(await response.blob());
			link.download = `perennial-${today()}.json`;
			link.click();
			URL.revokeObjectURL(link.href);
		} catch (cause) {
			error = messageOf(cause);
		}
		busy = false;
	}

	async function importTasks(event: Event & { currentTarget: HTMLInputElement }) {
		const [file] = event.currentTarget.files ?? [];
		// Clear the picker so choosing the same file again still counts as a change.
		event.currentTarget.value = '';
		if (!file) return;

		busy = true;
		error = '';
		try {
			const contents = await file.text();
			let parsed: unknown;
			try {
				parsed = JSON.parse(contents);
			} catch {
				throw new Error('That isn’t a Perennial export.');
			}

			const { imported } = await api<{ imported: number }>('POST', '/api/import', parsed);
			await refreshAll();
			showToast(imported === 1 ? 'Added 1 task.' : `Added ${imported} tasks.`);
		} catch (cause) {
			error = messageOf(cause);
		}
		busy = false;
	}
</script>

<section>
	<h2>Export and import</h2>
	<p class="about">
		Save your tasks and their history to a file, or add the tasks from one. Importing adds to what
		you have; it never replaces or removes anything. Notification settings, API keys and your
		password aren’t included.
	</p>

	{#if error}
		<p class="form-error" role="alert">{error}</p>
	{/if}

	<div class="actions">
		<button type="button" class="button" disabled={busy} onclick={exportTasks}>Export tasks</button>
		<button type="button" class="button quiet" disabled={busy} onclick={() => picker.click()}>
			Import tasks
		</button>
	</div>
	<input
		bind:this={picker}
		type="file"
		accept="application/json,.json"
		hidden
		onchange={importTasks}
	/>
</section>

<style>
	section {
		display: grid;
		gap: 1.25rem;
		max-width: 22rem;
	}

	h2 {
		font-size: var(--text-large);
	}

	.about {
		margin-top: -0.75rem;
		color: var(--ink-soft);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
	}
</style>
