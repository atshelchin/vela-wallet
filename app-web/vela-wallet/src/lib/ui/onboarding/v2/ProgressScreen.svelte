<script lang="ts">
	/**
	 * Deriving the address.
	 *
	 * Three task rows and a percentage, both computed from the stage the core
	 * reported — never from elapsed time. A bar that advances on a timer tells
	 * the person something the wallet does not know, and the one moment they
	 * are most owed the truth is while their key set is being frozen.
	 *
	 * This is why spec 014's elapsed-seconds ring is gone from the create flow:
	 * the percentage is the "still working" affordance the v2 design chose.
	 */
	import { PROGRESS_TASKS, type ProgressPosition } from '$lib/onboarding/core/copy';

	interface Props {
		position: ProgressPosition;
		keyCount: number;
		strings: (key: string, params?: Record<string, string | number>) => string;
	}

	let { position, keyCount, strings }: Props = $props();

	function mark(index: number): string {
		if (index < position.activeTask) return '✓';
		return index === position.activeTask ? '●' : '○';
	}
</script>

<section class="screen">
	<header class="intro">
		<h1 class="title">{strings('onboarding.create.progressTitle')}</h1>
		<p class="subtitle">
			{strings('onboarding.create.progressSubtitle', { count: keyCount })}
		</p>
	</header>

	<div class="meter">
		<div class="meterhead">
			<span class="meterlabel">{strings('onboarding.create.progressMeterLabel')}</span>
			<span class="percent">{position.percent}%</span>
		</div>
		<div
			class="track"
			role="progressbar"
			aria-valuemin={0}
			aria-valuemax={100}
			aria-valuenow={position.percent}
			aria-label={strings('onboarding.create.progressMeterLabel')}
		>
			<div class="fill" style="width: {position.percent}%"></div>
		</div>
	</div>

	<ul class="tasks">
		{#each PROGRESS_TASKS as task, index (task)}
			<li
				class="task"
				data-state={index < position.activeTask
					? 'done'
					: index === position.activeTask
						? 'active'
						: 'pending'}
			>
				<span class="mark" aria-hidden="true">{mark(index)}</span>
				<span class="what">{strings(task)}</span>
			</li>
		{/each}
	</ul>
</section>

<style>
	.screen {
		display: flex;
		flex: 1;
		flex-direction: column;
		gap: var(--space-4xl);
	}

	.intro {
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
	}

	.title {
		margin: 0;
		color: var(--color-fg-base);
		font-size: var(--text-3xl);
		font-weight: var(--weight-bold);
		line-height: var(--leading-tight);
		letter-spacing: -0.015em;
	}

	.subtitle {
		margin: 0;
		color: var(--color-fg-muted);
		font-size: var(--text-lg);
		line-height: var(--leading-normal);
	}

	.meter {
		display: flex;
		flex-direction: column;
		gap: var(--space-lg);
	}

	.meterhead {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		font-family: var(--font-mono);
	}

	.meterlabel {
		color: var(--color-fg-muted);
		font-size: var(--text-sm);
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.percent {
		color: var(--color-fg-base);
		font-size: var(--text-lg);
		font-weight: var(--weight-medium);
	}

	.track {
		height: var(--space-sm);
		border-radius: var(--radius-full);
		background: var(--color-border-base);
		overflow: hidden;
	}

	.fill {
		height: 100%;
		border-radius: var(--radius-full);
		background: var(--color-accent-base);
		transition: width var(--motion-duration-normal) ease;
	}

	.tasks {
		display: flex;
		flex-direction: column;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.task {
		display: flex;
		gap: var(--space-lg);
		align-items: center;
		padding-block: var(--space-lg);
		border-bottom: var(--border-hairline) solid var(--color-border-base);
		font-size: var(--text-base);
		font-weight: var(--weight-medium);
	}

	.mark {
		flex: 0 0 var(--icon-base);
		font-size: var(--text-sm);
	}

	.task[data-state='done'] {
		color: var(--color-fg-muted);
	}

	.task[data-state='done'] .mark {
		color: var(--color-success-base);
	}

	.task[data-state='active'] {
		color: var(--color-fg-base);
	}

	.task[data-state='active'] .mark {
		color: var(--color-accent-base);
	}

	.task[data-state='pending'] {
		color: var(--color-fg-muted);
	}

	.task[data-state='pending'] .mark {
		color: var(--color-fg-subtle);
	}

	@media (prefers-reduced-motion: reduce) {
		.fill {
			transition: none;
		}
	}
</style>
