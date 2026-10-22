<script lang="ts">
	/**
	 * `VisualPageFields.svelte` (spec «edición en línea de todo el texto de la página», parte A, 22
	 * oct 2026): la ficha de los campos de texto del REGISTRO de la página (título, descripción…)
	 * dentro del editor visual. La pide la pantalla (`VisualEditorScreen.svelte`) con un `import()`
	 * cuando el puente negocia v2 —nunca entra en el coste estático de la pantalla más cara— y la
	 * deja montada desde entonces, oculta salvo cuando el autor edita un campo de la página.
	 *
	 * **No es un segundo formulario del registro: es `BlockEditor` sobre el registro padre**, en su
	 * modo homogéneo (`dataField: null`) y en «solo textos». Eso le da, sin copiar nada, las mismas
	 * piezas que ya usan los campos de bloque en línea: `beginInline`/`updateInline`/`finishInline`
	 * (cancelar restaura el borrador exacto), la marca «● en la página» del campo que se escribe, la
	 * toma de control al teclear en la ficha, la validación del formulario del registro
	 * (`validateForm`, validez nativa y la regla de `markdown`) y el guardado por `port.update` con
	 * `expectedVersion`, con su aviso de edición concurrente. `toRecordInput` envía solo lo que
	 * cambió.
	 *
	 * **Fuera de la ficha (`structuralFields`)**: la ruta de la página (también la bilingüe), el
	 * slug, el estado y «Publicar el». La ruta y el slug tienen su propio camino en el formulario
	 * (redirecciones, «Proponer ruta»), que esta ficha no reproduce; el estado y la fecha los
	 * escribe `VisualPublishControl`. Que sean «estructurales» aquí también hace que un cambio suyo
	 * hecho por ese control (que llega por `record`) no cuente como edición ajena: la ficha adopta
	 * la versión nueva sin conflicto falso (ver el `$effect` de `record` en `BlockEditor`).
	 *
	 * El resto de campos del registro (imagen, casillas…) no se editan aquí: lo dice una línea con
	 * el enlace al formulario, en vez del texto de «solo textos» pensado para secciones.
	 *
	 * **Sin imports de la app en tiempo de ejecución, a propósito (presupuesto de bundle).** El
	 * contexto, `BlockEditor` e `Icon` llegan por props desde la pantalla, que ya los tiene. Medido
	 * el 22 oct 2026: con `import BlockEditor` aquí, rolldown partía en dos el chunk compartido del
	 * formulario (los módulos de `BlockEditor` pasaban a tener otro conjunto de entradas que los
	 * alcanzan que sus vecinos), y la pantalla más cara subía 2,9 KB y el formulario de registro
	 * 1,7 KB sin que su código cambiara. Solo se importan tipos, que desaparecen al compilar.
	 */
	import type { Snippet } from 'svelte';
	import type { VegaAppContext } from '$lib/app-context';
	import type { ResolvedContentType } from '$lib/model/types';
	import type { VegaRecord } from '$lib/backend';
	import type { PreviewDraftRecord } from '$lib/backend/preview-client';
	import type BlockEditor from '$lib/form/BlockEditor.svelte';
	import type IconComponent from '$lib/icons/Icon.svelte';
	import type { InlineEditor, InlineSource } from './inline-session';

	interface Props {
		/** Ver la cabecera: dependencias que pasa la pantalla para no alterar el troceo. */
		ctx: VegaAppContext;
		Editor: typeof BlockEditor;
		Icon: typeof IconComponent;
		type: ResolvedContentType;
		/** El registro de la página tal y como lo conoce la pantalla (se actualiza al guardar). */
		record: VegaRecord;
		/** Nombre de la página (el de las migas). */
		name: string;
		fullFormHref: string;
		onClose: () => void;
		onSaved: (saved: VegaRecord) => void;
		onDirtyChange: (dirty: boolean) => void;
		/** Solo los campos que pinta la ficha (`pageTextFields`): nunca estado ni «Publicar el». */
		onDraftChange: (draft: PreviewDraftRecord) => void;
		/** El autor escribe en la ficha el campo que se edita en la página: la pantalla cierra la
		 *  sesión del puente sin cancelar (ver `BlockEditor#onInlineTakeover`). */
		onInlineTakeover: () => void;
		/** Guardar con una edición en línea abierta: `true` si la pantalla se encarga. */
		interceptSave: () => boolean;
		/** `pageStructuralFields` / `pageTextFields` (`page-fields.ts`), calculados por la pantalla. */
		structuralFields: string[];
		textFields: string[];
		/** Guardando, y si el último guardado falló: la barra de la pantalla los enseña. */
		onBusyChange: (busy: boolean) => void;
		onSaveError: (failed: boolean) => void;
	}

	let {
		ctx,
		Editor,
		Icon,
		type,
		record,
		name,
		fullFormHref,
		onClose,
		onSaved,
		onDirtyChange,
		onDraftChange,
		onInlineTakeover,
		interceptSave,
		structuralFields,
		textFields,
		onBusyChange,
		onSaveError
	}: Props = $props();

	let editor = $state<InlineEditor | undefined>(undefined);
	let saveFailed = $state(false);

	const locked = $derived(!type.permissions.update || !!type.readonly);

	/** El borrador completo de `BlockEditor` lleva TODOS los campos del registro tal y como los
	 *  abrió (estado y fecha incluidos): al token solo van los que pinta esta ficha. */
	function ownDraft(draft: PreviewDraftRecord): PreviewDraftRecord {
		return {
			...draft,
			fields: Object.fromEntries(
				textFields.filter((field) => field in draft.fields).map((f) => [f, draft.fields[f]])
			)
		};
	}

	export function beginInline(field: string, source?: InlineSource) {
		return editor?.beginInline(field, source) ?? null;
	}
	export function updateInline(field: string, value: string): boolean {
		return editor?.updateInline(field, value) ?? false;
	}
	export function finishInline(cancel = false): void {
		editor?.finishInline(cancel);
	}
	export function save(options: { focus?: boolean } = {}) {
		return editor?.save(options) ?? Promise.resolve('idle' as const);
	}
	export function revealErrors(): Promise<void> {
		return editor?.revealErrors() ?? Promise.resolve();
	}
