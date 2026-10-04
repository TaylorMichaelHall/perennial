<!-- A brief confirmation at the foot of the screen, with an optional undo. -->
<script lang="ts">
	import { dismissToast, type Toast } from '#lib/ui.svelte.ts';

	interface Props {
		toast: Toast;
	}

	let { toast }: Props = $props();

	const VISIBLE_MS = 7000;

	$effect(() => {
		// Reading `toast` restarts the timer whenever a new toast replaces this one.
		void toast;
		const timer = setTimeout(dismissToast, VISIBLE_MS);
		return () => clearTimeout(timer);
	});
</script>

<div class="toast" role="status">
	<span>{toast.message}</span>
	{#if toast.undo}
		<button onclick={toast.undo}>Undo</button>
	{/if}
</div>

<style>
	.toast {
		position: fixed;
		bottom: 1.5rem;
		left: 50%;
		z-index: 20;
		display: flex;
		align-items: center;
		gap: 1rem;
		width: max-content;
		max-width: calc(100vw - 2rem);
		padding: 0.75rem 1.125rem;
		border-radius: var(--radius);
		background: var(--ink);
		color: var(--paper);
		translate: -50% 0;
		animation: rise 180ms ease-out;
	}

	button {
		/* Padding the toast's own spacing absorbs, for a larger target to tap. */
		margin: -0.75rem -0.625rem;
		padding: 0.75rem 0.625rem;
		border: 0;
		background: none;
		color: inherit;
		font-weight: 700;
		text-decoration: underline;
		text-underline-offset: 0.2em;
	}

	@keyframes rise {
		from {
			opacity: 0;
			translate: -50% 0.5rem;
		}
	}
</style>
