<!--
	A small bar showing how far through its window a task is. The bar spans
	the window from the day it opens to the day it is due; the filled part is
	the time already gone. A hard deadline ends in a firm stop.
-->
<script lang="ts">
	import { daysBetween, type ISODate } from '#lib/dates.ts';
	import type { Status, Window } from '#lib/tasks.ts';

	interface Props {
		window: Window;
		status: Status;
		hard: boolean;
		today: ISODate;
	}

	let { window, status, hard, today }: Props = $props();

	const elapsed = $derived.by(() => {
		const length = daysBetween(window.opens_on, window.due_on) + 1;
		const gone = daysBetween(window.opens_on, today) + 1;
		return Math.min(1, Math.max(0, gone / length));
	});
</script>

<div class="meter {status}" class:hard aria-hidden="true">
	<div class="elapsed" style:width="{elapsed * 100}%"></div>
</div>

<style>
	.meter {
		position: relative;
		height: 6px;
		border-radius: 3px;
		background: var(--rule);
	}

	.elapsed {
		height: 100%;
		border-radius: inherit;
		background: var(--sage);
	}

	.open .elapsed {
		background: var(--ripe);
	}

	.overdue .elapsed {
		background: var(--beet);
	}

	.hard {
		border-start-end-radius: 0;
		border-end-end-radius: 0;
	}

	.hard::after {
		content: '';
		position: absolute;
		inset: -3px 0 -3px auto;
		width: 2px;
		background: var(--ink);
	}
</style>
