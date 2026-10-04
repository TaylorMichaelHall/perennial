<script lang="ts">
	import '@fontsource-variable/brygada-1918';
	import '@fontsource-variable/hanken-grotesk';
	import '../app.css';

	let { children } = $props();
</script>

<svelte:head>
	<title>Perennial</title>
</svelte:head>

{@render children()}
