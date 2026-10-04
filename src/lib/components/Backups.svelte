<!-- Says where the automatic backups are and whether they are being taken. -->
<script lang="ts">
	import { formatDate } from '#lib/dates.ts';

	interface Props {
		status: { directory: string; latest: string | null; count: number; error: string | null };
	}

	let { status }: Props = $props();
</script>

<section>
	<h2>Backups</h2>
	<p class="about">
		The whole database is copied to <code>{status.directory}</code> once a day. Older copies are
		thinned out to one a week, then one a month, then one a year.
	</p>
	{#if status.error}
		<p class="form-error" role="alert">The last backup failed: {status.error}</p>
	{/if}
	<p>
		{#if status.latest}
			Last backed up {formatDate(status.latest)}; {status.count === 1
				? '1 copy'
				: `${status.count} copies`} kept.
		{:else}
			No backup has been taken yet.
		{/if}
	</p>
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

	code {
		overflow-wrap: anywhere;
	}
</style>
