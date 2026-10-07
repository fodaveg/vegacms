/**
 * `after-save.ts` (lote 12, lámina 5): lo que un widget necesita hacer DESPUÉS de que el registro
 * se haya escrito y ANTES de que el formulario se reasiente sobre lo guardado. `WidgetProps` no
 * lleva ningún canal de vuelta hacia `RecordForm` (D-P5.1), así que, igual que la identidad del
 * registro (`record-context.ts`), va por contexto de Svelte: `RecordForm.svelte` publica un
 * registro de ganchos y el widget se apunta al montar y se da de baja al desmontar.
 *
 * Hoy lo usa solo el widget `file`: la copia a Medios de las imágenes subidas desde el campo, con
 * su texto alternativo, que no puede hacerse antes (si el guardado falla, no hay nada que copiar)
 * ni después de reasentar (para entonces los `File` ya son `FileRef` y la fila que enseña
 * «Guardando en Medios…» tiene que seguir siendo la del fichero pendiente).
 *
 * Contrato de un gancho: recibe el registro guardado, hace su trabajo y devuelve, opcionalmente,
 * una frase para el toast de «Guardado.» (p. ej. «Imagen añadida a Medios.»). Los ganchos corren
 * EN SECUENCIA (una escritura a la vez, mismo criterio que el lote de subida de `/media`) y un
 * gancho que lanza NO tumba el guardado ni a los demás: el registro ya está escrito y el propio
 * gancho es quien pinta su error en su sitio; aquí solo se descarta su frase.
 */

import { getContext, setContext } from 'svelte';
import type { VegaRecord } from '$lib/backend/types';

/** Un gancho tras guardar: devuelve la frase que añade al toast, o nada. */
type AfterSaveHook = (saved: VegaRecord) => Promise<string | undefined>;

interface AfterSaveRegistry {
	/** Apunta `hook`; devuelve la función de baja (llamarla al desmontar el widget). */
	register(hook: AfterSaveHook): () => void;
	/** Ejecuta los ganchos apuntados, en orden de alta y uno tras otro. Devuelve las frases que
	 *  devolvieron (sin las vacías). Nunca rechaza: un gancho que lanza se salta. */
	run(saved: VegaRecord): Promise<string[]>;
}

/** Construye un registro vacío. Puro (sin Svelte): se prueba sin montar nada. */
export function createAfterSaveRegistry(): AfterSaveRegistry {
	const hooks = new Set<AfterSaveHook>();
	return {
		register(hook) {
			hooks.add(hook);
			return () => {
				hooks.delete(hook);
			};
		},
		async run(saved) {
			const notes: string[] = [];
			// Foto de la lista: un gancho que se dé de baja a mitad no altera el recorrido.
			for (const hook of [...hooks]) {
				try {
					const note = await hook(saved);
					if (note) notes.push(note);
				} catch {
					// El gancho ya ha pintado su error donde corresponde (ver cabecera).
				}
			}
			return notes;
		}
	};
}

/**
 * Clave de contexto. Exportada ÚNICAMENTE para que un test de componente pueda inyectar un
 * registro con `mount(Componente, { context: new Map([[AFTER_SAVE_KEY, registry]]) })` (mismo
 * criterio que `VEGA_CONTEXT_KEY` en `$lib/app-context`); en producción el único camino es
 * `setAfterSaveRegistry`/`getAfterSaveRegistry`.
 */
export const AFTER_SAVE_KEY = Symbol('vega-after-save');

/** Publica `registry` para que los widgets descendientes se apunten. */
export function setAfterSaveRegistry(registry: AfterSaveRegistry): void {
	setContext(AFTER_SAVE_KEY, registry);
}

/** Lee el registro publicado por un `RecordForm` ancestro, o `null` si no hay ninguno (widget
 *  montado fuera de un formulario: degradación explícita, nunca lanza). */
export function getAfterSaveRegistry(): AfterSaveRegistry | null {
	return getContext<AfterSaveRegistry | undefined>(AFTER_SAVE_KEY) ?? null;
}
