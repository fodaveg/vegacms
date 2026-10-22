<script lang="ts">
	/** Conserva el borrador ante fallos de descarga y cancela cargas de un esquema ya reemplazado. */
	import type { Component } from 'svelte';
	import { getVegaContext } from '$lib/app-context';
	import { mediaFoldersState } from './media-folders';
	import { loadMediaFoldersComponent } from './media-folders-loader';
	type Props = {
		value?: string | null;
		onChange: (value: string | null) => void;
		includeAll?: boolean;
		disabled?: boolean;
	};
	let { value = null, onChange, includeAll = false, disabled = false }: Props = $props();
	const ctx = getVegaContext();
	let Loaded = $state<Component<Props> | null>(null),
		failed = $state(false),
		loading = $state(false),
		attempt = $state(0);
	$effect(() => {
		void attempt;
		Loaded = null;
		failed = false;
		loading = false;
		if (mediaFoldersState(ctx.model.types.map((type) => type.schema)) !== 'ready') return;
		let active = true;
		loading = true;
		void loadMediaFoldersComponent()
			.then((module) => {
				if (active) Loaded = module.default;
			})
			.catch(() => {
				if (active) failed = true;
			})
			.finally(() => {
				if (active) loading = false;
			});
		return () => {
			active = false;
		};
	});
</script>

{#if loading}<p role="status">{ctx.t('media.folders.loading')}</p>{/if}
{#if failed}<p role="alert">
		{ctx.t('media.folders.loadError')}
		<button
			type="button"
			onclick={() => {
				attempt += 1;
			}}>{ctx.t('common.retry')}</button
		>
	</p>{/if}
{#if Loaded}<Loaded
		value={value ?? (includeAll ? null : 'none')}
		{onChange}
		{includeAll}
		{disabled}
	/>{/if}
