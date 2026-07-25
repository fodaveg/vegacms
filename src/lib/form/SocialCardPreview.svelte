<script lang="ts">
	/**
	 * `SocialCardPreview.svelte` (capacidad `social`, lote "editor" Fase B, `ResolvedSocialCardConfig`):
	 * la vista previa de cómo queda la tarjeta al compartir este registro (Twitter/Facebook/Slack…
	 * unfurl genérico, sin depender de ningún proveedor concreto). Tarjeta más en `.vega-editor-aside`
	 * (`RecordForm.svelte`), MISMO lenguaje visual que "Registro"/zona de peligro: se pinta SIEMPRE
	 * que `type.social` exista (capacidad declarada, mismo criterio opt-in que `editorRail`), nunca
	 * a medio construir por dato ausente — cada pieza degrada por su cuenta (ver más abajo).
	 *
	 * **Fuente de datos: `current` (LIVE), no `baseline`** — el prop `values` que pasa `RecordForm`
	 * es su estado editable en curso, así que la previsualización responde mientras se escribe
	 * (mismo criterio que "Regenerar" del slug, que lee el `titleField` ACTUAL). Es una decisión
	 * consciente: una vista previa que solo reflejara lo último guardado sería menos útil que la
	 * del propio "Ver en el sitio" (que si mira el baseline, porque SÍ navega a algo publicado).
	 *
	 * **Degradación con dignidad (eje 6 del checklist, requisito explícito del lote)**:
	 * - Sin `imageField` resuelto, o sin valor en el registro: caja con icono genérico en vez de
	 *   una `<img>` rota — NUNCA un `<img>` con `src` vacío (dispararía su propio error 404 visual).
	 * - Sin `titleField` resuelto, o vacío: cae a `list.untitled`, MISMA convención que el resto
	 *   del editor (nombre del documento en la barra, `RecordTable`).
	 * - Sin `descriptionField` resuelto, o vacío: la fila de descripción desaparece del todo, nunca
	 *   un párrafo en blanco.
	 * - Sin `urlTemplate` resuelto (ni propio ni heredado de `previewUrl`, `ResolvedSocialCardConfig`)
	 *   o placeholders sin resolver: la línea de dominio desaparece, mismo criterio.
	 *
	 * **Imagen**: reusa la MISMA costura de identidad que `FileInput.svelte` (F5-f,
	 * `record-context.ts`) — `getRecordIdentity()` la lee del contexto que publica el `RecordForm`
	 * ancestro (el MISMO registro, no uno nuevo: a diferencia de `BlockEditor.svelte`, este
	 * componente no necesita `setRecordIdentity` propio). Un `File` recién seleccionado (subida
	 * pendiente, aún sin guardar) se previsualiza con `URL.createObjectURL` — mismo patrón, objeto
	 * revocado en el `$effect` de abajo cuando cambia o se desmonta.
	 *
	 * **URL/dominio**: `buildUrlFromTemplate` (`$lib/model/preview-url`) — la MISMA maquinaria de
	 * placeholders `{campo}`/`{id}` de `previewUrl` (§4.7), generalizada para aceptar una plantilla
	 * explícita en vez de leer `type.previewUrl` directamente (ver la cabecera de ese módulo). El
	 * `host` que se pinta (mockup de cualquier tarjeta OG real: dominio en versalita sobre el
	 * título) sale de `new URL(...).host`, envuelto en `try/catch` por si la sustitución produjera
	 * algo no parseable (defensivo, no debería pasar: `ResolvedSocialCardConfig.urlTemplate` ya
	 * pasó por `validatePreviewUrlPlaceholders` en resolución).
	 */
	import type { FieldValue } from '$lib/backend/types';
	import type { ResolvedContentType, ResolvedSocialCardConfig } from '$lib/model/types';
	import { getVegaContext } from '$lib/app-context';
	import { describeCell } from '$lib/list/cell';
	import { buildUrlFromTemplate } from '$lib/model/preview-url';
	import { getRecordIdentity } from './record-context';
	import type { FormInputValues } from './dirty';
	import Icon from '$lib/icons/Icon.svelte';

	interface Props {
		config: ResolvedSocialCardConfig;
		/** El tipo PADRE (no uno hijo: a diferencia de `blocks`, `social` siempre mira los campos
		 *  del propio registro que se está editando). */
		type: ResolvedContentType;
		/** `current` del `RecordForm` ancestro — LIVE, ver cabecera. */
		values: FormInputValues;
	}

	let { config, type, values }: Props = $props();
	const ctx = getVegaContext();

	/** Texto del título social: `config.titleField` (ya resuelto con su cascada, `resolveSocialCard`)
	 *  leído de `current`. `''` sin campo resoluble o con el campo vacío — el marcado cae a
	 *  `list.untitled`, no aquí (mismo reparto que `docName` de `RecordForm`). */
	const titleText = $derived.by(() => {
		if (config.titleField === null) return '';
		const raw = values[config.titleField];
		return typeof raw === 'string' ? raw : '';
	});

	/** Texto de la descripción social: `describeCell` (MISMA derivación que una celda de listado,
	 *  strip de HTML si el campo es `richtext` — nunca `{@html}` aquí tampoco). `''` sin campo
	 *  resoluble o vacío. */
	const descriptionText = $derived.by(() => {
		if (config.descriptionField === null) return '';
		const field = type.fields.find((f) => f.name === config.descriptionField);
		const raw = values[config.descriptionField];
		if (!field || typeof raw !== 'string' || raw === '') return '';
		const descriptor = describeCell(field, raw as FieldValue, ctx.locale);
		return descriptor.kind === 'text' || descriptor.kind === 'richtext' ? descriptor.text : '';
	});

	// Object URL de una subida PENDIENTE (`File` aún sin guardar, ver cabecera): recalculado solo
	// cuando el `File` cambia (no en cada tecleo de OTRO campo), revocado al reemplazarse o
	// desmontar — mismo ciclo de vida que `objectUrls` de `FileInput.svelte`, reducido a un único
	// valor porque `imageField` nunca es múltiple (`resolveSocialCard`, P2).
	let pendingImageUrl = $state<string | null>(null);
	$effect(() => {
		const value = config.imageField !== null ? values[config.imageField] : null;
		if (typeof File !== 'undefined' && value instanceof File) {
			const url = URL.createObjectURL(value);
			pendingImageUrl = url;
			return () => URL.revokeObjectURL(url);
		}
		pendingImageUrl = null;
	});

	/** `src` de la imagen social: `File` pendiente → `pendingImageUrl`; `FileRef` ya persistido →
	 *  `ctx.port.fileUrl` (necesita identidad de registro con `id` no-nulo: en `/new`, antes del
	 *  primer guardado, no hay nada que resolver todavía); cualquier otro caso → `null` (degrada a
	 *  la caja con icono genérico, ver cabecera). */
	const imageUrl = $derived.by(() => {
		if (config.imageField === null) return null;
		const value = values[config.imageField];
		if (typeof File !== 'undefined' && value instanceof File) return pendingImageUrl;
		if (typeof value !== 'string' || value === '') return null;
		const identity = getRecordIdentity();
		if (!identity || identity.id === null) return null;
		const opts = ctx.port.capabilities.thumbs
			? { thumb: { width: 640, height: 360, fit: 'crop' as const } }
			: undefined;
		return ctx.port.fileUrl(
			{ type: identity.type, id: identity.id },
			config.imageField,
			value,
			opts
		);
	});

	/** URL pública resuelta (ver cabecera): `values` viaja tal cual como `FieldValue` — un
	 *  placeholder JAMÁS referencia un campo `file` (`isPreviewScalarField`, `preview-url.ts`), así
	 *  que el `File` pendiente de un campo `file` (si lo hubiera en otro campo) nunca llega a
	 *  sustituirse; el cast es seguro por esa invariante, no por casualidad. */
	const resolvedUrl = $derived.by(() => {
		const identity = getRecordIdentity();
		const record = {
			id: identity?.id ?? '',
			type: type.name,
			values: values as Record<string, FieldValue>
		};
		return buildUrlFromTemplate(config.urlTemplate, record);
	});

	const hostText = $derived.by(() => {
		if (resolvedUrl === null) return null;
		try {
			return new URL(resolvedUrl).host;
		} catch {
			return null; // defensivo (ver cabecera): no debería pasar tras validatePreviewUrlPlaceholders
		}
	});
