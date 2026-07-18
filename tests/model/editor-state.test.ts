/**
 * Suite de `editor-state.ts` (§6.4 del contrato P2, Fase 3): `computeEditorState` (parseError,
 * strictErrors, dryRunWarnings, canSave, en todas sus ramas, incl. `knownIcons`),
 * `buildBootstrapImportJson` (JSON de importación para el Admin de PB, §A.5), `buildTemplate`
 * (esqueleto SIEMPRE estrictamente válido con los nombres reales del kitchen-sink) y
 * `prettyPrint`. Sin DOM, sin red: reutiliza el kitchen-sink de `fixture.ts` igual que el resto
 * de `tests/model/`.
 */

import { describe, expect, test } from 'vitest';
import { validateManifestStrict } from '$lib/model/validate';
import {
	computeEditorState,
	prettyPrint,
	buildTemplate,
	buildBootstrapImportJson
} from '$lib/model/editor/editor-state';
import { kitchenSinkTypes, categoryType, postType } from './fixture';

describe('computeEditorState — parseError', () => {
	test('texto que no es JSON → parseError con mensaje; el resto vacío/false', () => {
		const state = computeEditorState('{ esto no es json', kitchenSinkTypes);

		expect(state.parseError).not.toBeNull();
		expect(state.parseError!.message.length).toBeGreaterThan(0);
		expect(state.strictErrors).toEqual([]);
		expect(state.dryRunWarnings).toEqual([]);
		expect(state.canSave).toBe(false);
	});

	test('texto vacío → parseError (JSON.parse("") lanza)', () => {
		const state = computeEditorState('', kitchenSinkTypes);
		expect(state.parseError).not.toBeNull();
		expect(state.canSave).toBe(false);
	});
});

describe('computeEditorState — strictErrors (escritor estricto)', () => {
	test('JSON válido pero no-objeto (array) → parsea, strictErrors no vacío, canSave false', () => {
		const state = computeEditorState('[1, 2, 3]', kitchenSinkTypes);

		expect(state.parseError).toBeNull();
		expect(state.strictErrors.length).toBeGreaterThan(0);
		expect(state.canSave).toBe(false);
	});

	test('clave desconocida en la raíz → strictErrors con el path de esa clave, canSave false', () => {
		const state = computeEditorState(
			JSON.stringify({ schemaVersion: 1, badKey: 1 }),
			kitchenSinkTypes
		);

		expect(state.strictErrors).toContainEqual(expect.objectContaining({ path: '/badKey' }));
		expect(state.canSave).toBe(false);
		// El lector TOLERANTE ignora claves desconocidas sin warning (forward-compat, §5): el
		// dry-run no debe reportar nada por esto, a diferencia del escritor estricto.
		expect(state.dryRunWarnings).toEqual([]);
	});

	test('schemaVersion: 2 → inválido para el escritor (const), pero el dry-run SÍ degrada con warning', () => {
		const state = computeEditorState(JSON.stringify({ schemaVersion: 2 }), kitchenSinkTypes);

		expect(state.strictErrors).toContainEqual(expect.objectContaining({ path: '/schemaVersion' }));
		expect(state.canSave).toBe(false);
		expect(state.dryRunWarnings).toContainEqual(
			expect.objectContaining({ code: 'manifest-version-newer' })
		);
	});
});

describe('computeEditorState — dry-run (killer feature, §6.4)', () => {
	test('manifiesto estrictamente válido que referencia una colección inexistente → canSave true, dryRunWarnings con orphan-collection', () => {
		const raw = JSON.stringify({
			schemaVersion: 1,
			collections: { no_existe: { label: 'Fantasma' } }
		});
		const state = computeEditorState(raw, kitchenSinkTypes);

		expect(state.parseError).toBeNull();
		expect(state.strictErrors).toEqual([]);
		expect(state.canSave).toBe(true);
		expect(state.dryRunWarnings).toContainEqual(
			expect.objectContaining({ code: 'orphan-collection', collection: 'no_existe' })
		);
	});

	test('override de widget incompatible → estrictamente válido pero el dry-run avisa widget-incompatible', () => {
		const raw = JSON.stringify({
			schemaVersion: 1,
			collections: { post: { fields: { content: { widget: 'markdown' } } } }
		});
		const state = computeEditorState(raw, [categoryType, postType]);

		expect(state.canSave).toBe(true);
		expect(state.dryRunWarnings).toContainEqual(
			expect.objectContaining({ code: 'widget-incompatible', collection: 'post', field: 'content' })
		);
	});

	test('manifiesto vacío mínimo { schemaVersion: 1 } → canSave true, sin warnings', () => {
		const state = computeEditorState(JSON.stringify({ schemaVersion: 1 }), kitchenSinkTypes);

		expect(state.canSave).toBe(true);
		expect(state.strictErrors).toEqual([]);
		expect(state.dryRunWarnings).toEqual([]);
	});

	test('manifiesto real y coherente (promoción a markdown) → canSave true, dry-run refleja la promoción', () => {
		const raw = JSON.stringify({
			schemaVersion: 1,
			site: { name: 'fodaveg.net' },
			collections: {
				post: { label: 'Entradas', fields: { body: { widget: 'markdown' } } }
			}
		});
		const state = computeEditorState(raw, [categoryType, postType]);

		expect(state.canSave).toBe(true);
		expect(state.dryRunWarnings).toEqual([]);
	});
});

