<script lang="ts">
	/**
	 * Assisted Markdown editor for long-form fields (L11).
	 *
	 * The old bespoke fodaveg admin established the useful interaction model: raw Markdown as the
	 * real form value, a formatting helper, Write/Split/Preview modes, a live proof and keyboard
	 * shortcuts. Vega ports that behaviour without importing the Astro component or its unsafe
	 * `innerHTML` preview. The proof is a read-only TipTap editor using Vega's existing safe
	 * Markdown extensions, so dangerous link/image schemes are stripped on the preview path.
	 *
	 * Unlike the former WYSIWYG widget, this component never parses and reserializes the value the
	 * user is editing. Typing is byte-preserving; only an explicit toolbar command changes syntax.
	 * It remains a controlled `WidgetProps` implementation: every real change goes through
	 * `onChange`, and external value changes are reconciled without replacing the textarea cursor.
	 */
	import { onMount, tick, untrack } from 'svelte';
	import type { Editor } from '@tiptap/core';
	import type { MarkdownExtensionStorage, MarkdownManager } from '@tiptap/markdown';
	import type { WidgetProps } from './types';
	import { fieldIds } from '../field-ids';
	import { getVegaContext } from '$lib/app-context';
	import {
		applyMarkdownCommand,
		countMarkdownWords,
		hasUnsafeMarkdownContent,
		type MarkdownCommand,
		type MarkdownCommandPlaceholders
	} from './markdown-commands';

	type EditorMode = 'write' | 'split' | 'preview';

	interface Tool {
		command: MarkdownCommand;
		labelKey: string;
		text: string;
	}

	let { field, value, error, disabled, readonly, onChange }: WidgetProps = $props();

	const ctx = getVegaContext();
	const ids = $derived(fieldIds(field.name));
	const previewId = $derived(`${ids.inputId}-preview`);
	const unsafeUriErrorId = $derived(`${ids.inputId}-unsafe-uri`);
	let unsafeUriError = $state(false);
	const describedBy = $derived(
		[
			field.help ? ids.helpId : null,
			error ? ids.errorId : null,
			unsafeUriError ? unsafeUriErrorId : null
		]
			.filter((id): id is string => id !== null)
			.join(' ') || undefined
	);
	const inert = $derived(disabled || readonly);

	const TOOLS: readonly Tool[] = [
		{ command: 'heading1', labelKey: 'form.editor.heading1', text: 'H1' },
		{ command: 'heading2', labelKey: 'form.editor.heading2', text: 'H2' },
		{ command: 'bold', labelKey: 'form.editor.bold', text: 'B' },
		{ command: 'italic', labelKey: 'form.editor.italic', text: 'I' },
		{ command: 'strike', labelKey: 'form.editor.strike', text: 'S' },
		{ command: 'link', labelKey: 'form.editor.link', text: '↗' },
		{ command: 'blockquote', labelKey: 'form.editor.blockquote', text: '❝' },
		{ command: 'bulletList', labelKey: 'form.editor.bulletList', text: '•—' },
		{ command: 'orderedList', labelKey: 'form.editor.orderedList', text: '1.' },
		{ command: 'code', labelKey: 'form.editor.code', text: '</>' },
		{ command: 'codeBlock', labelKey: 'form.editor.codeBlock', text: '{ }' },
		{ command: 'horizontalRule', labelKey: 'form.editor.horizontalRule', text: '―' },
		{ command: 'image', labelKey: 'form.editor.image', text: '▧' }
	];

	const MODE_STORAGE_KEY = 'vega:markdown-mode';
	const VALID_MODES: readonly EditorMode[] = ['write', 'split', 'preview'];

	let textarea: HTMLTextAreaElement;
	let previewContainer: HTMLDivElement;
	let previewEditor = $state.raw<Editor | null>(null);
	let markdownManager = $state.raw<MarkdownManager | null>(null);
	let draft = $state(untrack(() => (typeof value === 'string' ? value : '')));
	let mode = $state<EditorMode>('split');
	let lastEmitted = untrack(() => (typeof value === 'string' ? value : ''));
	const wordCount = $derived(countMarkdownWords(draft));
	const wordCountLabel = $derived(
		wordCount === 1
			? ctx.t('form.markdown.wordCountOne')
			: ctx.t('form.markdown.wordCountMany', { count: wordCount })
	);

	const placeholders = $derived<MarkdownCommandPlaceholders>({
		text: ctx.t('form.markdown.placeholderText'),
		code: ctx.t('form.markdown.placeholderCode'),
		url: 'https://',
		alt: ctx.t('form.markdown.placeholderAlt')
	});

	onMount(() => {
		let disposed = false;
		let storedMode: string | null = null;
		try {
			storedMode = window.localStorage.getItem(MODE_STORAGE_KEY);
		} catch {
			// Storage is an enhancement; the editor remains fully usable without it.
		}
		const validStoredMode = VALID_MODES.find((candidate) => candidate === storedMode);
		mode = validStoredMode ?? (window.matchMedia('(max-width: 720px)').matches ? 'write' : 'split');

		(async () => {
			const [{ Editor: EditorCtor }, { createMarkdownExtensions }] = await Promise.all([
				import('@tiptap/core'),
				import('$lib/richtext/markdown')
			]);
			if (disposed) return;
			previewEditor = new EditorCtor({
				element: previewContainer,
				extensions: createMarkdownExtensions(),
				content: draft,
				contentType: 'markdown',
				editable: false,
				editorProps: {
					attributes: {
						role: 'document',
						'aria-label': ctx.t('form.markdown.previewRegion')
					}
				}
			});
			markdownManager = (previewEditor.storage.markdown as MarkdownExtensionStorage).manager;
			unsafeUriError = hasUnsafeMarkdownContent(draft, markdownManager);
			if (!unsafeUriError && draft !== lastEmitted) {
				lastEmitted = draft;
				onChange(draft);
			}
		})();

		return () => {
			disposed = true;
			previewEditor?.destroy();
			previewEditor = null;
			markdownManager = null;
		};
	});

	// A value coming from outside the editor (new record/model) wins. Echoes of our own onChange
	// already equal `lastEmitted`, so they do not rewrite the textarea or disturb its selection.
	$effect(() => {
		const incoming = typeof value === 'string' ? value : '';
		if (incoming === lastEmitted) return;
		lastEmitted = incoming;
		draft = incoming;
		unsafeUriError = markdownManager ? hasUnsafeMarkdownContent(incoming, markdownManager) : false;
	});

	// Live proof: update the existing read-only editor, never recreate it and never emit changes.
	$effect(() => {
		const editor = previewEditor;
		const content = draft;
		if (!editor) return;

		const frame = requestAnimationFrame(() => {
			editor.commands.setContent(content, { contentType: 'markdown', emitUpdate: false });
		});

		return () => cancelAnimationFrame(frame);
	});

	// Native constraint validation blocks the parent form even if it was already dirty before an
	// unsafe destination was completed (for example while typing `javascript:` character by
	// character). This makes the rejection a form-level guarantee, not just a visual warning.
	$effect(() => {
		if (!textarea) return;
		textarea.setCustomValidity(unsafeUriError ? ctx.t('form.markdown.unsafeUri') : '');
	});

	function emit(next: string): void {
		draft = next;
		if (!markdownManager) return;
		unsafeUriError = hasUnsafeMarkdownContent(next, markdownManager);
		textarea.setCustomValidity(unsafeUriError ? ctx.t('form.markdown.unsafeUri') : '');
		if (next === lastEmitted) return;
		lastEmitted = next;
		onChange(next);
	}

	function handleInput(event: Event): void {
		emit((event.currentTarget as HTMLTextAreaElement).value);
	}

	function setMode(next: EditorMode): void {
		mode = next;
		try {
			window.localStorage.setItem(MODE_STORAGE_KEY, next);
		} catch {
			// See the matching read: persistence is optional.
		}
	}

	function applyCommand(command: MarkdownCommand): void {
		if (inert || !textarea) return;
		const result = applyMarkdownCommand(
			draft,
			textarea.selectionStart,
			textarea.selectionEnd,
			command,
			placeholders
		);
		emit(result.value);
		void tick().then(() => {
			textarea.focus();
			textarea.setSelectionRange(result.selectionStart, result.selectionEnd);
		});
	}

	function handleKeydown(event: KeyboardEvent): void {
		if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
		const key = event.key.toLowerCase();
		const command = key === 'b' ? 'bold' : key === 'i' ? 'italic' : key === 'k' ? 'link' : null;
		if (command === null) return;
		event.preventDefault();
		applyCommand(command);
	}
