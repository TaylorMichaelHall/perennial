<!-- Chooses how dates are written, across the app and in reminders. -->
<script lang="ts">
	import { refreshAll } from '$app/navigation';
	import { api, messageOf } from '#lib/api.ts';
	import { calendar } from '#lib/calendar.svelte.ts';
	import { DATE_FORMATS, formatFullDate, type DateFormat } from '#lib/dates.ts';
	import { showToast } from '#lib/ui.svelte.ts';

	interface Props {
		format: DateFormat;
	}

	let { format }: Props = $props();

	let saving = $state(false);

	async function choose(dateFormat: string) {
		saving = true;
		try {
			await api('PUT', '/api/settings', { dateFormat });
			await refreshAll();
			showToast('Date format changed.');
		} catch (error) {
			showToast(messageOf(error));
		}
		saving = false;
	}
</script>

<section>
	<h2>Dates</h2>
	<label class="field">
		<span>Date format</span>
		<select
			class="input"
			value={format}
			disabled={saving}
			onchange={(event) => choose(event.currentTarget.value)}
		>
			{#each DATE_FORMATS as option (option)}
				<option value={option}>
					{option === 'auto' ? 'Automatic, from your browser' : formatFullDate(calendar.today, option)}
				</option>
			{/each}
		</select>
	</label>
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
</style>
