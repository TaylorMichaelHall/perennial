<!-- The form for choosing where reminders are sent, and at what time of day. -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { api, messageOf } from '#lib/api.ts';
	import {
		CHANNEL_KINDS,
		MAX_CHANNELS,
		type Channel,
		type ChannelKind,
		type DeliveryStatus,
		type NotificationSettings
	} from '#lib/notifications.ts';
	import { showToast } from '#lib/ui.svelte.ts';

	interface Props {
		settings: NotificationSettings;
		deliveries: DeliveryStatus[];
	}

	let { settings, deliveries }: Props = $props();

	// Reminders follow the clock of whichever device last saved these settings,
	// and link back to the address that device reached the app at.
	const appUrl = window.location.origin;
	const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	const hourFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', timeZone: 'UTC' });
	const hours = Array.from({ length: 24 }, (_, hour) => ({
		hour,
		label: hourFormat.format(Date.UTC(2000, 0, 1, hour))
	}));
	const kinds = Object.keys(CHANNEL_KINDS) as ChannelKind[];

	// The form edits its own copy; nothing changes until it is saved.
	// svelte-ignore state_referenced_locally
	let channels = $state<Channel[]>(structuredClone($state.snapshot(settings.channels)));
	// svelte-ignore state_referenced_locally
	let hour = $state(settings.hour);

	// svelte-ignore state_referenced_locally
	let statuses = $state(deliveries);
	// svelte-ignore state_referenced_locally
	let savedChannels = $state(JSON.stringify(settings.channels));
	async function refreshStatus() {
		try { statuses = await api<DeliveryStatus[]>('GET', '/api/notifications'); } catch { /* Keep the last known status. */ }
	}
	onMount(() => {
		const timer = setInterval(refreshStatus, 30_000);
		return () => clearInterval(timer);
	});
	let error = $state('');
	let saving = $state(false);
	let testing = $state<Channel | null>(null);

	function add() {
		channels.push({ kind: 'discord', fields: {} });
	}

	function remove(channel: Channel) {
		channels = channels.filter((candidate) => candidate !== channel);
	}

	async function save(event: SubmitEvent) {
		event.preventDefault();
		saving = true;
		error = '';
		try {
			await api('PUT', '/api/notifications', { channels, hour, timeZone, appUrl });
			savedChannels = JSON.stringify(channels);
			await refreshStatus();
			showToast('Saved notifications.');
		} catch (cause) {
			error = messageOf(cause);
		}
		saving = false;
	}

	async function test(channel: Channel) {
		testing = channel;
		error = '';
		try {
			await api('POST', '/api/notifications/test', { channel });
			showToast(`Sent a test to ${CHANNEL_KINDS[channel.kind].label}.`);
		} catch (cause) {
			error = messageOf(cause);
		}
		testing = null;
	}
</script>

<form onsubmit={save}>
	<h2>Notifications</h2>
	<p class="about">
		Get a message when a task can be started, a week before it’s due, on the day it’s due, and
		each week it stays overdue. Each one links to the task, where you can snooze it.
	</p>

	{#each channels as channel, index (channel)}
		<fieldset>
			<legend class="visually-hidden">Destination {index + 1}</legend>

			<label class="field">
				<span>Send to</span>
				<select class="input" bind:value={channel.kind}>
					{#each kinds as kind (kind)}
						<option value={kind}>{CHANNEL_KINDS[kind].label}</option>
					{/each}
				</select>
			</label>

			{#each CHANNEL_KINDS[channel.kind].fields as field (field.key)}
				<label class="field">
					<span>{field.label}</span>
					<input
						class="input"
						type={field.type}
						bind:value={channel.fields[field.key]}
						placeholder={'placeholder' in field ? field.placeholder : undefined}
						required={!('optional' in field)}
						autocomplete="off"
					/>
				</label>
			{/each}

			{#if JSON.stringify(channel) === JSON.stringify(JSON.parse(savedChannels)[index])}
				{@const status = statuses[index]}
				<p class="about" aria-live="polite">
					{#if status?.lastError}
						{status.lastError}
						{#if status.nextRetry} Retrying after {new Date(status.nextRetry).toLocaleString()}.{/if}
					{:else if status?.lastSuccess}
						Last delivered {new Date(status.lastSuccess).toLocaleString()}.
					{:else}
						No reminders delivered yet.
					{/if}
				</p>
			{/if}

			<div class="row">
				<button
					type="button"
					class="button quiet"
					disabled={testing === channel}
					onclick={() => test(channel)}
				>
					Send a test
				</button>
				<button type="button" class="button quiet danger" onclick={() => remove(channel)}>
					Remove
				</button>
			</div>
		</fieldset>
	{/each}

	{#if channels.length < MAX_CHANNELS}
		<button type="button" class="button quiet" onclick={add}>
			{channels.length === 0 ? 'Add a destination' : 'Add another destination'}
		</button>
	{/if}

	<label class="field">
		<span>Send at ({timeZone.replaceAll('_', ' ')} time)</span>
		<select class="input" bind:value={hour}>
			{#each hours as option (option.hour)}
				<option value={option.hour}>{option.label}</option>
			{/each}
		</select>
	</label>

	{#if error}
		<p class="form-error" role="alert">{error}</p>
	{/if}

	<button class="button" disabled={saving}>Save notifications</button>
</form>

<style>
	form {
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

	fieldset {
		display: grid;
		gap: 1rem;
		min-width: 0;
		margin: 0;
		padding: 1rem;
		border: 1px solid var(--rule);
		border-radius: var(--radius);
	}

	.row {
		display: flex;
		gap: 0.5rem;
	}

	form > .button {
		justify-self: start;
	}
</style>
