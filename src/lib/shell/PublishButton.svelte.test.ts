/**
 * Suite de `PublishButton.svelte` (lote "publicación", fase A): ausencia total sin
 * `ctx.port.buildApiUrl`, los estados reales (inactivo/en curso/fallo con enlace al log/listo) y
 * que el disparador manda el token de sesión en `Authorization`. Montaje real (proyecto vitest
 * `component`, `mount`/`unmount` de Svelte 5), mismo patrón que
 * `form/widgets/FileInput.svelte.test.ts`. `fetch` se stubea globalmente (mismo criterio que
 * `session/BackendUrlForm.svelte.test.ts`): el cliente de build (`backend/build-client.ts`) usa
 * el `fetch` global cuando este componente no le inyecta uno propio.
 *
 * Temporizadores REALES a propósito (no `vi.useFakeTimers()`): el sondeo (`pollBuildStatus`)
 * encadena un `setTimeout(…, 0)` con varias promesas (`fetchStatus` → `onStatus` →
 * `detectUnpublishedChanges` → `port.list`), y avanzar temporizadores falsos NO garantiza drenar
 * esa cadena de microtasks completa. `flush()` espera un macrotask real (tiempo de sobra para que
 * Node drene TODOS los microtasks pendientes antes de seguir) y un `tick()` de Svelte para que el
 * DOM refleje el `$state` ya actualizado.
 */
import { mount, tick, unmount } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import PublishButton from './PublishButton.svelte';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import type { BackendPort } from '$lib/backend/port';
import type { BuildStatus, ContentType, Field } from '$lib/backend';

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

async function flush(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 10));
	await tick();
}

const updatedField: Field = {
	name: 'updated',
	type: 'date',
	readonly: true,
	required: false,
	presentable: false,
	hidden: false,
	unique: false
};

/** Un único `ContentType` con campo `updated`, para que `detectUnpublishedChanges` pueda
 *  determinar algo (`hasChanges` real, no `null`) en los tests que lo necesitan. */
const postSchema: ContentType = { name: 'post', readonly: false, fields: [updatedField] };

function fakePort(buildApiUrl: string | null): BackendPort {
	return {
		buildApiUrl,
		list: vi
			.fn()
			.mockResolvedValue({ items: [], page: 1, perPage: 1, totalItems: 0, totalPages: 0 })
	} as unknown as BackendPort;
}

function fakeCtx(opts: { buildApiUrl: string | null; withPostType?: boolean }): VegaAppContext {
	return {
		port: fakePort(opts.buildApiUrl),
		model: { types: opts.withPostType ? [{ schema: postSchema }] : [] },
		session: { token: 'tok-123', user: { id: 'u1', email: 'a@b.test' }, expiresAt: null },
		t: (key: string, params?: Record<string, string | number>) =>
			params ? `${key}:${JSON.stringify(params)}` : key,
		locale: 'es',
		icons: { knownIcons: [], has: () => true },
		reloadModel: async () => {},
		nav: {},
		feedback: { toast: vi.fn(), reportError: vi.fn() },
		registerExitGuard: () => () => {}
	} as unknown as VegaAppContext;
}

function mountButton(ctx: VegaAppContext): {
	target: HTMLElement;
	instance: ReturnType<typeof mount>;
} {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const instance = mount(PublishButton, { target, context: new Map([[VEGA_CONTEXT_KEY, ctx]]) });
	return { target, instance };
}

