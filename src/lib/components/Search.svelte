<!-- Narrows the tasks on show to those matching what is typed, or carrying a tag. -->
<script lang="ts">
	import { tagsOf, type Task } from '#lib/tasks.ts';
	import { ui } from '#lib/ui.svelte.ts';

	interface Props {
		tasks: Task[];
	}

	let { tasks }: Props = $props();

	const tags = $derived(tagsOf(tasks));
	const words = $derived(ui.search.toLowerCase().split(/\s+/).filter(Boolean));

	/** Adds the tag to the search, or takes it out if it is already there. */
	function toggle(tag: string) {
		const word = `#${tag}`;
		const rest = words.filter((candidate) => candidate !== word);
		ui.search = (rest.length < words.length ? rest : [...words, word]).join(' ');
	}
</script>

<search>
	<input
		class="input"
		type="search"
		bind:value={ui.search}
		placeholder="Search"
		aria-label="Search tasks"
	/>
	{#if tags.length > 0}
		<ul aria-label="Tags">
			{#each tags as tag (tag)}
				<li>
					<button aria-pressed={words.includes(`#${tag}`)} onclick={() => toggle(tag)}>
						#{tag}
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</search>

<style>
	search {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 0.75rem;
	}

	.input {
		width: min(100%, 16rem);
	}

	ul {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	button {
		min-height: 2rem;
		padding: 0 0.625rem;
		border: 1px solid var(--rule);
		border-radius: 1rem;
		background: none;
		color: var(--ink-soft);
		font-size: var(--text-small);
		font-weight: 500;
	}

	button:hover {
		border-color: var(--ink-soft);
	}

	button[aria-pressed='true'] {
		border-color: var(--ink);
		background: var(--ink);
		color: var(--paper);
	}
</style>
