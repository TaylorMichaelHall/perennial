<script lang="ts">
	import { onMount } from 'svelte';
	import { startDayClock } from '#lib/calendar.svelte.ts';
	import { page } from '$app/state';
	import Mark from '#lib/components/Mark.svelte';
	import TaskDialog from '#lib/components/TaskDialog.svelte';
	import Toast from '#lib/components/Toast.svelte';
	import { openEditor, ui } from '#lib/ui.svelte.ts';

	let { children, data } = $props();

	onMount(startDayClock);

	const views = [
		{ href: '/', label: 'Agenda' },
		{ href: '/timeline', label: 'Timeline' }
	];
</script>

<header>
	<a class="brand" href="/" aria-label="Perennial">
		<Mark />
		<span>Perennial</span>
	</a>

	<nav aria-label="Views">
		{#each views as view (view.href)}
			<a href={view.href} aria-current={page.url.pathname === view.href ? 'page' : undefined}>
				{view.label}
			</a>
		{/each}
	</nav>

	<div class="actions">
		<a
			class="settings"
			href="/settings"
			aria-current={page.url.pathname === '/settings' ? 'page' : undefined}
		>
			Settings
		</a>
		<button class="button" onclick={() => openEditor()}>
			<span>Add<span class="wide">&nbsp;a task</span></span>
		</button>
	</div>
</header>

<!-- Dates are written out as a page is drawn, so a new format draws it again. -->
{#key data.dateFormat}
	{@render children()}
{/key}

{#if ui.editor}
	<TaskDialog editor={ui.editor} />
{/if}

{#if ui.toast}
	<Toast toast={ui.toast} />
{/if}

<style>
	header {
		position: sticky;
		top: 0;
		z-index: 10;
		display: flex;
		align-items: center;
		gap: clamp(1rem, 4vw, 2.5rem);
		height: var(--header-height);
		padding: 0 var(--page-margin);
		border-bottom: 1px solid var(--rule);
		background: var(--paper);
	}

	.brand {
		display: flex;
		align-self: stretch;
		align-items: center;
		gap: 0.625rem;
		font-family: var(--font-display);
		font-size: var(--text-large);
		font-weight: 500;
		text-decoration: none;
	}

	nav {
		display: flex;
		align-self: stretch;
		gap: 1.5rem;
	}

	nav a {
		display: flex;
		align-items: center;
		border-block: 2px solid transparent;
		color: var(--ink-soft);
		font-weight: 500;
		text-decoration: none;
	}

	nav a:hover {
		color: var(--ink);
	}

	nav a[aria-current] {
		border-bottom-color: var(--ink);
		color: var(--ink);
	}

	.actions {
		display: flex;
		align-items: center;
		gap: 1.25rem;
		margin-left: auto;
	}

	.actions,
	.settings {
		align-self: stretch;
	}

	.settings {
		display: flex;
		align-items: center;
		color: var(--ink-soft);
		font-weight: 500;
		text-decoration: none;
	}

	.settings:hover,
	.settings[aria-current] {
		color: var(--ink);
	}

	@media (max-width: 34rem) {
		header {
			gap: 1rem;
		}

		.brand > span,
		.wide {
			display: none;
		}

		nav {
			gap: 1rem;
		}

		.actions {
			gap: 0.875rem;
		}
	}

	/* The narrowest phones: close up the gaps so the whole bar still fits. */
	@media (max-width: 23rem) {
		header,
		nav,
		.actions {
			gap: 0.625rem;
		}

		.actions .button {
			padding-inline: 0.625rem;
		}
	}
</style>
