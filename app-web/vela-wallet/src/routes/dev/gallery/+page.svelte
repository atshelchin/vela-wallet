<script lang="ts">
	/**
	 * Onboarding state gallery (spec 014, US1) — dev-only. Lists all 34
	 * fixture codes grouped Create / Login (E10 in both groups), renders the
	 * selection through the REAL panels inside the real Sheet (mobile sim)
	 * or as the inline panel (desktop/web-wide sim), with theme and locale
	 * switches. Actions route to a log-only sink (FR-011).
	 */
	import type { PageProps } from './$types';
	import type {
		ActionId,
		CreatePanelState,
		LoginPanelState,
		StringResolver
	} from '$lib/onboarding/states';
	import { scaffoldTitleI18nKey } from '$lib/onboarding/outcomes';
	import { fixturesForFlow } from '$lib/onboarding/fixtures';
	import { fillTemplate } from '$lib/i18n/fill';
	import CreatePanel from '$lib/ui/onboarding/CreatePanel.svelte';
	import LoginPanel from '$lib/ui/onboarding/LoginPanel.svelte';
	import Sheet from '$lib/ui/onboarding/Sheet.svelte';

	let { data }: PageProps = $props();

	type Flow = 'create' | 'login';

	const groups: { flow: Flow; name: string }[] = [
		{ flow: 'create', name: 'Create' },
		{ flow: 'login', name: 'Login' }
	];

	let locale = $state('zh');
	let theme = $state<'dark' | 'light'>('dark');
	let container = $state<'panel' | 'sheet'>('panel');
	let selectedFlow = $state<Flow>('create');
	let selectedCode = $state('A1');
	let sheetOpen = $state(true);
	let lastAction = $state('—');
	let sheetInstance = $state<{ requestClose: () => void }>();

	// The gallery is the theme host: it stamps data-theme on <html> and
	// restores the default (media-query driven) on leave.
	$effect(() => {
		document.documentElement.dataset.theme = theme;
		return () => {
			delete document.documentElement.dataset.theme;
		};
	});

	const selected = $derived(
		fixturesForFlow(selectedFlow).find((fixture) => fixture.code === selectedCode) ??
			fixturesForFlow(selectedFlow)[0]
	);

	const createState = $derived(
		selectedFlow === 'create' ? (selected.state as CreatePanelState) : null
	);
	const loginState = $derived(
		selectedFlow === 'login' ? (selected.state as LoginPanelState) : null
	);

	/** Nested-object walk; also accepts flat dotted keys. */
	function lookup(catalog: unknown, key: string): string | undefined {
		if (catalog === null || typeof catalog !== 'object') return undefined;
		const flat = (catalog as Record<string, unknown>)[key];
		if (typeof flat === 'string') return flat;
		let node: unknown = catalog;
		for (const part of key.split('.')) {
			if (node === null || typeof node !== 'object') return undefined;
			node = (node as Record<string, unknown>)[part];
		}
		return typeof node === 'string' ? node : undefined;
	}

	// Falls back locale → en → the key itself: NEW corpus keys may still be
	// landing in parallel and must not break the gallery.
	const strings: StringResolver = $derived(
		(key: string, params?: Record<string, string | number>) =>
			fillTemplate(
				lookup(data.catalogs[locale], key) ?? lookup(data.catalogs['en'], key) ?? key,
				params
			)
	);

	const sheetLabel = $derived(strings(scaffoldTitleI18nKey(selected.state, selectedFlow)));

	function select(flow: Flow, code: string) {
		selectedFlow = flow;
		selectedCode = code;
		sheetOpen = true;
	}

	function onPanelAction(id: ActionId) {
		lastAction = `${selected.code} → ${id}`;
		console.log('[gallery action]', selected.code, id);
		if (id === 'close' && container === 'sheet') sheetInstance?.requestClose();
	}
</script>

