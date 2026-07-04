<script lang="ts">
	import 'flag-icons/css/flag-icons.min.css';
	import favicon from '$lib/assets/favicon.svg';
	import { onMount } from 'svelte';
	import { applyServerSettings } from '$lib/game.svelte';

	let { data, children } = $props();

	// Apply the server-persisted admin settings (win %, mission rosters) once on
	// the client, so every player plays with the admin's saved rules.
	onMount(() => applyServerSettings(data?.settings));
</script>

<svelte:head>
	<title>buzito</title>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