describe('PublishButton.svelte', () => {
	let mounted: { target: HTMLElement; instance: ReturnType<typeof mount> } | null = null;

	afterEach(async () => {
		if (mounted) {
			await unmount(mounted.instance);
			mounted.target.remove();
			mounted = null;
		}
		vi.unstubAllGlobals();
	});

	test('sin ctx.port.buildApiUrl: no renderiza NADA (ni un botón deshabilitado)', async () => {
		mounted = mountButton(fakeCtx({ buildApiUrl: null }));
		await flush();
		expect(mounted.target.querySelector('.vega-publish-trigger')).toBeNull();
	});

	test('estado "no-changes": lo anuncia pero sigue pulsable — ninguna colección con campo "updated" tiene registros', async () => {
		const idle: BuildStatus = {
			state: 'idle',
			startedAt: null,
			finishedAt: null,
			lastPublishedAt: '2026-07-20T09:00:00.000Z',
			logUrl: null
		};
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(idle)));
		mounted = mountButton(
			fakeCtx({ buildApiUrl: 'https://pb.test/api/vega-build', withPostType: true })
		);
		await flush();

		const button = mounted.target.querySelector<HTMLButtonElement>('.vega-publish-trigger');
		expect(button).not.toBeNull();
		// "Sin cambios" se COMUNICA, pero no bloquea: republicar sin cambios es inofensivo y
		// deshabilitar convertiría cualquier desfase del indicador en una trampa sin salida (ver el
		// comentario de `disabled` en el componente).
		expect(button?.disabled).toBe(false);
		expect(button?.getAttribute('data-state')).toBe('no-changes');
		expect(button?.textContent).toContain('topbar.publish.noChanges');
	});

	test('sin ContentType con campo "updated" legible: hasChanges es null → NUNCA bloquea el botón', async () => {
		const idle: BuildStatus = {
			state: 'idle',
			startedAt: null,
			finishedAt: null,
			lastPublishedAt: null,
			logUrl: null
		};
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(idle)));
		mounted = mountButton(
			fakeCtx({ buildApiUrl: 'https://pb.test/api/vega-build', withPostType: false })
		);
		await flush();

		const button = mounted.target.querySelector<HTMLButtonElement>('.vega-publish-trigger');
		expect(button?.disabled).toBe(false);
		expect(button?.getAttribute('data-state')).toBe('ready');
	});

	test('estado "running": deshabilitado mientras el sondeo siga viendo running', async () => {
		const running: BuildStatus = {
			state: 'running',
			startedAt: '2026-07-25T10:00:00.000Z',
			finishedAt: null,
			lastPublishedAt: null,
			logUrl: null
		};
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(running)));
		mounted = mountButton(fakeCtx({ buildApiUrl: 'https://pb.test/api/vega-build' }));
		await flush();

		const button = mounted.target.querySelector<HTMLButtonElement>('.vega-publish-trigger');
		expect(button?.disabled).toBe(true);
		expect(button?.getAttribute('data-state')).toBe('running');
	});

	test('estado "failed": accionable, y con logUrl muestra el enlace al registro', async () => {
		const failed: BuildStatus = {
			state: 'failed',
			startedAt: '2026-07-25T10:00:00.000Z',
			finishedAt: '2026-07-25T10:02:00.000Z',
			lastPublishedAt: null,
			logUrl: 'https://ci.example.test/runs/42'
		};
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(failed)));
		mounted = mountButton(fakeCtx({ buildApiUrl: 'https://pb.test/api/vega-build' }));
		await flush();

		const button = mounted.target.querySelector<HTMLButtonElement>('.vega-publish-trigger');
		expect(button?.disabled).toBe(false);
		expect(button?.getAttribute('data-state')).toBe('failed');
		const log = mounted.target.querySelector<HTMLAnchorElement>('.vega-publish-log');
		expect(log?.href).toBe('https://ci.example.test/runs/42');
	});

	test('click en estado accionable dispara POST /trigger con el token de sesión en Authorization', async () => {
		const idle: BuildStatus = {
			state: 'idle',
			startedAt: null,
			finishedAt: null,
			lastPublishedAt: null,
			logUrl: null
		};
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse(idle)) // primer sondeo, al montar
			.mockResolvedValueOnce(jsonResponse({ id: 'run-1' }, 202)) // trigger()
			.mockResolvedValue(jsonResponse({ ...idle, state: 'running' })); // sondeo tras el trigger
		vi.stubGlobal('fetch', fetchMock);
		mounted = mountButton(fakeCtx({ buildApiUrl: 'https://pb.test/api/vega-build' }));
		await flush();

		const button = mounted.target.querySelector<HTMLButtonElement>('.vega-publish-trigger');
		expect(button?.disabled).toBe(false);

		button?.click();
		await flush(); // POST /trigger + primer sondeo del nuevo ciclo

		const [triggerUrl, triggerInit] = fetchMock.mock.calls[1] as [string, RequestInit];
		expect(triggerUrl).toBe('https://pb.test/api/vega-build/trigger');
		expect(triggerInit.method).toBe('POST');
		expect((triggerInit.headers as Record<string, string>).Authorization).toBe('tok-123');
	});
});
