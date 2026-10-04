<!--
	The page shown before the app itself: first-run setup and sign-in.
	Both collect a password and post it to an endpoint.
-->
<script lang="ts">
	import { api, messageOf } from '#lib/api.ts';
	import Mark from '#lib/components/Mark.svelte';
	import { MIN_PASSWORD_LENGTH } from '#lib/limits.ts';

	interface Props {
		mode: 'setup' | 'login';
	}

	let { mode }: Props = $props();

	let password = $state('');
	let confirmation = $state('');
	let error = $state('');
	let submitting = $state(false);

	/** The page that was asked for before signing in, if it is one of ours. */
	function destination(): string {
		const next = new URLSearchParams(window.location.search).get('next') ?? '';
		return /^\/(?!\/)/.test(next) ? next : '/';
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (mode === 'setup' && password !== confirmation) {
			error = 'Those passwords don’t match.';
			return;
		}

		submitting = true;
		error = '';
		try {
			await api('POST', `/api/${mode}`, { password });
			// A full page load, so the app starts with the new session cookie.
			window.location.assign(destination());
		} catch (cause) {
			error = messageOf(cause);
			submitting = false;
		}
	}
</script>

<main>
	<form onsubmit={submit}>
		<p class="brand"><Mark /> Perennial</p>

		{#if mode === 'setup'}
			<h1>Choose a password</h1>
			<p class="lede">
				It protects everything you keep here. You’ll use it to sign in on each device.
			</p>
		{:else}
			<h1>Welcome back</h1>
		{/if}

		<label class="field">
			<span>Password</span>
			<!-- svelte-ignore a11y_autofocus -->
			<input
				class="input"
				type="password"
				bind:value={password}
				autocomplete={mode === 'setup' ? 'new-password' : 'current-password'}
				minlength={mode === 'setup' ? MIN_PASSWORD_LENGTH : undefined}
				required
				autofocus
			/>
		</label>

		{#if mode === 'setup'}
			<label class="field">
				<span>Password again</span>
				<input
					class="input"
					type="password"
					bind:value={confirmation}
					autocomplete="new-password"
					required
				/>
			</label>
		{/if}

		{#if error}
			<p class="form-error" role="alert">{error}</p>
		{/if}

		<button class="button" disabled={submitting}>
			{mode === 'setup' ? 'Set password' : 'Sign in'}
		</button>
	</form>
</main>

<style>
	main {
		display: grid;
		min-height: 100dvh;
		padding: var(--page-margin);
		place-items: center;
	}

	form {
		display: grid;
		gap: 1.25rem;
		width: min(100%, 22rem);
		/* Sit a little above centre, where the eye rests. */
		margin-bottom: 12vh;
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		font-weight: 600;
		color: var(--ink-soft);
	}

	h1 {
		font-size: var(--text-display);
	}

	.lede {
		margin-top: -0.5rem;
		color: var(--ink-soft);
	}

	.button {
		justify-self: start;
	}
</style>