</script>

<section class="vega-fsection vega-fsection--aside vega-social-card">
	<h2>{ctx.t('editor.social.title')}</h2>
	<div class="vega-social-preview">
		<div class="vega-social-image">
			{#if imageUrl}
				<img src={imageUrl} alt="" />
			{:else}
				<div class="vega-social-image-placeholder" aria-hidden="true">
					<Icon id="generic" size={22} />
				</div>
			{/if}
		</div>
		<div class="vega-social-body">
			{#if hostText}
				<span class="vega-social-host">{hostText}</span>
			{/if}
			<strong class="vega-social-title">{titleText || ctx.t('list.untitled')}</strong>
			{#if descriptionText}
				<p class="vega-social-description">{descriptionText}</p>
			{/if}
		</div>
	</div>
</section>

<style>
	/* La tarjeta CONTENEDORA se repinta aquí, no se hereda: `.vega-fsection`/`--aside` y su `h2`
	   están definidos en el `<style>` de `RecordForm.svelte`, y Svelte ACOTA los estilos al
	   componente que los declara. Reutilizar sus clases desde este componente hijo daba el markup
	   correcto y CERO estilo: el rótulo salía como un `<h2>` de navegador (grande y negro, roto
	   frente a las versalitas tenues de «Publicación»/«Portada»/«Registro») y la sección sin papel,
	   borde ni sombra. Mismos tokens y valores que allí, para que sean indistinguibles. */
	.vega-fsection {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		border: 1px solid var(--line);
		border-radius: var(--r);
		background: var(--paper);
		box-shadow: var(--shadow-card);
		min-width: 0;
	}

	.vega-fsection--aside {
		padding: calc(var(--pad-card) * 0.75);
	}

	.vega-fsection h2 {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		margin: 0;
		font-size: 0.76em;
		font-weight: 650;
		letter-spacing: 0.09em;
		text-transform: uppercase;
		color: var(--ink-3);
		overflow-wrap: anywhere;
	}

	/* Tarjeta OG genérica (mockup de cualquier unfurl real: imagen 16:9 arriba, cuerpo debajo) —
	   `overflow: hidden` para que la imagen respete el radio de la tarjeta exterior. Es la
	   sub-tarjeta de previsualización, DENTRO de la sección de arriba. */
	.vega-social-preview {
		display: flex;
		flex-direction: column;
		border: 1px solid var(--line);
		border-radius: calc(var(--r) - 2px);
		background: var(--surface);
		overflow: hidden;
	}

	.vega-social-image {
		aspect-ratio: 1.91 / 1; /* proporción estándar de imagen OG (1200×630) */
		background: var(--surface-2);
	}

	.vega-social-image img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.vega-social-image-placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 100%;
		color: var(--ink-3);
	}

	.vega-social-body {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		padding: 0.65rem 0.75rem;
		min-width: 0;
	}

	/* Dominio (mockup de cualquier tarjeta OG real): versalita tenue sobre el título. */
	.vega-social-host {
		font-size: 0.7em;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--ink-3);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.vega-social-title {
		font-size: 0.92em;
		font-weight: 650;
		color: var(--ink-hi);
		overflow: hidden;
		text-overflow: ellipsis;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
	}

	.vega-social-description {
		margin: 0;
		font-size: 0.82em;
		color: var(--ink-2);
		overflow: hidden;
		text-overflow: ellipsis;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
	}
</style>
