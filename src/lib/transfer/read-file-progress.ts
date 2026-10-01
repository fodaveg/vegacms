/**
 * Lee un `File` como texto UTF-8 avisando del avance en bytes — lo que `ImportDialog.svelte` pinta
 * mientras lee un `.vega.json` grande (`File.text()` no da ningún avance). Usa `File.stream()` si
 * el entorno lo tiene; si no, cae a `text()` y avisa solo del final (nunca falla por falta de API).
 *
 * `onProgress(read, total)` se llama tras cada trozo y una última vez con `read === total` al
 * terminar; `total` es `file.size`. Un fichero vacío avisa `(0, 0)` y devuelve `''`.
 */
export async function readTextWithProgress(
	file: File,
	onProgress: (read: number, total: number) => void
): Promise<string> {
	if (typeof file.stream !== 'function') {
		const text = await file.text();
		onProgress(file.size, file.size);
		return text;
	}
	const reader = file.stream().getReader();
	const decoder = new TextDecoder();
	let text = '';
	let read = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		read += value.byteLength;
		text += decoder.decode(value, { stream: true });
		onProgress(read, file.size);
	}
	text += decoder.decode();
	onProgress(file.size, file.size);
	return text;
}
