<!--
	A field for a date. With a date format chosen in Settings it is typed in that
	format, with a calendar to pick from; otherwise it is the browser's own.
-->
<script lang="ts">
	import { DATE_ENTRY, entryFormat, formatFullDate, parseDate, type ISODate } from '#lib/dates.ts';

	interface Props {
		/** The date, or an empty string while there isn't a valid one. */
		value: ISODate;
		min?: ISODate;
		max?: ISODate;
		required?: boolean;
	}

	let { value = $bindable(), min, max, required = false }: Props = $props();

	const format = entryFormat();
	const written = (date: ISODate) => (format && date ? formatFullDate(date, format) : '');

	let text = $state(written(value));
	let field = $state<HTMLInputElement>();
	let picker = $state<HTMLInputElement>();

	// Follow a date set from outside, without rewriting one that is being typed.
	$effect(() => {
		if (format && value !== (parseDate(text, format) ?? '')) text = written(value);
	});

	$effect(() => {
		if (!field || !format) return;
		const date = parseDate(text, format);
		let problem = '';
		if (!text.trim()) problem = '';
		else if (!date) problem = `Write the date as ${DATE_ENTRY[format]}.`;
		else if (min && date < min) problem = `Choose ${written(min)} or later.`;
		else if (max && date > max) problem = `Choose ${written(max)} or earlier.`;
		field.setCustomValidity(problem);
	});
</script>

{#if format}
	<span class="date">
		<input
			class="input"
			bind:this={field}
			value={text}
			placeholder={DATE_ENTRY[format]}
			autocomplete="off"
			{required}
			oninput={(event) => {
				text = event.currentTarget.value;
				value = parseDate(text, format) ?? '';
			}}
			onblur={() => {
				if (value) text = written(value);
			}}
		/>
		<button type="button" aria-label="Choose from a calendar" onclick={() => picker?.showPicker()}>
			<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
				<path
					d="M2.5 3.5h11v10h-11zM2.5 6.5h11M5.5 2v3M10.5 2v3"
					fill="none"
					stroke="currentColor"
					stroke-width="1.25"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			</svg>
		</button>
		<!-- Only here to lend its calendar to the button. -->
		<input
			class="picker"
			type="date"
			bind:this={picker}
			{value}
			{min}
			{max}
			tabindex="-1"
			aria-hidden="true"
			onchange={(event) => {
				if (event.currentTarget.value) value = event.currentTarget.value;
			}}
		/>
	</span>
{:else}
	<input class="input" type="date" bind:value {min} {max} {required} />
{/if}

<style>
	.date {
		position: relative;
		display: block;
		/* It sits where a field's label would otherwise set these. */
		font-size: var(--text-body);
		font-weight: 400;
		color: var(--ink);
	}

	.date .input {
		padding-right: 2.5rem;
	}

	button {
		position: absolute;
		inset: 0 0 0 auto;
		display: grid;
		place-items: center;
		width: 2.5rem;
		padding: 0;
		border: 0;
		background: none;
		color: var(--ink-soft);
		cursor: pointer;
	}

	button:hover {
		color: var(--ink);
	}

	.picker {
		position: absolute;
		inset: auto 0 0 auto;
		width: 1px;
		height: 1px;
		padding: 0;
		border: 0;
		opacity: 0;
		pointer-events: none;
	}
</style>