</script>

{#snippet footer(
	_name: string,
	state: string,
	save: Snippet | undefined,
	_id: string,
	dirty: boolean
)}
	<footer class="vega-page-fields-foot">
		{#if saveFailed}
			<p class="vega-page-fields-alert" role="alert">
				<Icon id="generic" size={14} />{ctx.t('editor.visual.inspector.saveFailed')}
			</p>
		{/if}
		{#if save}{@render save()}{/if}
		{#if save}
			<button
				type="button"
				class="vega-page-fields-discard"
				disabled={!dirty}
				onclick={() => editor?.discard()}>{ctx.t('editor.visual.inspector.discard')}</button
			>
		{/if}
		<p class="vega-page-fields-state" role="status">{state}</p>
	</footer>
{/snippet}

<section class="vega-page-fields" aria-labelledby="vega-page-fields-heading">
	<header class="vega-page-fields-head">
		<span class="vega-page-fields-icon" aria-hidden="true"><Icon id="document" size={17} /></span>
		<div class="vega-page-fields-title">
			<h2 id="vega-page-fields-heading" tabindex="-1">
				{ctx.t('editor.visual.page.title')}
			</h2>
			<small>{name}</small>
		</div>
		<button
			type="button"
			class="vega-page-fields-close"
			aria-label={ctx.t('editor.visual.closeInspector')}
			title={ctx.t('editor.visual.closeInspector')}
			onclick={onClose}><Icon id="close" size={16} /></button
		>
	</header>
	{#if locked}
		<p class="vega-page-fields-note">{ctx.t('editor.noUpdateNotice')}</p>
	{/if}
	<Editor
		bind:this={editor}
		childType={type}
		blockType={null}
		rawBlockType={null}
		dataField={null}
		{record}
		{name}
		{structuralFields}
		onSubmit={(input, opts) => ctx.port.update(type.name, record.id, input, opts)}
		{onSaved}
		{onDirtyChange}
		onDraftChange={(draft) => onDraftChange(ownDraft(draft))}
		{onBusyChange}
		onSaveError={(failed) => {
			saveFailed = failed;
			onSaveError(failed);
		}}
		textsOnly
		{locked}
		contextualHeader={footer}
		contextualPlacement="bottom"
		onInlineTakeover={() => onInlineTakeover()}
		beforeSave={interceptSave}
	/>
	<p class="vega-page-fields-note">
		{ctx.t('editor.visual.page.rest')}
		<!-- Ruta real del registro: la guarda de salida del editor decide si se abandona. -->
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
		<a href={fullFormHref}>{ctx.t('editor.visual.texts.form')}</a>
	</p>
</section>

<style>
	/* La misma caja que `.vega-inspector-panel` (VisualInspector.svelte): es la celda del
	   inspector cuando el autor edita un campo de la página. */
	.vega-page-fields {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
		min-width: 0;
		min-height: 0;
		padding: 0 var(--sp-4);
		border: 1px solid var(--line);
		border-radius: var(--r-md);
		background: var(--glass);
		backdrop-filter: blur(18px);
		-webkit-backdrop-filter: blur(18px);
		box-shadow: var(--shadow-card);
		overflow-y: auto;
	}

	.vega-page-fields-head {
		position: sticky;
		top: 0;
		z-index: 2;
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		padding: var(--sp-3) 0;
		border-bottom: 1px solid var(--line-soft);
		background: var(--surface);
	}

	.vega-page-fields-icon {
		display: inline-flex;
		color: var(--ink-2);
	}

	.vega-page-fields-title {
		display: flex;
		flex: 1;
		flex-direction: column;
		min-width: 0;
	}

	.vega-page-fields-title h2 {
		margin: 0;
		font-size: var(--fs-14);
	}

	.vega-page-fields-title h2:focus-visible {
		outline: 2px solid var(--ink);
		outline-offset: 2px;
	}

	.vega-page-fields-title small {
		overflow: hidden;
		color: var(--ink-2);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.vega-page-fields-close {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 44px;
		min-height: 44px;
		border: 0;
		border-radius: var(--r-sm);
		background: transparent;
		color: var(--ink-2);
		cursor: pointer;
	}

	.vega-page-fields-close:focus-visible {
		outline: 2px solid var(--ink);
		outline-offset: 2px;
	}

	/* «Solo textos» nombra el resto como «Esta sección…»: aquí no es una sección, así que esa línea
	   la sustituye la nota de abajo, con el enlace al formulario de la página. */
	.vega-page-fields :global(.vega-block-rest) {
		display: none;
	}

	.vega-page-fields-note {
		margin: 0;
		color: var(--ink-2);
		font-size: var(--fs-13);
	}

	.vega-page-fields-note a {
		color: var(--accent-text);
	}

	.vega-page-fields-foot {
		position: sticky;
		bottom: 0;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--sp-2);
		margin-top: auto;
		padding: var(--sp-3) 0;
		border-top: 1px solid var(--line-soft);
		background: var(--surface);
	}

	.vega-page-fields-alert {
		display: flex;
		flex-basis: 100%;
		align-items: center;
		gap: var(--sp-1);
		margin: 0;
		color: var(--danger);
	}

	.vega-page-fields-discard {
		min-height: 44px;
		padding: 0 var(--sp-3);
		border: 1px solid var(--line);
		border-radius: var(--r-sm);
		background: transparent;
		color: var(--ink);
		cursor: pointer;
	}

	.vega-page-fields-discard:disabled {
		cursor: default;
		opacity: 0.55;
	}

	.vega-page-fields-discard:focus-visible {
		outline: 2px solid var(--ink);
		outline-offset: 2px;
	}

	/* El estado lo dice la barra; aquí queda para el lector de pantalla. */
	.vega-page-fields-state {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
</style>
