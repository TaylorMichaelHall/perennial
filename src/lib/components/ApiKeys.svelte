<!-- Mints and revokes the API keys that let scripts and agents manage tasks. -->
<script lang="ts">
	import { calendar } from '#lib/calendar.svelte.ts';
	import { refreshAll } from '$app/navigation';
	import { api, messageOf } from '#lib/api.ts';
	import DateField from '#lib/components/DateField.svelte';
	import { addDays, endOfLocalDay, formatDate, localDate } from '#lib/dates.ts';
	import type { ApiKey, MintedApiKey } from '#lib/keys.ts';
	import { MAX_KEY_NAME_LENGTH } from '#lib/limits.ts';
	import { showToast } from '#lib/ui.svelte.ts';

	interface Props {
		keys: ApiKey[];
	}

	let { keys }: Props = $props();

	const referenceUrl = `${window.location.origin}/api`;
	// The clipboard is only available over HTTPS or on localhost.
	const canCopy = navigator.clipboard !== undefined;

	let name = $state('');
	let expiresOn = $state('');
	let error = $state('');
	let saving = $state(false);
	/** The key just minted, whose token is on show until the page is left. */
	let minted = $state<MintedApiKey | null>(null);

	function expiryOf(key: ApiKey): string {
		if (key.expires_at === null) return 'Never expires';
		// A key works through its last day, so that day is the one before it lapses.
		const lastDay = formatDate(localDate(key.expires_at - 1), calendar.today);
		return key.expires_at <= Date.now() ? `Expired ${lastDay}` : `Expires after ${lastDay}`;
	}

	function usageOf(key: ApiKey): string {
		return key.last_used_at === null
			? 'Never used'
			: `Last used ${formatDate(localDate(key.last_used_at), calendar.today)}`;
	}

	async function mint(event: SubmitEvent) {
		event.preventDefault();
		saving = true;
		error = '';
		try {
			minted = await api<MintedApiKey>('POST', '/api/keys', {
				name,
				expires_at: expiresOn ? endOfLocalDay(expiresOn) : null
			});
			name = '';
			expiresOn = '';
			await refreshAll();
		} catch (cause) {
			error = messageOf(cause);
		}
		saving = false;
	}

	async function revoke(key: ApiKey) {
		if (!confirm(`Revoke “${key.name}”? Anything using it will stop working.`)) return;
		error = '';
		try {
			await api('DELETE', `/api/keys/${key.id}`);
			if (minted?.id === key.id) minted = null;
			await refreshAll();
			showToast('Key revoked.');
		} catch (cause) {
			error = messageOf(cause);
		}
	}

	async function copy(token: string) {
		await navigator.clipboard.writeText(token);
		showToast('Copied the key.');
	}
</script>

<section>
	<h2>API keys</h2>
	<p class="about">
		A key lets a script or an AI agent read and manage your tasks without your password. Point it
		at <a href="/api" target="_blank">{referenceUrl}</a>, which describes everything a key can do.
	</p>

	{#if minted}
		<div class="minted" role="status">
			<label class="field">
				<span>Your new key, “{minted.name}”</span>
				<input
					class="input token"
					readonly
					value={minted.token}
					onfocus={(event) => event.currentTarget.select()}
				/>
			</label>
			<p>Copy it now. It won’t be shown again.</p>
			{#if canCopy}
				<button type="button" class="button quiet" onclick={() => copy(minted!.token)}>Copy</button>
			{/if}
		</div>
	{/if}

	{#if keys.length > 0}
		<ul>
			{#each keys as key (key.id)}
				<li>
					<div>
						<strong>{key.name}</strong>
						<p class="detail">{expiryOf(key)} · {usageOf(key)}</p>
					</div>
					<button type="button" class="button quiet danger" onclick={() => revoke(key)}>
						Revoke
					</button>
				</li>
			{/each}
		</ul>
	{/if}

	<form onsubmit={mint}>
		<label class="field">
			<span>Name</span>
			<input
				class="input"
				bind:value={name}
				placeholder="What will use this key"
				maxlength={MAX_KEY_NAME_LENGTH}
				autocomplete="off"
				required
			/>
		</label>
		<label class="field">
			<span>Expires after (optional)</span>
			<DateField bind:value={expiresOn} min={addDays(calendar.today, 1)} />
		</label>

		{#if error}
			<p class="form-error" role="alert">{error}</p>
		{/if}

		<button class="button" disabled={saving}>Create key</button>
	</form>
</section>

<style>
	section,
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

	.about a {
		overflow-wrap: anywhere;
	}

	.minted {
		display: grid;
		gap: 0.75rem;
		padding: 1rem;
		border: 1px solid var(--sage);
		border-radius: var(--radius);
	}

	.token {
		font-family: ui-monospace, monospace;
		font-size: var(--text-small);
	}

	ul {
		display: grid;
		margin: 0;
		padding: 0;
		list-style: none;
		border-top: 1px solid var(--rule);
	}

	li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.75rem 0;
		border-bottom: 1px solid var(--rule);
	}

	strong {
		font-weight: 600;
		overflow-wrap: anywhere;
	}

	.detail {
		font-size: var(--text-small);
		color: var(--ink-soft);
	}

	.button {
		justify-self: start;
	}
</style>
