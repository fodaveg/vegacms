<script lang="ts">
	/** Carga por demanda: carpetas completas, administración plana y selector comparten el puerto. */
	import { onMount } from 'svelte';
	import { getVegaContext } from '$lib/app-context';
	import { VegaError } from '$lib/backend';
	import { loadMediaFolders, normalizeMediaFolderName, type MediaFolder } from './media-folders';
	let {
		value = null,
		onChange,
		onLoaded,
		manage = false,
		includeAll = true,
		disabled = false
	}: {
		value?: string | null;
		onChange: (value: string | null) => void;
		onLoaded?: (folders: MediaFolder[]) => void;
		manage?: boolean;
		includeAll?: boolean;
		disabled?: boolean;
	} = $props();
	const ctx = getVegaContext();
	let folders = $state<MediaFolder[]>([]);
	let loading = $state(true),
		busy = $state(false),
		error = $state(''),
		nameError = $state('');
	let editing = $state<string | null | undefined>(undefined),
		name = $state('');
	let deleting = $state<MediaFolder | null>(null),
		count = $state<number | null>(null);
	let dialog = $state<HTMLDialogElement>();
	const scope = $props.id();
	async function load() {
		loading = true;
		error = '';
		try {
			folders = await loadMediaFolders(ctx.port);
			onLoaded?.(folders);
			if (value && value !== 'none' && !folders.some((folder) => folder.id === value)) {
				onChange(includeAll ? null : 'none');
				ctx.feedback.toast(ctx.t('media.folders.disappeared'), { kind: 'info' });
			}
		} catch {
			error = ctx.t('media.folders.loadError');
			if (includeAll) onChange(null);
		} finally {
			loading = false;
		}
	}
	export function refresh() {
		return load();
	}
	onMount(() => {
		void load();
	});
	async function saveName(event: SubmitEvent) {
		event.preventDefault();
		if (busy) return;
		busy = true;
		nameError = '';
		try {
			const input = { name: normalizeMediaFolderName(name) };
			const result = editing
				? await ctx.port.update('vega_media_folders', editing, input)
				: await ctx.port.create('vega_media_folders', input);
			editing = undefined;
			await load();
			onChange(result.id);
		} catch (cause) {
			const fieldError = cause instanceof VegaError ? cause.fieldErrors?.name : undefined;
			nameError =
				fieldError?.code === 'vega_folder_name'
					? ctx.t('media.folders.invalidName')
					: fieldError?.code === 'validation_not_unique'
						? ctx.t('media.folders.duplicateName')
						: cause instanceof VegaError
							? (fieldError?.message ?? cause.message)
							: ctx.t('media.folders.saveError');
		} finally {
			busy = false;
		}
	}
	async function requestDelete(folder: MediaFolder) {
		deleting = folder;
		count = null;
		error = '';
		dialog?.showModal();
		try {
			count = (
				await ctx.port.list('vega_media', {
					page: 1,
					perPage: 1,
					filter: { kind: 'cond', field: 'folder', op: 'eq', value: folder.id }
				})
			).totalItems;
		} catch {
			error = ctx.t('media.folders.countError');
		}
	}
	function closeDelete() {
		if (busy) return;
		dialog?.close();
		deleting = null;
	}
	async function deleteFolder() {
		if (!deleting || count === null || busy) return;
		busy = true;
		try {
			await ctx.port.delete('vega_media_folders', deleting.id);
			dialog?.close();
			deleting = null;
			await load();
			onChange('none');
			ctx.feedback.toast(ctx.t('media.folders.deleted'), { kind: 'success' });
		} catch {
			error = ctx.t('media.folders.saveError');
		} finally {
			busy = false;
		}
	}
</script>

