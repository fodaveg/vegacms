import { describe, expect, test } from 'vitest';
import type { FileFieldSchema } from './file-value';
import {
	acceptAttr,
	addFilesToMultiple,
	classifyFile,
	classifyFileRef,
	classifyItem,
	isNewFile,
	itemDisplayName,
	removeFromMultiple,
	setSingleFile,
	validateNewFile
} from './file-value';

/** Campo `file` base, mínimo, para no repetir las claves de `FieldBase` en cada test. */
function fileField(overrides: Partial<FileFieldSchema> = {}): FileFieldSchema {
	return {
		name: 'attachment',
		type: 'file',
		multiple: false,
		required: false,
		readonly: false,
		presentable: false,
		hidden: false,
		unique: false,
		protected: false,
		...overrides
	};
}

function makeFile(name: string, type: string, size = 10): File {
	return new File([new Uint8Array(size)], name, { type });
}

describe('validateNewFile', () => {
	test('sin maxSizeBytes ni mimeTypes: siempre admitido', () => {
		expect(validateNewFile(fileField(), makeFile('a.png', 'image/png'))).toBeNull();
	});

	test('maxSizeBytes superado → tooLarge', () => {
		const field = fileField({ maxSizeBytes: 5 });
		expect(validateNewFile(field, makeFile('a.png', 'image/png', 10))).toBe('tooLarge');
	});

	test('maxSizeBytes justo en el límite → admitido (no estrictamente mayor)', () => {
		const field = fileField({ maxSizeBytes: 10 });
		expect(validateNewFile(field, makeFile('a.png', 'image/png', 10))).toBeNull();
	});

	test('mimeTypes exacto: fuera de la lista → invalidType', () => {
		const field = fileField({ mimeTypes: ['image/png', 'image/jpeg'] });
		expect(validateNewFile(field, makeFile('a.gif', 'image/gif'))).toBe('invalidType');
	});

	test('mimeTypes exacto: dentro de la lista → admitido', () => {
		const field = fileField({ mimeTypes: ['image/png', 'image/jpeg'] });
		expect(validateNewFile(field, makeFile('a.png', 'image/png'))).toBeNull();
	});

	test('mimeTypes con comodín "image/*": cualquier subtipo de imagen admitido', () => {
		const field = fileField({ mimeTypes: ['image/*'] });
		expect(validateNewFile(field, makeFile('a.webp', 'image/webp'))).toBeNull();
		expect(validateNewFile(field, makeFile('a.pdf', 'application/pdf'))).toBe('invalidType');
	});

	test('tamaño Y tipo inválidos a la vez: gana tooLarge (se comprueba primero)', () => {
		const field = fileField({ maxSizeBytes: 5, mimeTypes: ['image/png'] });
		expect(validateNewFile(field, makeFile('a.pdf', 'application/pdf', 10))).toBe('tooLarge');
	});
});

describe('addFilesToMultiple', () => {
	test('añade varios ficheros válidos a un array vacío', () => {
		const field = fileField({ multiple: true });
		const files = [makeFile('a.png', 'image/png'), makeFile('b.png', 'image/png')];
		const { value, rejections } = addFilesToMultiple(field, [], files);
		expect(value).toEqual(files);
		expect(rejections).toEqual([]);
	});

	test('conserva los elementos existentes (FileRef) y añade los nuevos detrás', () => {
		const field = fileField({ multiple: true });
		const file = makeFile('b.png', 'image/png');
		const { value } = addFilesToMultiple(field, ['existing_a.png'], [file]);
		expect(value).toEqual(['existing_a.png', file]);
	});

	test('un fichero que no pasa mimeTypes/maxSizeBytes NO se añade, y se reporta', () => {
		const field = fileField({ multiple: true, mimeTypes: ['image/png'] });
		const good = makeFile('a.png', 'image/png');
		const bad = makeFile('b.pdf', 'application/pdf');
		const { value, rejections } = addFilesToMultiple(field, [], [good, bad]);
		expect(value).toEqual([good]);
		expect(rejections).toEqual([{ name: 'b.pdf', reason: 'invalidType' }]);
	});

	test('maxSelect: recorta el exceso que llega de golpe, reportado como tooMany', () => {
		const field = fileField({ multiple: true, maxSelect: 2 });
		const files = [
			makeFile('a.png', 'image/png'),
			makeFile('b.png', 'image/png'),
			makeFile('c.png', 'image/png')
		];
		const { value, rejections } = addFilesToMultiple(field, [], files);
		expect(value).toEqual([files[0], files[1]]);
		expect(rejections).toEqual([{ name: 'c.png', reason: 'tooMany' }]);
	});

	test('maxSelect ya agotado por lo existente: ningún fichero nuevo entra', () => {
		const field = fileField({ multiple: true, maxSelect: 1 });
		const file = makeFile('b.png', 'image/png');
		const { value, rejections } = addFilesToMultiple(field, ['existing_a.png'], [file]);
		expect(value).toEqual(['existing_a.png']);
		expect(rejections).toEqual([{ name: 'b.png', reason: 'tooMany' }]);
	});

	test('no muta el array `current` recibido', () => {
		const field = fileField({ multiple: true });
		const current: string[] = ['existing_a.png'];
		addFilesToMultiple(field, current, [makeFile('b.png', 'image/png')]);
		expect(current).toEqual(['existing_a.png']);
	});
});

