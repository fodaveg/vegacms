/**
 * Suite de `resolveVisualGate` (ver su cabecera): las cuatro puertas de `/c/[type]/[id]/visual`,
 * puras — sin montar la ruta ni mockear `$app/state`.
 */
import { describe, expect, test } from 'vitest';
import { resolveVisualGate } from './visual-gate';
import { ALL_PERMISSIONS } from '$lib/backend/access';
import type { ResolvedContentType } from '$lib/model/types';

type Gate = Pick<ResolvedContentType, 'permissions' | 'blocks'>;

// Los permisos se IMPORTAN de `backend/access` en vez de escribirlos aquí: si `TypePermissions`
// gana un campo, esta suite lo hereda en vez de quedarse probando una forma que ya no existe.
const NO_VIEW_PERMISSIONS: Gate['permissions'] = { ...ALL_PERMISSIONS, view: false };
const BLOCKS_CONFIG: NonNullable<Gate['blocks']> = {
	collection: 'landing_block',
	parentField: 'parent',
	orderField: 'sort',
	typeField: null,
	dataField: null
};
const VIEWABLE_TYPE: Gate = { permissions: ALL_PERMISSIONS, blocks: BLOCKS_CONFIG };
const PORT_READY = {
	previewApiUrl: 'https://pb.test/api/vega-preview',
	previewVisualEditing: true
};

describe('resolveVisualGate', () => {
	test('sin permiso de ver: "forbidden" ANTES de mirar nada más', () => {
		const result = resolveVisualGate(
			{ permissions: NO_VIEW_PERMISSIONS, blocks: null },
			{ previewApiUrl: null, previewVisualEditing: false }
		);
		expect(result).toEqual({ status: 'forbidden' });
	});

	test('sin `type.blocks`: "no-blocks"', () => {
		const result = resolveVisualGate({ ...VIEWABLE_TYPE, blocks: null }, PORT_READY);
		expect(result).toEqual({ status: 'no-blocks' });
	});

	test('sin `previewApiUrl`: "no-preview"', () => {
		const result = resolveVisualGate(VIEWABLE_TYPE, {
			previewApiUrl: null,
			previewVisualEditing: true
		});
		expect(result).toEqual({ status: 'no-preview' });
	});

	test('`previewVisualEditing` falso (ausente o `false`): "no-visual-editing"', () => {
		expect(
			resolveVisualGate(VIEWABLE_TYPE, {
				previewApiUrl: PORT_READY.previewApiUrl,
				previewVisualEditing: false
			})
		).toEqual({ status: 'no-visual-editing' });
		expect(resolveVisualGate(VIEWABLE_TYPE, { previewApiUrl: PORT_READY.previewApiUrl })).toEqual({
			status: 'no-visual-editing'
		});
	});

	test('las cuatro puertas abiertas: "ok"', () => {
		expect(resolveVisualGate(VIEWABLE_TYPE, PORT_READY)).toEqual({ status: 'ok' });
	});
});
