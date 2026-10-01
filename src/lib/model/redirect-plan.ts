/**
 * Plan de redirecciones al CAMBIAR la ruta de una página ya PUBLICADA (audit del 30 sep, lote 2;
 * lámina `design/mockups/2026-10-01-ajustes-y-sembrado/C-redireccion-al-cambiar-ruta.html`).
 * Módulo PURO: sin Svelte ni puerto. Recibe lo que ya se sabe (ruta guardada, ruta nueva, si la
 * página está publicada EN EL SERVIDOR y las redirecciones existentes) y devuelve QUÉ habría que
 * hacer; quien lo monta (`RecordForm` + `redirect-sync.ts`) lo pinta y lo ejecuta tras guardar.
 *
 * **No toca la regla del producto** de `page-path.ts`: la ruta nunca se re-deriva sola del título.
 * Esto solo actúa cuando la PERSONA cambia a mano la ruta de una página que ya estaba publicada.
 *
 * **Contrato de `planRedirect`** (la colección `redirects` es la del sitio sembrado: `from` único
 * y con `pattern` `^/`, `to` ruta o http(s), `code` 301|308):
 *   - `null` (no se enseña nada) si: la página no está publicada (un borrador nunca tuvo visitas);
 *     no hay colección `redirects` o quien edita no puede crear, actualizar Y borrar en ella
 *     (`access`, sin error: simplemente no se ofrece); la ruta no cambió; o la vieja o la nueva
 *     no son rutas válidas para `redirects` (vacías, sin `/` inicial, con espacios, `from` de más
 *     de 200 caracteres, `to` que no cumple el patrón del sitio).
 *   - `from`/`to` del plan son siempre la ruta vieja y la nueva, tal cual.
 *   - **Bucle**: una redirección cuyo `from` es la ruta nueva (la viva) NUNCA puede quedar: la
 *     ruta de la página ganaría o el visitante daría vueltas. Va a `remove` SIEMPRE, también si
 *     la persona desmarca la oferta. El caso típico: existe `/nueva → /vieja` y la página vuelve
 *     de `/vieja` a `/nueva` (`to === from` del plan); también cualquier `/nueva → /otra`.
 *   - **Conflicto**: ya existe una redirección DESDE la ruta vieja (`existing`). `from` es único,
 *     así que no se puede crear otra. Si ya lleva a la nueva, no hay nada que crear
 *     (`create: false`); si lleva a otra parte, hay dos elecciones (`resolveRedirectOps`).
 *   - **Cadena A→B→C**: redirecciones cuyo `to` es la ruta vieja (`repoint`) pasan a apuntar
 *     directamente a la nueva. No se pregunta: se hace cuando se crea (o se reapunta) la
 *     redirección de la ruta vieja. Si `existing` ya lleva a la nueva, la cadena no se toca
 *     (ya funciona en dos saltos y nadie la ha pedido).
 *   - `create` es `true` solo si hay que CREAR `from → to` (no existe una desde `from`).
 *   - Con `create === false`, sin `existing` que reapuntar ni `remove`, el resultado es `null`.
 *   - La lista recibida puede ser un superconjunto: aquí se filtra por lo relevante. Las
 *     comparaciones son por cadena exacta (las rutas distinguen mayúsculas).
 *
 * **Contrato de `resolveRedirectOps`**: traduce el plan y las elecciones de la persona en
 * escrituras, en el orden que evita violar la unicidad de `from` y los bucles
 * (primero `remove`, luego `update`, al final `create`):
 *   - `remove`: siempre los del plan (el bucle no es negociable).
 *   - Sin conflicto y `createOffered` desmarcado: nada más (la ruta vieja dará «no encontrada»).
 *   - Sin conflicto y marcado: `create { from, to, code: '301' }` + `update` de cada `repoint`.
 *   - Con conflicto (existe `existing` que lleva a otra parte): `conflict: 'repoint'` (por
 *     defecto) actualiza `existing.to` a la nueva Y reapunta la cadena; `'keep'` no toca nada.
 *   - Un `update` nunca deja `to === from` de sí mismo: `planRedirect` ya excluye a la que
 *     tiene `from === to` del plan (va a `remove`).
 */

/** Código de la redirección creada: permanente, como el resto de las del sitio. */
export const REDIRECT_CODE = '301';

/** Una redirección existente, lo mínimo que este módulo necesita de ella. */
export interface RedirectRef {
	id: string;
	from: string;
	to: string;
}

/** Entrada de `planRedirect`. */
export interface RedirectPlanInput {
	/** Ruta guardada (la del servidor). */
	oldPath: string;
	/** Ruta en edición. */
	newPath: string;
	/** ¿La página está publicada EN EL SERVIDOR (baseline), no con el valor sin guardar? */
	published: boolean;
	/** `false` si el proyecto no tiene colección `redirects`. */
	hasRedirects: boolean;
	/** Permisos de quien edita sobre `redirects`. Hacen falta los tres para ofrecer nada. */
	access: { create: boolean; update: boolean; delete: boolean };
	/** Redirecciones existentes (basta con las que tocan la ruta vieja o la nueva). */
	existing: readonly RedirectRef[];
}