<div class:manage data-media-folders>
	{#if loading}<p aria-live="polite">{ctx.t('media.folders.loading')}</p>{/if}
	{#if error}<p role="alert">
			{error} <button type="button" onclick={() => void load()}>{ctx.t('common.retry')}</button>
		</p>{/if}
	<label for={`${scope}-folder`}>{ctx.t('media.folders.label')}</label>
	<select
		id={`${scope}-folder`}
		value={value ?? ''}
		disabled={disabled || loading || busy}
		onchange={(event) => onChange(event.currentTarget.value || null)}
	>
		{#if includeAll}<option value="">{ctx.t('media.folders.all')}</option>{/if}
		<option value="none">{ctx.t('media.folders.none')}</option>
		{#each folders as folder (folder.id)}<option value={folder.id}>{folder.name}</option>{/each}
	</select>
	{#if manage}
		<nav aria-label={ctx.t('media.folders.label')}>
			<button
				type="button"
				aria-current={value === null ? 'true' : undefined}
				onclick={() => onChange(null)}>{ctx.t('media.folders.all')}</button
			>
			<button
				type="button"
				aria-current={value === 'none' ? 'true' : undefined}
				onclick={() => onChange('none')}>{ctx.t('media.folders.none')}</button
			>
			{#each folders as folder (folder.id)}
				<div class="folder">
					<button
						type="button"
						aria-current={value === folder.id ? 'true' : undefined}
						onclick={() => onChange(folder.id)}>{folder.name}</button
					>
					<details>
						<summary aria-label={ctx.t('media.folders.actions', { name: folder.name })}>···</summary
						><button
							type="button"
							onclick={() => {
								editing = folder.id;
								name = folder.name;
								nameError = '';
							}}>{ctx.t('media.folders.rename')}</button
						><button type="button" onclick={() => void requestDelete(folder)}
							>{ctx.t('media.folders.delete')}</button
						>
					</details>
				</div>
			{/each}
		</nav>
		{@const selectedFolder = folders.find((folder) => folder.id === value)}
		{#if selectedFolder}<div class="mobile-actions">
				<button
					type="button"
					onclick={() => {
						editing = selectedFolder.id;
						name = selectedFolder.name;
						nameError = '';
					}}>{ctx.t('media.folders.rename')}</button
				><button type="button" onclick={() => void requestDelete(selectedFolder)}
					>{ctx.t('media.folders.delete')}</button
				>
			</div>{/if}

		{#if editing === undefined}<button
				type="button"
				onclick={() => {
					editing = null;
					name = '';
					nameError = '';
				}}>{ctx.t('media.folders.new')}</button
			>
		{:else}<form onsubmit={saveName}>
				<label for={`${scope}-name`}>{ctx.t('media.folders.name')}</label><input
					id={`${scope}-name`}
					bind:value={name}
					maxlength="80"
					required
					disabled={busy}
					aria-invalid={nameError ? 'true' : undefined}
				/>{#if nameError}<p role="alert">{nameError}</p>{/if}<button disabled={busy} type="submit"
					>{ctx.t('editor.save')}</button
				><button
					type="button"
					disabled={busy}
					onclick={() => {
						editing = undefined;
					}}>{ctx.t('common.cancel')}</button
				>
			</form>{/if}
	{/if}
</div>
<dialog
	bind:this={dialog}
	oncancel={(event) => {
		if (busy) event.preventDefault();
		else deleting = null;
	}}
	aria-labelledby={`${scope}-delete-title`}
>
	<h2 id={`${scope}-delete-title`}>
		{ctx.t('media.folders.deleteTitle', { name: deleting?.name ?? '' })}
	</h2>
	<p>
		{count === null
			? ctx.t('media.folders.counting')
			: ctx.t('media.folders.deleteBody', { count })}
	</p>
	{#if error}<p role="alert">{error}</p>{/if}
	<button type="button" disabled={busy} onclick={closeDelete}>{ctx.t('common.cancel')}</button
	><button type="button" disabled={busy || count === null} onclick={() => void deleteFolder()}
		>{ctx.t('media.folders.delete')}</button
	>
</dialog>

<style>
	.mobile-actions {
		display: none;
	}
	.manage {
		display: flex;
		flex-direction: column;
		gap: 8px;
		min-width: 0;
	}
	label {
		display: block;
		color: var(--ink-2);
	}
	select,
	input,
	button,
	summary {
		min-height: 44px;
		max-width: 100%;
		border: 1px solid var(--line);
		border-radius: var(--r);
		padding: 8px;
		background: var(--surface);
		color: var(--ink);
		font: inherit;
	}
	button,
	summary {
		cursor: pointer;
	}
	nav {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.folder {
		display: flex;
		align-items: start;
		gap: 4px;
	}
	.folder > button {
		flex: 1;
		min-width: 0;
		overflow-wrap: anywhere;
		text-align: start;
	}
	details {
		position: relative;
	}
	details button {
		display: block;
	}
	[aria-current='true'] {
		background: var(--accent-soft);
		color: var(--accent-text);
	}
	p {
		overflow-wrap: anywhere;
	}
	dialog {
		max-width: min(480px, calc(100vw - 32px));
		background: var(--surface);
		color: var(--ink);
		border: 1px solid var(--line);
		border-radius: var(--r);
		padding: 24px;
	}
	dialog::backdrop {
		background: var(--overlay);
	}
	:focus-visible {
		outline: 2px solid var(--accent-text);
		outline-offset: 2px;
	}
	@media (max-width: 640px) {
		.mobile-actions {
			display: flex;
			flex-wrap: wrap;
			gap: 8px;
		}
		nav {
			display: none;
		}
	}
</style>
