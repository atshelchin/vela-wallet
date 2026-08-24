<script lang="ts">
	/**
	 * Labeled account-name field: label → input → (error) red inline
	 * over-length line. The error appears WITHOUT shifting the field above it.
	 *
	 * The v2 design gives the label the small uppercase treatment it uses for
	 * every field label, and drops the helper caption entirely — the
	 * placeholder is an EXAMPLE of a good answer, which explains the field
	 * better than a sentence under it. `hint` is therefore optional.
	 */
	interface Props {
		/** Resolved strings. */
		label: string;
		placeholder: string;
		hint?: string;
		/** Present → error styling + red inline line (A3). */
		errorText?: string;
		/** Initial value from state; edits stay local, reported via oninput. */
		value?: string;
		oninput?: (value: string) => void;
	}

	let { label, placeholder, hint, errorText, value = '', oninput }: Props = $props();

	const id = $props.id();

	// Initial value by design: edits are local visual state (FR-011); the
	// panel re-keys this atom per state.
	// svelte-ignore state_referenced_locally
	let text = $state(value);

	const hasError = $derived(errorText !== undefined);
</script>

<div class="field">
	<label class="label" for={id}>{label}</label>
	<input
		class="input"
		class:error={hasError}
		{id}
		type="text"
		{placeholder}
		autocomplete="off"
		spellcheck="false"
		aria-invalid={hasError}
		aria-describedby={[hasError ? `${id}-error` : null, hint !== undefined ? `${id}-hint` : null]
			.filter(Boolean)
			.join(' ') || undefined}
		bind:value={text}
		oninput={() => oninput?.(text)}
	/>
	{#if errorText !== undefined}
		<p class="errorline" id="{id}-error">{errorText}</p>
	{/if}
	{#if hint !== undefined}
		<p class="hint" id="{id}-hint">{hint}</p>
	{/if}
</div>

<style>
	.field {
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
	}

	.input:focus-visible {
		border-color: var(--color-accent-base);
		outline: none;
	}

	.label {
		color: var(--color-fg-muted);
		font-size: var(--text-sm);
		font-weight: var(--weight-semibold);
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.input {
		width: 100%;
		height: var(--size-control-lg);
		padding-inline: var(--space-xl);
		background: var(--color-bg-sunken);
		border: var(--border-hairline) solid var(--color-border-base);
		border-radius: var(--radius-lg);
		color: var(--color-fg-base);
		font-family: var(--font-ui);
		font-size: var(--text-lg);
	}

	.input::placeholder {
		color: var(--color-fg-subtle);
	}

	.input.error {
		border-color: var(--color-error-base);
	}

	.errorline {
		margin: 0;
		color: var(--color-error-base);
		font-size: var(--text-base);
	}

	.hint {
		margin: 0;
		color: var(--color-fg-muted);
		font-size: var(--text-base);
		line-height: var(--leading-normal);
	}
</style>