/** Lo que hay que enseñar y, tras guardar, ejecutar. */
export interface RedirectPlan {
	from: string;
	to: string;
	/** Hay que crear `from → to`: no existe ninguna redirección desde `from`. */
	create: boolean;
	/** La redirección que YA sale de `from`, si existe (conflicto salvo que ya lleve a `to`). */
	existing: RedirectRef | null;
	/** Redirecciones que llevaban a `from` y pasarán a llevar a `to`. */
	repoint: RedirectRef[];
	/** Redirecciones que se borran porque su `from` es la ruta viva (bucle). */
	remove: RedirectRef[];
}

/** Elecciones de la persona sobre el plan. */
export interface RedirectChoice {
	/** Casilla de la oferta normal (por defecto, marcada). Ignorada si hay conflicto. */
	createOffered: boolean;
	/** Elección del conflicto (por defecto `'repoint'`, «cambiarla para que lleve a la nueva»). */
	conflict: 'repoint' | 'keep';
}

export const DEFAULT_REDIRECT_CHOICE: RedirectChoice = { createOffered: true, conflict: 'repoint' };

/** Escrituras a hacer, ya en orden: borrar, actualizar, crear. */
export interface RedirectOps {
	remove: RedirectRef[];
	update: { ref: RedirectRef; to: string }[];
	create: { from: string; to: string; code: string } | null;
}

/** `from` de `redirects`: `^/` y como mucho 200 caracteres (`site-seeding.ts`). */
const FROM_MAX = 200;
/** `to` de `redirects` (`SITE_SEED_REDIRECT_TO_PATTERN`): ruta con un segundo carácter que no
 *  sea `/`, `\` ni un control o espacio, la raíz sola, o una URL http(s). Se repite aquí para que
 *  el módulo siga siendo puro; un test de contrato lo compara con el del sembrado. */
const TO_PATTERN = new RegExp(String.raw`^(/$|/[^/\\\x00-\x20]|https?://)`);

/** ¿Es `path` un origen válido para `redirects.from`? */
export function isRedirectFrom(path: string): boolean {
	return path.startsWith('/') && path.length <= FROM_MAX && !/\s/.test(path);
}

/** ¿Es `path` un destino válido para `redirects.to`? */
export function isRedirectTo(path: string): boolean {
	return TO_PATTERN.test(path) && !/\s/.test(path);
}

/** Calcula el plan. Ver el contrato de la cabecera. */
export function planRedirect(input: RedirectPlanInput): RedirectPlan | null {
	const { oldPath, newPath, published, hasRedirects, access, existing } = input;
	if (!published || !hasRedirects) return null;
	if (!access.create || !access.update || !access.delete) return null;
	if (oldPath === newPath) return null;
	if (!isRedirectFrom(oldPath) || !isRedirectFrom(newPath) || !isRedirectTo(newPath)) return null;

	const fromOld = existing.find((r) => r.from === oldPath) ?? null;
	const remove = existing.filter((r) => r.from === newPath);
	const alreadyThere = fromOld !== null && fromOld.to === newPath;
	const repoint = alreadyThere
		? []
		: existing.filter((r) => r.to === oldPath && r.from !== newPath && r.from !== oldPath);
	const create = fromOld === null;

	if (!create && alreadyThere && remove.length === 0) return null;
	return { from: oldPath, to: newPath, create, existing: fromOld, repoint, remove };
}

/** ¿Hay conflicto que decidir? Existe una redirección desde `from` que lleva a otra parte. */
export function hasRedirectConflict(plan: RedirectPlan): boolean {
	return plan.existing !== null && plan.existing.to !== plan.to;
}

/** Traduce plan + elecciones en escrituras. Ver el contrato de la cabecera. */
export function resolveRedirectOps(plan: RedirectPlan, choice: RedirectChoice): RedirectOps {
	const ops: RedirectOps = { remove: [...plan.remove], update: [], create: null };
	if (hasRedirectConflict(plan)) {
		if (choice.conflict === 'repoint' && plan.existing) {
			ops.update.push({ ref: plan.existing, to: plan.to });
			for (const ref of plan.repoint) ops.update.push({ ref, to: plan.to });
		}
		return ops;
	}
	if (plan.create && choice.createOffered) {
		for (const ref of plan.repoint) ops.update.push({ ref, to: plan.to });
		ops.create = { from: plan.from, to: plan.to, code: REDIRECT_CODE };
	}
	return ops;
}

/** `true` si las escrituras no hacen nada. */
export function isEmptyRedirectOps(ops: RedirectOps): boolean {
	return ops.remove.length === 0 && ops.update.length === 0 && ops.create === null;
}