</script>

<div
	class="vega-markdown-workbench"
	data-mode={mode}
	data-invalid={error || unsafeUriError ? 'true' : undefined}
>
	<div class="vega-markdown-bar">
		<div class="vega-markdown-tools" role="toolbar" aria-label={ctx.t('form.editor.toolbarLabel')}>
			{#each TOOLS as tool (tool.command)}
				<button
					type="button"
					class:vega-markdown-tool--emphasis={tool.command === 'bold'}
					class:vega-markdown-tool--italic={tool.command === 'italic'}
					class:vega-markdown-tool--strike={tool.command === 'strike'}
					aria-label={ctx.t(tool.labelKey)}
					title={ctx.t(tool.labelKey)}
					disabled={inert || markdownManager === null}
					onmousedown={(event) => event.preventDefault()}
					onclick={() => applyCommand(tool.command)}
				>
					{tool.text}
				</button>
			{/each}
		</div>

		<div class="vega-markdown-modes" role="group" aria-label={ctx.t('form.markdown.modeLabel')}>
			{#each VALID_MODES as candidate (candidate)}
				<button type="button" aria-pressed={mode === candidate} onclick={() => setMode(candidate)}>
					{ctx.t(`form.markdown.mode.${candidate}`)}
				</button>
			{/each}
		</div>
	</div>

	<div class="vega-markdown-body">
		<div class="vega-markdown-write">
			<textarea
				bind:this={textarea}
				id={ids.inputId}
				value={draft}
				placeholder={field.placeholder ?? ''}
				aria-labelledby={ids.labelId}
				aria-describedby={describedBy}
				aria-invalid={error || unsafeUriError ? 'true' : undefined}
				aria-controls={previewId}
				disabled={disabled || markdownManager === null}
				{readonly}
				spellcheck="true"
				oninput={handleInput}
				onkeydown={handleKeydown}></textarea>
		</div>

		<section
			id={previewId}
			class="vega-markdown-preview"
			aria-label={ctx.t('form.markdown.previewRegion')}
		>
			{#if draft.trim().length === 0}
				<p class="vega-markdown-preview-empty">{ctx.t('form.markdown.previewEmpty')}</p>
			{:else if previewEditor === null}
				<p class="vega-markdown-preview-empty">{ctx.t('form.markdown.previewLoading')}</p>
			{/if}
			<div bind:this={previewContainer} class="vega-markdown-preview-content"></div>
		</section>
	</div>

	<div class="vega-markdown-foot">
		<span>{wordCountLabel}</span>
		<span>{ctx.t('form.markdown.shortcutHint')}</span>
	</div>
	{#if unsafeUriError}
		<p id={unsafeUriErrorId} class="vega-markdown-security-error" role="alert">
			{ctx.t('form.markdown.unsafeUri')}
		</p>
	{/if}
</div>

<style>
	.vega-markdown-workbench {
		min-width: 0;
		border: 1px solid var(--line-strong);
		border-radius: var(--r);
		background: var(--surface);
		overflow: hidden;
	}

	.vega-markdown-workbench[data-invalid='true'] {
		border-color: var(--danger);
	}

	.vega-markdown-bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.65rem;
		padding: 0.4rem 0.5rem;
		border-bottom: 1px solid var(--line);
		background: var(--surface-2);
	}

	.vega-markdown-tools {
		display: flex;
		flex-wrap: wrap;
		flex: 1 1 100%;
		gap: 0.15rem;
		min-width: 0;
	}

	.vega-markdown-tools button,
	.vega-markdown-modes button {
		display: inline-grid;
		place-items: center;
		min-width: 2rem;
		height: 2rem;
		padding: 0 0.4rem;
		border: 1px solid transparent;
		border-radius: var(--r-s);
		background: transparent;
		color: var(--ink-2);
		font: inherit;
		font-family: var(--mono);
		font-size: 0.75rem;
		font-weight: 600;
		line-height: 1;
		cursor: pointer;
	}

	.vega-markdown-tools button:hover:not(:disabled),
	.vega-markdown-modes button:hover:not(:disabled) {
		border-color: var(--line);
		background: var(--active);
		color: var(--ink-hi);
	}

	.vega-markdown-tools button:active:not(:disabled),
	.vega-markdown-modes button:active:not(:disabled) {
		background: var(--btn);
	}

	.vega-markdown-tools button:disabled {
		cursor: not-allowed;
		opacity: 0.45;
	}

	.vega-markdown-tool--emphasis {
		font-weight: 800 !important;
	}

	.vega-markdown-tool--italic {
		font-style: italic !important;
	}

	.vega-markdown-tool--strike {
		text-decoration: line-through;
	}

	.vega-markdown-modes {
		display: inline-flex;
		flex-shrink: 0;
		margin-left: auto;
		gap: 0.1rem;
		padding: 0.15rem;
		border: 1px solid var(--line);
		border-radius: var(--r-s);
		background: var(--surface);
	}

	.vega-markdown-modes button {
		width: auto;
		padding-inline: 0.65rem;
		font-family: var(--sans);
		font-size: 0.72rem;
	}

	.vega-markdown-modes button[aria-pressed='true'] {
		border-color: var(--accent);
		background: var(--accent);
		color: var(--accent-ink);
	}

	.vega-markdown-body {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		min-height: 20rem;
	}

	.vega-markdown-write,
	.vega-markdown-preview {
		min-width: 0;
	}

	.vega-markdown-write {
		display: flex;
		background: var(--surface);
	}

	.vega-markdown-write textarea {
		width: 100%;
		min-height: 20rem;
		resize: vertical;
		border: 0;
		background: transparent;
		color: var(--ink);
		padding: 1.15rem 1.25rem;
		font-family: var(--mono);
		font-size: 0.875rem;
		line-height: 1.75;
		tab-size: 2;
		outline: none;
	}

	.vega-markdown-write textarea::placeholder {
		color: var(--ink-3);
	}

	.vega-markdown-write:focus-within {
		box-shadow: inset 0 0 0 2px var(--ring);
	}

	.vega-markdown-preview {
		position: relative;
		border-left: 1px solid var(--line);
		background: var(--paper);
		color: var(--ink);
		overflow: auto;
		max-height: 42rem;
	}

	.vega-markdown-preview-empty {
		position: absolute;
		inset: 1.25rem;
		margin: 0;
		color: var(--ink-3);
		font-size: 0.85rem;
		font-style: italic;
		pointer-events: none;
	}

	.vega-markdown-preview-content {
		padding: 1.25rem 1.4rem;
	}

	.vega-markdown-preview-content :global(.tiptap) {
		outline: none;
		font-size: 0.95rem;
		line-height: 1.7;
	}

	.vega-markdown-preview-content :global(.tiptap > *:first-child) {
		margin-top: 0;
	}

	.vega-markdown-preview-content :global(.tiptap > *:last-child) {
		margin-bottom: 0;
	}

	.vega-markdown-preview-content :global(h1),
	.vega-markdown-preview-content :global(h2),
	.vega-markdown-preview-content :global(h3),
	.vega-markdown-preview-content :global(h4) {
		color: var(--ink-hi);
		line-height: 1.25;
	}

	.vega-markdown-preview-content :global(a) {
		color: var(--accent-text);
		text-decoration: underline;
		text-underline-offset: 0.2em;
	}

	.vega-markdown-preview-content :global(code) {
		font-family: var(--mono);
		font-size: 0.85em;
		background: var(--surface-2);
		border: 1px solid var(--line);
		border-radius: 3px;
		padding: 0.08em 0.32em;
	}

	.vega-markdown-preview-content :global(pre) {
		padding: 0.75rem;
		border-radius: var(--r-s);
		background: var(--surface-2);
		overflow-x: auto;
	}

	.vega-markdown-preview-content :global(pre code) {
		border: 0;
		padding: 0;
		background: transparent;
	}

	.vega-markdown-preview-content :global(blockquote) {
		margin-inline: 0;
		padding: 0.65rem 0.9rem;
		border-left: 3px solid var(--accent);
		background: var(--surface-2);
		color: var(--ink-2);
	}

	.vega-markdown-preview-content :global(img) {
		display: block;
		max-width: 100%;
		height: auto;
		border-radius: var(--r-s);
	}

	.vega-markdown-workbench[data-mode='write'] .vega-markdown-body {
		grid-template-columns: 1fr;
	}

	.vega-markdown-workbench[data-mode='write'] .vega-markdown-preview {
		display: none;
	}

	.vega-markdown-workbench[data-mode='preview'] .vega-markdown-body {
		grid-template-columns: 1fr;
	}

	.vega-markdown-workbench[data-mode='preview'] .vega-markdown-write {
		display: none;
	}

	.vega-markdown-workbench[data-mode='preview'] .vega-markdown-preview {
		border-left: 0;
	}

	.vega-markdown-foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.4rem 0.7rem;
		border-top: 1px solid var(--line);
		background: var(--surface-2);
		color: var(--ink-3);
		font-family: var(--mono);
		font-size: 0.68rem;
	}

	.vega-markdown-security-error {
		margin: 0;
		padding: 0.55rem 0.7rem;
		border-top: 1px solid var(--danger);
		background: var(--danger-soft);
		color: var(--danger);
		font-size: 0.78rem;
	}

	@media (max-width: 720px) {
		.vega-markdown-bar {
			align-items: stretch;
			flex-direction: column;
		}

		.vega-markdown-tools {
			display: grid;
			grid-template-columns: repeat(auto-fit, minmax(2.75rem, 1fr));
			flex: 0 0 auto;
			width: 100%;
		}

		.vega-markdown-tools button {
			width: 100%;
			height: 2.75rem;
		}

		.vega-markdown-modes {
			display: grid;
			grid-template-columns: repeat(3, minmax(0, 1fr));
			margin-left: 0;
			width: 100%;
		}

		.vega-markdown-modes button {
			height: 2.75rem;
		}

		.vega-markdown-body {
			grid-template-columns: 1fr;
		}

		.vega-markdown-workbench[data-mode='split'] .vega-markdown-preview {
			border-top: 1px solid var(--line);
			border-left: 0;
		}

		.vega-markdown-write textarea {
			padding: 1rem;
		}

		.vega-markdown-foot {
			align-items: flex-start;
			flex-direction: column;
			gap: 0.2rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.vega-markdown-tools button,
		.vega-markdown-modes button {
			transition: none;
		}
	}
</style>
