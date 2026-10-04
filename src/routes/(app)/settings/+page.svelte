<script lang="ts">
	import { api, messageOf } from '#lib/api.ts';
	import ApiKeys from '#lib/components/ApiKeys.svelte';
	import Backups from '#lib/components/Backups.svelte';
	import DateFormatSetting from '#lib/components/DateFormatSetting.svelte';
	import DataTransfer from '#lib/components/DataTransfer.svelte';
	import NotificationSettings from '#lib/components/NotificationSettings.svelte';
	import { MIN_PASSWORD_LENGTH } from '#lib/limits.ts';
	import { showToast } from '#lib/ui.svelte.ts';

	let { data } = $props();

	let current = $state('');
	let password = $state('');
	let error = $state('');
	let saving = $state(false);

	async function changePassword(event: SubmitEvent) {
		event.preventDefault();
		saving = true;
		error = '';
		try {
			await api('POST', '/api/password', { current, password });
			current = '';
			password = '';
			showToast('Password changed. Other devices have been signed out.');
		} catch (cause) {
			error = messageOf(cause);
		}
		saving = false;
	}

	async function signOut() {
		await api('POST', '/api/logout');
		window.location.assign('/login');
	}
</script>

<main>
	<h1>Settings</h1>

	<NotificationSettings settings={data.notifications} deliveries={data.deliveries} />

	<DateFormatSetting format={data.dateFormat} />

	<ApiKeys keys={data.apiKeys} />

	<DataTransfer />

	<Backups status={data.backups} />

	<form onsubmit={changePassword}>
		<h2>Change password</h2>
		<label class="field">
			<span>Current password</span>
			<input
				class="input"
				type="password"
				bind:value={current}
				autocomplete="current-password"
				required
			/>
		</label>
		<label class="field">
			<span>New password</span>
			<input
				class="input"
				type="password"
				bind:value={password}
				autocomplete="new-password"
				minlength={MIN_PASSWORD_LENGTH}
				required
			/>
		</label>
		{#if error}
			<p class="form-error" role="alert">{error}</p>
		{/if}
		<button class="button" disabled={saving}>Change password</button>
	</form>

	<section>
		<h2>This device</h2>
		<button class="button quiet" onclick={signOut}>Sign out</button>
	</section>
</main>

<style>
	main {
		display: grid;
		gap: 3rem;
		max-width: 50rem;
		margin: 0 auto;
		padding: clamp(2rem, 6vw, 4rem) var(--page-margin) 6rem;
	}

	h1 {
		font-size: var(--text-display);
	}

	h2 {
		font-size: var(--text-large);
	}

	form,
	section {
		display: grid;
		gap: 1.25rem;
		max-width: 22rem;
	}

	.button {
		justify-self: start;
	}
</style>
