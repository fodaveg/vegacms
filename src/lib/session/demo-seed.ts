/**
 * Semilla fija de demo/e2e para el adaptador `memory` (consumida por `backend.ts`). Enriquecida
 * en Fase 2b (P3 §3.3, §4.1, §6) para poder testear la nav LITERAL de verdad: sin esto, la
 * sidebar solo se podía probar en su estado vacío. Escenario cubierto, determinista:
 *
 * - **`posts`**: tipo normal, grupo "Contenido", icono propio (`document`), orden 1. Dos
 *   registros seed (uno `published`, uno `draft`) — contenido real para cuando P4 exista.
 * - **`pages`**: tipo `readonly` (view), MISMO grupo "Contenido", orden 2 — cubre la insignia
 *   "Solo lectura" de `NavItem` (§4.1). Un registro seed (los `readonly` no se crean desde la
 *   UI, así que necesitan venir ya poblados).
 * - **`site_info`**: `singleton: true`, SIN grupo (`group` ausente del manifiesto ⇒ grupo
 *   anónimo) y SIN icono propio ⇒ cubre a la vez "grupo anónimo primero" (§4.9) y la afordancia
 *   de singleton sin icono (icono `settings`, P2 §4.8). Sin registros seed a propósito: ejercita
 *   la resolución runtime "0 registros ⇒ modo creación" (§3.3) cuando algo navega a él (el
 *   índice, al ser el primer `NavItem` del primer grupo).
 * - **`vega`** (la colección reservada, vía `VEGA_COLLECTION` de P1): SIEMPRE oculta (P2-L7), y
 *   el registro de este seed lleva el manifiesto de arriba en su campo `manifest` — así
 *   `loadContentModel` (P2 §6.2) lo lee igual que en un proyecto real, en vez de construir el
 *   `ContentModel` a mano y dejar sin cubrir esa lectura.
 *
 * **Warning sembrado (Fase 3b, §3.5.1/L10)**: `posts.icon` declara `'rocket-unknown'`, que NO está
 * en el set de `knownIcons` (`icons/registry.ts`) → `resolveContentModel` emite exactamente UN
 * `ModelWarning` (`icon-unknown`, P2 §4.8: "se usa el icono genérico"), determinista, para poder
 * testear el badge de la sidebar y `WarningsList` en `/settings` sin recurrir a un manifiesto
 * inválido. Elegido A PROPÓSITO porque `resolve.ts` resuelve el icono desconocido a `null` (nunca
 * lo deja pasar tal cual), así que NO cambia el label/orden/grupo/href de "Entradas" en la sidebar
 * — solo su icono (de `document` a `generic`) — y por tanto no arriesga los 31 e2e existentes que
 * localizan la nav por texto/rol, no por icono.
 *
 * Las credenciales están duplicadas (a propósito, sin importar este módulo) en `e2e/` porque
 * Playwright corre en un runtime Node aparte que no resuelve el alias `$lib`; mantenlas en
 * sincronía si cambian.
 */
import type { ContentType, JsonValue } from '$lib/backend/types';
import { VEGA_COLLECTION } from '$lib/backend/collections';
import type { MemorySeed } from '$lib/backend/adapters/memory';

export const DEMO_CREDENTIALS = { email: 'demo@vega.dev', password: 'vega-demo' };

// ————— Esquema (vocabulario Vega, §7 del contrato P1 — NO es un formato PB) —————

const VEGA_CONTENT_TYPE: ContentType = {
	name: VEGA_COLLECTION.name,
	readonly: false,
	fields: [
		{
			name: 'manifest',
			type: 'json',
			required: false,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: false
		}
	]
};

const POSTS_CONTENT_TYPE: ContentType = {
	name: 'posts',
	readonly: false,
	fields: [
		{
			name: 'title',
			type: 'text',
			subtype: 'plain',
			required: true,
			readonly: false,
			presentable: true,
			hidden: false,
			unique: false,
			maxLength: 120
		},
		{
			name: 'status',
			type: 'select',
			options: ['draft', 'published'],
			multiple: false,
			required: false,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: false
		},
		{
			name: 'body',
			type: 'text',
			subtype: 'plain',
			required: false,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: false
		}
	]
};

const PAGES_CONTENT_TYPE: ContentType = {
	name: 'pages',
	readonly: true, // view: cubre la insignia "Solo lectura" de NavItem (§4.1)
	fields: [
		{
			name: 'title',
			type: 'text',
			subtype: 'plain',
			required: false,
			readonly: false,
			presentable: true,
			hidden: false,
			unique: false
		}
	]
};

const SITE_INFO_CONTENT_TYPE: ContentType = {
	name: 'site_info',
	readonly: false,
	fields: [
		{
			name: 'tagline',
			type: 'text',
			subtype: 'plain',
			required: false,
			readonly: false,
			presentable: true,
			hidden: false,
			unique: false
		}
	]
};

// ————— Manifiesto (§6 del contrato P2), leído por `loadContentModel` desde el registro `vega` —————

const DEMO_MANIFEST: JsonValue = {
	schemaVersion: 1,
	site: { name: 'Vega Demo', locale: 'es' },
	nav: { groups: ['Contenido'] },
	collections: {
		posts: {
			label: 'Entradas',
			labelSingular: 'Entrada',
			// Icono deliberadamente fuera de `knownIcons` (ver cabecera): siembra el warning
			// `icon-unknown` para poder testear el badge/lista de L10 de forma determinista.
			icon: 'rocket-unknown',
			group: 'Contenido',
			order: 1
		},
		pages: {
			label: 'Páginas',
			labelSingular: 'Página',
			icon: 'document',
			group: 'Contenido',
			order: 2
		},
		// Sin `group` (⇒ grupo anónimo, siempre primero, §4.9) ni `icon` (⇒ afordancia de
		// singleton sin icono propio, P2 §4.8).
		site_info: {
			label: 'Información del sitio',
			singleton: true
		}
	}
};

export const DEMO_SEED: MemorySeed = {
	users: [DEMO_CREDENTIALS],
	contentTypes: [VEGA_CONTENT_TYPE, POSTS_CONTENT_TYPE, PAGES_CONTENT_TYPE, SITE_INFO_CONTENT_TYPE],
	records: {
		[VEGA_COLLECTION.name]: [{ id: 'vega_manifest', values: { manifest: DEMO_MANIFEST } }],
		posts: [
			{
				id: 'post_1',
				values: {
					title: 'Bienvenido a Vega',
					status: 'published',
					body: 'Primer texto de ejemplo.'
				}
			},
			{ id: 'post_2', values: { title: 'Borrador en curso', status: 'draft', body: '' } }
		],
		pages: [{ id: 'page_home', values: { title: 'Inicio' } }]
		// site_info sin registros a propósito (ver cabecera): ejercita el modo creación (0 → new).
	}
};
