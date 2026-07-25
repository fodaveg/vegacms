/**
 * Suite de `ManifestEditor.svelte` — resincronización de `initialManifestRaw` (fix de
 * code-review, `#lote-integridad` Fase B): `/settings` tiene DOS escritores del manifiesto
 * (este editor y `RevisionsSettings`, retención) que comparten la misma página. Antes de este
 * fix, `rawText` se sembraba UNA VEZ al montar (`untrack`) y nunca volvía a mirar la prop, así
 * que un guardado del OTRO escritor dejaba el `<textarea>` mostrando contenido obsoleto — y, si
 * la persona pulsaba "Guardar" aquí sin haberse dado cuenta, ese guardado pisaba en silencio el
 * cambio del otro. Este archivo cubre las dos ramas del fix: re-siembra silenciosa cuando el
 * editor está limpio, y aviso SIN pisar cuando hay una edición sin guardar; más la regresión del
 * falso positivo (el guardado del propio editor no debe disparar el aviso).
 *
 * Montaje real (proyecto vitest `component`, `mount`/`unmount` de Svelte 5), props reactivas
 * (`$state`) para poder mutar `initialManifestRaw` sobre un montaje YA vivo — mismo patrón que
 * `PreviewPanel.svelte.test.ts#refreshToken`.
 */
import { mount, tick, unmount } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { ContentType, JsonValue } from '$lib/backend/types';
import ManifestEditor from './ManifestEditor.svelte';

type EditorProps = {
	types: ContentType[];
	initialManifestRaw: JsonValue | null;
	collectionState: 'present' | 'creatable' | 'manual';
	onSave: (manifest: JsonValue) => Promise<void>;
};

function mountEditor(overrides: {
	initialManifestRaw: JsonValue | null;
	onSave?: (manifest: JsonValue) => Promise<void>;
}): {
	target: HTMLElement;
	instance: ReturnType<typeof mount>;
	props: EditorProps;
} {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const props = $state<EditorProps>({
		types: [],
		collectionState: 'present',
		onSave: overrides.onSave ?? (async () => undefined),
		initialManifestRaw: overrides.initialManifestRaw
	});
	const instance = mount(ManifestEditor, { target, props });
	return { target, instance, props };
}

describe('ManifestEditor.svelte — resincronización de initialManifestRaw', () => {
	let mounted: ReturnType<typeof mountEditor> | null = null;

	afterEach(async () => {
		if (mounted) {
			await unmount(mounted.instance);
			mounted.target.remove();
			mounted = null;
		}
	});

	test('editor SIN cambios sin guardar: un cambio externo del manifiesto re-siembra el textarea en silencio', async () => {
		const original: JsonValue = { schemaVersion: 1, site: { name: 'Original' } };
		mounted = mountEditor({ initialManifestRaw: original });
		const textarea = mounted.target.querySelector<HTMLTextAreaElement>(
			'#manifest-editor-textarea'
		)!;
		expect(textarea.value).toBe(JSON.stringify(original, null, 2));

		// El OTRO escritor de /settings (RevisionsSettings) acaba de guardar: el padre reasigna
		// `initialManifestRaw` con una referencia NUEVA que incluye el cambio.
		const externallyChanged: JsonValue = {
			schemaVersion: 1,
			site: { name: 'Original' },
			revisions: { enabled: true, keepPerRecord: 5, trashDays: 10 }
		};
		mounted.props.initialManifestRaw = externallyChanged;
		await tick();

		expect(textarea.value).toBe(JSON.stringify(externallyChanged, null, 2));
		expect(mounted.target.querySelector('.manifest-editor-external-change')).toBeNull();
	});

	test('editor CON cambios sin guardar: un cambio externo NO pisa el borrador, y avisa discretamente', async () => {
		const original: JsonValue = { schemaVersion: 1, site: { name: 'Original' } };
		mounted = mountEditor({ initialManifestRaw: original });
		const textarea = mounted.target.querySelector<HTMLTextAreaElement>(
			'#manifest-editor-textarea'
		)!;

		// La persona edita el textarea (borrador sin guardar).
		const draft = JSON.stringify({ schemaVersion: 1, site: { name: 'Editando…' } }, null, 2);
		textarea.value = draft;
		textarea.dispatchEvent(new Event('input', { bubbles: true }));
		await tick();
		expect(textarea.value).toBe(draft);

		// El OTRO escritor guarda mientras tanto.
		const externallyChanged: JsonValue = {
			schemaVersion: 1,
			site: { name: 'Original' },
			revisions: { enabled: true, keepPerRecord: 5, trashDays: 10 }
		};
		mounted.props.initialManifestRaw = externallyChanged;
		await tick();

		// El borrador NO se pierde…
		expect(textarea.value).toBe(draft);
		// …pero se avisa de que el manifiesto cambió por otro sitio.
		expect(mounted.target.querySelector('.manifest-editor-external-change')).not.toBeNull();
	});

	test('el guardado propio de ESTE editor nunca dispara el aviso de "cambiado por otro sitio"', async () => {
		// Regresión del falso positivo: `saveManifest` puede devolver un JSON re-serializado que no
		// es byte a byte idéntico al texto que había en el `<textarea>` (reformateo de
		// `JSON.stringify`) — sin trato especial, el propio guardado se confundiría con un cambio
		// externo.
		const original: JsonValue = { schemaVersion: 1, site: { name: 'Original' } };
		let resolveSave!: (persisted: JsonValue) => void;
		const onSave = vi.fn(
			() =>
				new Promise<void>((resolve) => {
					resolveSave = (persisted) => {
						// Simula lo que hace `/settings/+page.svelte#handleSave`: reasigna la prop con
						// lo que `saveManifest` devolvió.
						mounted!.props.initialManifestRaw = persisted;
						resolve();
					};
				})
		);
		mounted = mountEditor({ initialManifestRaw: original, onSave });

		const textarea = mounted.target.querySelector<HTMLTextAreaElement>(
			'#manifest-editor-textarea'
		)!;
		// Formato compacto a propósito (distinto del `JSON.stringify(..., null, 2)` canónico): el
		// eco del guardado ("lo que quedó persistido") se re-serializará con indentado de 2
		// espacios, byte a byte DISTINTO de este texto compacto.
		const compact = '{"schemaVersion":1,"site":{"name":"Original editado"}}';
		textarea.value = compact;
		textarea.dispatchEvent(new Event('input', { bubbles: true }));
		await tick();

		mounted.target.querySelector<HTMLButtonElement>('.btn-primary')!.click();
		await tick();
		resolveSave({ schemaVersion: 1, site: { name: 'Original editado' } });
		await tick();
		await tick();

		expect(mounted.target.querySelector('.manifest-editor-external-change')).toBeNull();
	});
});
