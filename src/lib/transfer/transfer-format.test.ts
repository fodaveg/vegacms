/**
 * Tests unitarios de `buildTransferDocument`/`transferFilename` (§2 y §3 del contrato, ver la
 * cabecera de `export-collection.ts`).
 */

import { describe, expect, it } from 'vitest';
import {
	buildTransferDocument,
	transferFilename,
	TRANSFER_FORMAT_VERSION
} from './transfer-format';

describe('buildTransferDocument', () => {
	it('fija vegaTransfer a la versión del formato y exported al ISO de `now`', () => {
		const now = new Date('2026-07-26T12:34:56.000Z');

		const doc = buildTransferDocument(
			[{ type: 'posts', records: [] }],
			{ backendUrl: 'https://demo.test', vegaVersion: '0.5.0' },
			now
		);

		expect(doc.vegaTransfer).toBe(TRANSFER_FORMAT_VERSION);
		expect(doc.exported).toBe('2026-07-26T12:34:56.000Z');
		expect(doc.origin).toEqual({ backendUrl: 'https://demo.test', vegaVersion: '0.5.0' });
		expect(doc.collections).toEqual([{ type: 'posts', records: [] }]);
	});
});

describe('transferFilename', () => {
	it('extensión .vega.json (§3: "descarga el JSON como fichero")', () => {
		expect(transferFilename('posts')).toBe('posts.vega.json');
		expect(transferFilename('avisos')).toBe('avisos.vega.json');
	});
});