describe('computeEditorState — knownIcons (paridad con runtime, §4.8, 🟡3)', () => {
	test('con knownIcons, icono declarado fuera del set → icon-unknown en dryRunWarnings', () => {
		const raw = JSON.stringify({
			schemaVersion: 1,
			collections: { post: { icon: 'no-existe' } }
		});
		const state = computeEditorState(raw, [categoryType, postType], ['file-text', 'folder']);

		expect(state.canSave).toBe(true);
		expect(state.dryRunWarnings).toContainEqual(
			expect.objectContaining({ code: 'icon-unknown', collection: 'post' })
		);
	});

	test('sin knownIcons, el mismo icono no declarado en ningún set no produce icon-unknown', () => {
		const raw = JSON.stringify({
			schemaVersion: 1,
			collections: { post: { icon: 'no-existe' } }
		});
		const state = computeEditorState(raw, [categoryType, postType]);

		expect(state.dryRunWarnings).not.toContainEqual(
			expect.objectContaining({ code: 'icon-unknown' })
		);
	});
});

describe('buildBootstrapImportJson (MUST-FIX 2, §A.5)', () => {
	test('produce un JSON válido', () => {
		expect(() => JSON.parse(buildBootstrapImportJson())).not.toThrow();
	});

	test('contiene la colección "vega" de tipo base con el campo "manifest" de tipo json', () => {
		const parsed = JSON.parse(buildBootstrapImportJson()) as Array<{
			name: string;
			type: string;
			fields: Array<{ name: string; type: string }>;
		}>;

		expect(parsed).toHaveLength(1);
		expect(parsed[0].name).toBe('vega');
		expect(parsed[0].type).toBe('base');
		expect(parsed[0].fields).toContainEqual({ name: 'manifest', type: 'json' });
	});

	test('pretty-printed (indentación de 2 espacios)', () => {
		const json = buildBootstrapImportJson();
		expect(json).toBe(JSON.stringify(JSON.parse(json), null, 2));
	});

	test('determinista: dos llamadas producen exactamente el mismo texto', () => {
		expect(buildBootstrapImportJson()).toBe(buildBootstrapImportJson());
	});
});

describe('prettyPrint', () => {
	test('formatea JSON compacto con indentación de 2 espacios', () => {
		expect(prettyPrint('{"schemaVersion":1,"site":{"name":"X"}}')).toBe(
			JSON.stringify({ schemaVersion: 1, site: { name: 'X' } }, null, 2)
		);
	});

	test('texto no-JSON → se devuelve tal cual (nunca lanza)', () => {
		expect(prettyPrint('no soy json')).toBe('no soy json');
	});

	test('idempotente: aplicar prettyPrint a un resultado ya formateado no lo cambia', () => {
		const once = prettyPrint('{"a":1,"b":[1,2]}');
		expect(prettyPrint(once)).toBe(once);
	});
});

describe('buildTemplate', () => {
	test('genera JSON estrictamente válido contra validateManifestStrict para el kitchen-sink', () => {
		const template = buildTemplate(kitchenSinkTypes);
		const parsed = JSON.parse(template);

		expect(validateManifestStrict(parsed)).toEqual({ ok: true });
	});

	test('incluye las colecciones reales no reservadas, con label humanizado', () => {
		const parsed = JSON.parse(buildTemplate(kitchenSinkTypes)) as {
			collections: Record<string, { label: string }>;
		};

		expect(Object.keys(parsed.collections).sort()).toEqual(['category', 'post', 'settings_view']);
		expect(parsed.collections.settings_view.label).toBe('Settings view');
	});

	test('omite las colecciones reservadas vega/vega_* (L7)', () => {
		const parsed = JSON.parse(buildTemplate(kitchenSinkTypes)) as {
			collections: Record<string, unknown>;
		};

		expect(parsed.collections.vega).toBeUndefined();
		expect(parsed.collections.vega_media).toBeUndefined();
	});

	test('sin tipos → { schemaVersion: 1, site, collections: {} }, sigue siendo estrictamente válido', () => {
		const parsed = JSON.parse(buildTemplate([]));
		expect(validateManifestStrict(parsed)).toEqual({ ok: true });
		expect(parsed.collections).toEqual({});
	});

	test('pretty-printed (indentación de 2 espacios, mismo formato que prettyPrint)', () => {
		const template = buildTemplate([categoryType]);
		expect(template).toBe(prettyPrint(template));
	});
});
