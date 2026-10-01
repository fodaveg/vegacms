/**
 * `readTextWithProgress`: devuelve el mismo texto que `File.text()` (incluidos multibyte partidos
 * entre trozos) y avisa del avance de forma monótona hasta `total`.
 */
import { describe, expect, it } from 'vitest';
import { readTextWithProgress } from './read-file-progress';

/** `File` cuyo `stream()` entrega trozos de `chunkSize` bytes — fuerza un multibyte partido. */
function chunkedFile(content: string, chunkSize: number): File {
	const bytes = new TextEncoder().encode(content);
	const file = new File([bytes], 'a.vega.json');
	file.stream = () =>
		new ReadableStream<Uint8Array>({
			start(controller) {
				for (let i = 0; i < bytes.length; i += chunkSize) {
					controller.enqueue(bytes.slice(i, i + chunkSize));
				}
				controller.close();
			}
		}) as ReturnType<File['stream']>;
	return file;
}

describe('readTextWithProgress', () => {
	it('devuelve el texto íntegro aunque un carácter multibyte caiga entre dos trozos', async () => {
		const content = '{"título":"ñandú 🌍"}';
		const seen: [number, number][] = [];
		const text = await readTextWithProgress(chunkedFile(content, 3), (r, t) => seen.push([r, t]));

		expect(text).toBe(content);
		const total = new TextEncoder().encode(content).length;
		expect(seen.length).toBeGreaterThan(2);
		expect(seen.at(-1)).toEqual([total, total]);
		for (let i = 1; i < seen.length; i++) expect(seen[i][0]).toBeGreaterThanOrEqual(seen[i - 1][0]);
	});

	it('sin File.stream() cae a text() y avisa del final', async () => {
		const file = new File(['hola'], 'a.json');
		(file as { stream?: unknown }).stream = undefined;
		const seen: [number, number][] = [];

		const text = await readTextWithProgress(file, (r, t) => seen.push([r, t]));

		expect(text).toBe('hola');
		expect(seen).toEqual([[4, 4]]);
	});

	it('un fichero vacío devuelve cadena vacía', async () => {
		expect(await readTextWithProgress(chunkedFile('', 4), () => {})).toBe('');
	});
});