<svelte:head>
	<title>Onboarding State Gallery</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="gallery">
	<aside class="sidebar">
		<h1 class="heading">Onboarding states</h1>
		{#each groups as group (group.flow)}
			<section class="group">
				<h2 class="groupName">{group.name}</h2>
				<div class="codes">
					{#each fixturesForFlow(group.flow) as fixture (group.flow + fixture.code)}
						<button
							class="code"
							class:active={selectedFlow === group.flow && selectedCode === fixture.code}
							type="button"
							onclick={() => select(group.flow, fixture.code)}
						>
							{fixture.code}
						</button>
					{/each}
				</div>
			</section>
		{/each}
	</aside>

	<main class="stage">
		<div class="controls">
			<div class="control">
				<span class="controlLabel">Theme</span>
				<button
					class="chip"
					class:on={theme === 'dark'}
					type="button"
					onclick={() => (theme = 'dark')}>dark</button
				>
				<button
					class="chip"
					class:on={theme === 'light'}
					type="button"
					onclick={() => (theme = 'light')}>light</button
				>
			</div>
			<div class="control">
				<span class="controlLabel">Locale</span>
				{#each data.locales as availableLocale (availableLocale)}
					<button
						class="chip"
						class:on={locale === availableLocale}
						type="button"
						onclick={() => (locale = availableLocale)}>{availableLocale}</button
					>
				{/each}
			</div>
			<div class="control">
				<span class="controlLabel">Container</span>
				<button
					class="chip"
					class:on={container === 'panel'}
					type="button"
					onclick={() => (container = 'panel')}>panel</button
				>
				<button
					class="chip"
					class:on={container === 'sheet'}
					type="button"
					onclick={() => {
						container = 'sheet';
						sheetOpen = true;
					}}>sheet</button
				>
			</div>
			<p class="sink" aria-live="polite">action: {lastAction}</p>
		</div>

		{#if container === 'panel'}
			<div class="panelSim">
				{#if createState !== null}
					<CreatePanel state={createState} {strings} onAction={onPanelAction} />
				{:else if loginState !== null}
					<LoginPanel state={loginState} {strings} onAction={onPanelAction} />
				{/if}
			</div>
		{:else if sheetOpen}
			<Sheet bind:this={sheetInstance} label={sheetLabel} onClose={() => (sheetOpen = false)}>
				{#if createState !== null}
					<CreatePanel state={createState} {strings} onAction={onPanelAction} showHandle />
				{:else if loginState !== null}
					<LoginPanel state={loginState} {strings} onAction={onPanelAction} showHandle />
				{/if}
			</Sheet>
		{:else}
			<button class="chip reopen" type="button" onclick={() => (sheetOpen = true)}>
				Reopen sheet — {selected.code}
			</button>
		{/if}
	</main>
</div>

<style>
	.gallery {
		display: flex;
		min-height: 100dvh;
		align-items: stretch;
	}

	.sidebar {
		flex: none;
		width: calc(var(--layout-frameW) / 2);
		padding: var(--space-3xl);
		border-inline-end: var(--border-hairline) solid var(--color-border-base);
		overflow-y: auto;
	}

	.heading {
		margin: 0 0 var(--space-2xl);
		font-size: var(--text-lg);
		font-weight: var(--weight-semibold);
		color: var(--color-fg-base);
	}

	.group {
		margin-bottom: var(--space-3xl);
	}

	.groupName {
		margin: 0 0 var(--space-lg);
		font-size: var(--text-sm);
		font-weight: var(--weight-semibold);
		letter-spacing: var(--letterSpacing-sectionLabel);
		text-transform: uppercase;
		color: var(--color-fg-subtle);
	}

	.codes {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-md);
	}

	.code {
		min-width: var(--size-control-sm);
		padding: var(--space-md) var(--space-lg);
		border: var(--border-hairline) solid var(--color-border-base);
		border-radius: var(--radius-md);
		background: none;
		color: var(--color-fg-muted);
		font-family: var(--font-mono);
		font-size: var(--text-base);
		cursor: pointer;
	}

	.code.active {
		border-color: var(--color-accent-base);
		color: var(--color-fg-base);
	}

	.stage {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-3xl);
		padding: var(--space-3xl);
	}

	.controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2xl);
		width: 100%;
	}

	.control {
		display: flex;
		align-items: center;
		gap: var(--space-md);
	}

	.controlLabel {
		font-size: var(--text-sm);
		color: var(--color-fg-subtle);
	}

	.chip {
		padding: var(--space-md) var(--space-xl);
		border: var(--border-hairline) solid var(--color-border-base);
		border-radius: var(--radius-full);
		background: none;
		color: var(--color-fg-muted);
		font-family: var(--font-ui);
		font-size: var(--text-base);
		cursor: pointer;
	}

	.chip.on {
		border-color: var(--color-accent-base);
		color: var(--color-fg-base);
	}

	.sink {
		margin: 0;
		margin-inline-start: auto;
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		color: var(--color-fg-subtle);
	}

	.panelSim {
		width: 100%;
		max-width: var(--layout-frameW);
		border: var(--border-hairline) solid var(--color-border-base);
		border-radius: var(--radius-xl);
		background: var(--color-bg-raised);
		overflow: hidden;
	}

	.reopen {
		align-self: center;
	}
</style>