describe('setSingleFile', () => {
	test('fichero válido reemplaza el value único', () => {
		const field = fileField();
		const file = makeFile('a.png', 'image/png');
		expect(setSingleFile(field, null, file)).toEqual({ value: file, rejections: [] });
		expect(setSingleFile(field, 'existing.png', file)).toEqual({ value: file, rejections: [] });
	});

	test('fichero inválido conserva el value existente (no lo toca) y reporta el motivo', () => {
		const field = fileField({ mimeTypes: ['image/png'] });
		const bad = makeFile('a.pdf', 'application/pdf');
		expect(setSingleFile(field, 'existing.png', bad)).toEqual({
			value: 'existing.png',
			rejections: [{ name: 'a.pdf', reason: 'invalidType' }]
		});
	});
});

describe('removeFromMultiple', () => {
	test('quita una FileRef por valor', () => {
		expect(removeFromMultiple(['a.png', 'b.png'], 'a.png')).toEqual(['b.png']);
	});

	test('quita un File por referencia, no por igualdad estructural', () => {
		const kept = makeFile('a.png', 'image/png');
		const removed = makeFile('a.png', 'image/png'); // mismo nombre/tipo, objeto DISTINTO
		expect(removeFromMultiple([kept, removed], removed)).toEqual([kept]);
	});

	test('no muta el array recibido', () => {
		const current = ['a.png', 'b.png'];
		removeFromMultiple(current, 'a.png');
		expect(current).toEqual(['a.png', 'b.png']);
	});
});

describe('clasificación imagen-vs-otro (Audit Finding 4)', () => {
	test('classifyFile: por el mime real del File', () => {
		expect(classifyFile(makeFile('a.png', 'image/png'))).toBe('image');
		expect(classifyFile(makeFile('a.pdf', 'application/pdf'))).toBe('other');
	});

	test('classifyFileRef: aproxima por la extensión del nombre', () => {
		expect(classifyFileRef('token123_photo.JPG')).toBe('image');
		expect(classifyFileRef('token123_report.pdf')).toBe('other');
		expect(classifyFileRef('token123_no-extension')).toBe('other');
	});

	test('classifyItem: delega en classifyFile o classifyFileRef según el tipo del item', () => {
		expect(classifyItem(makeFile('a.png', 'image/png'))).toBe('image');
		expect(classifyItem('token123_photo.png')).toBe('image');
		expect(classifyItem('token123_doc.pdf')).toBe('other');
	});
});

describe('isNewFile / itemDisplayName / acceptAttr', () => {
	test('isNewFile distingue File de FileRef', () => {
		expect(isNewFile(makeFile('a.png', 'image/png'))).toBe(true);
		expect(isNewFile('token123_a.png')).toBe(false);
	});

	test('itemDisplayName: el name real de un File, o la FileRef tal cual', () => {
		expect(itemDisplayName(makeFile('a.png', 'image/png'))).toBe('a.png');
		expect(itemDisplayName('token123_a.png')).toBe('token123_a.png');
	});

	test('acceptAttr: undefined sin mimeTypes; join(",") con mimeTypes', () => {
		expect(acceptAttr(fileField())).toBeUndefined();
		expect(acceptAttr(fileField({ mimeTypes: ['image/png', 'image/*'] }))).toBe(
			'image/png,image/*'
		);
	});
});
