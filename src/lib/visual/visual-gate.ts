/**
 * Puerta de entrada a `/c/[type]/[id]/visual` (tarea "pantalla del editor visual"): decide, ANTES
 * de tocar red, si esta pantalla tiene sentido para un `ResolvedContentType` con el `BackendPort`
 * conectado — las CUATRO condiciones son independientes entre sí y de si el REGISTRO en concreto
 * existe (eso lo decide la ruta cargándolo con `ctx.port.get`, mismo criterio que
 * `/c/[type]/[id]`, ver su cabecera: `not-found` en contexto, cualquier otro error a estado local
 * con "Reintentar").
 *
 * Extraído a módulo PURO (mismo criterio que `nav/content-type.ts#resolveVisibleContentType` o
 * `form/form-sections.ts`): así se prueba sin montar la ruta ni mockear `$app/state` — la ruta le
 * pasa el mismo `ResolvedContentType`/`BackendPort` que ya tiene en `ctx`.
 *
 * Orden de las comprobaciones (documentado porque IMPORTA para el mensaje que ve el autor):
 * 1. `forbidden`: sin permiso de VER esta colección, ni siquiera se dice el resto — mismo
 *    criterio de "cierra el hueco ANTES de tocar el puerto" que `/c/[type]/[id]` (ver su
 *    cabecera, "type válido y con permiso").
 * 2. `no-blocks`: la colección no compone la página por bloques — no hay nada que seleccionar en
 *    un lienzo, con o sin puente.
 * 3. `no-preview`: sin `previewApiUrl` no hay NADA que embeber en el iframe — el editor visual es
 *    ADITIVO sobre el preview de borrador (§"Visual editing bridge" del contrato: "a project that
 *    does not implement `draft` cannot implement this").
 * 4. `no-visual-editing`: el discovery no anuncia el puente. Repárese en que esto es solo una
 *    PROMESA (`BackendPort.previewVisualEditing`, ver su cabecera): el SALUDO real
 *    (`bridge-client.ts`) es quien de verdad demuestra la capacidad. Este chequeo no sustituye al
 *    saludo, solo evita abrir un lienzo cuando el propio proyecto ni siquiera lo anuncia — un
 *    discovery que miente (lo anuncia sin tener el puente) sigue cayendo, más tarde, en el
 *    `error/no-bridge` del cliente del puente.
 *
 * Ninguna de las cuatro deja al autor sin salida: la ruta traduce cada una a un
 * `RouteState`/`unavailable.*` con un botón de vuelta al formulario de siempre (nunca un lienzo
 * mudo).
 */
import type { ResolvedContentType } from '$lib/model/types';
import type { BackendPort } from '$lib/backend';

export type VisualGateResult =
	| { status: 'ok' }
	| { status: 'forbidden' }
	| { status: 'no-blocks' }
	| { status: 'no-preview' }
	| { status: 'no-visual-editing' };

export function resolveVisualGate(
	type: Pick<ResolvedContentType, 'permissions' | 'blocks'>,
	port: Pick<BackendPort, 'previewApiUrl' | 'previewVisualEditing'>
): VisualGateResult {
	if (!type.permissions.view) return { status: 'forbidden' };
	if (!type.blocks) return { status: 'no-blocks' };
	if ((port.previewApiUrl ?? null) === null) return { status: 'no-preview' };
	if (port.previewVisualEditing !== true) return { status: 'no-visual-editing' };
	return { status: 'ok' };
}
