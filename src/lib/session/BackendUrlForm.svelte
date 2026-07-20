<script lang="ts">
	/**
	 * Formulario de configuración de la URL de backend (lote L5, distribución/onboarding
	 * genérico): permite apuntar Vega a CUALQUIER PocketBase, en runtime, sin editar ficheros ni
	 * recompilar (D-L5 de David: pantalla de primer arranque + reconfiguración posterior). Guarda
	 * el override en `localStorage` (`backend-override.ts`) y recarga la página — el singleton
	 * memoizado de `backend.ts` se reconstruye contra la nueva URL en el próximo arranque, es el
	 * mecanismo honesto (nunca se intenta recrear el `BackendPort` en caliente).
	 *
	 * Componente DELIBERADAMENTE sin `VegaAppContext`: se monta en `/login` (§2.4, todavía sin
	 * sesión ni contexto — mismo motivo por el que esa ruta resuelve `t()` a mano) y en
	 * `/settings` (con contexto completo). Recibe `t` como prop, igual de válido en ambos sitios.
	 *
	 * "Probar conexión" es un `fetch` best-effort a `${url}/api/health` (el healthcheck de
	 * PocketBase): NUNCA bloquea el guardado — si CORS lo bloquea o el servidor no responde, el
	 * usuario puede guardar igualmente (la URL puede ser correcta y el probe fallar solo porque
	 * CORS no está configurado TODAVÍA, ver `docs/POCKETBASE-INTEGRATION.md`).
	 *
	 * `confirmBeforeReload` (fix de code-review de L5): en `/settings` esta sección es VECINA del
	 * `ManifestEditor` en la misma página, sin dirty-tracking cruzado — un `Guardar`/`Restablecer`
	 * aquí recargaría la página entera y descartaría una edición en curso del manifiesto sin
	 * avisar. `/login` (§2.4, sin sesión ni editor que perder) lo deja en `false` (default): ahí
	 * el `confirm()` extra solo sería fricción. Mismo patrón que `editor.leaveConfirm`
	 * (`RecordForm.svelte`/`MediaDetail.svelte`): `window.confirm()` directo, sin envoltura —
	 * best-effort, si el usuario cancela NO se escribe/borra el override ni se recarga (estado
	 * consistente).
	 */
	import { isAbsoluteUrl } from './backend-config';
	import {
		clearBackendOverride,
		readBackendOverride,
		writeBackendOverride
	} from './backend-override';

	interface Props {
		t: (key: string, params?: Record<string, string | number>) => string;
		confirmBeforeReload?: boolean;
	}

	const { t, confirmBeforeReload = false }: Props = $props();

	/** Override YA guardado al montar (leído una vez: tras guardar/restablecer recargamos la
	 *  página entera, así que no hace falta reactividad más fina que un `$state` local). */
	let currentOverride = $state(readBackendOverride());

	let url = $state(currentOverride ?? '');
	let error = $state<string | null>(null);

	type TestStatus = 'idle' | 'testing' | 'ok' | 'fail';
	let testStatus = $state<TestStatus>('idle');

	/** Quita una barra final antes de componer `${base}/api/health`: `new URL()` ya normaliza el
	 *  origen, pero el usuario puede teclear `https://pb.example.com/` con barra incluida. */
	function normalize(raw: string): string {
		return raw.trim().replace(/\/+$/, '');
	}

	/** Fix de code-review de L5: sin esto, probar la URL A ("Conexión correcta") y luego editar el
	 *  campo a B sin volver a probar dejaba el mensaje/error de A visible para una URL que ya no
	 *  es la del input — obsoleto y engañoso. Cualquier edición del campo vuelve a `'idle'`/limpia
	 *  el error; el siguiente "Probar conexión"/"Guardar" reevalúa desde cero. */
	function handleUrlInput(): void {
		testStatus = 'idle';
		error = null;
	}

	/** `confirm()` best-effort SOLO si `confirmBeforeReload` (ver cabecera). Sin prop, o si el
	 *  usuario confirma, devuelve `true` (seguir); si cancela, `false` (abortar ANTES de tocar
	 *  `localStorage`, para no dejar un estado a medias). */
	function confirmReloadIfNeeded(): boolean {
		if (!confirmBeforeReload) return true;
		return window.confirm(t('connect.reloadConfirm'));
	}

	async function handleTest(): Promise<void> {
		const trimmed = normalize(url);
		if (!isAbsoluteUrl(trimmed)) {
			error = t('connect.invalidUrl');
			return;
		}
		error = null;
		testStatus = 'testing';
		try {
			const res = await fetch(`${trimmed}/api/health`, { cache: 'no-store' });
			testStatus = res.ok ? 'ok' : 'fail';
		} catch {
			testStatus = 'fail';
		}
	}

	function handleSave(event: SubmitEvent): void {
		event.preventDefault();
		const trimmed = normalize(url);
		if (!isAbsoluteUrl(trimmed)) {
			error = t('connect.invalidUrl');
			return;
		}
		if (!confirmReloadIfNeeded()) return;
		writeBackendOverride(trimmed);
		window.location.reload();
	}

	function handleReset(): void {
		if (!confirmReloadIfNeeded()) return;
		clearBackendOverride();
		window.location.reload();
	}
</script>

<div class="vega-backend-form">
	<p class="vega-backend-current">
		{#if currentOverride}
			{t('connect.current.override', { url: currentOverride })}
		{:else}
			{t('connect.current.sameOrigin')}
		{/if}
	</p>

	<form onsubmit={handleSave} novalidate>
		<div class="field">
			<label for="backend-url">{t('connect.urlLabel')}</label>
			<input
				id="backend-url"
				name="backendUrl"
				type="url"
				placeholder={t('connect.urlPlaceholder')}
				aria-invalid={error ? 'true' : undefined}
				bind:value={url}
				oninput={handleUrlInput}
			/>
		</div>

		{#if error}
			<p class="vega-backend-error" role="alert">{error}</p>
		{/if}

		{#if testStatus !== 'idle'}
			<p class="vega-backend-test-result" role="status" aria-live="polite">
				{#if testStatus === 'testing'}
					{t('connect.testing')}
				{:else if testStatus === 'ok'}
					{t('connect.testOk')}
				{:else}
					{t('connect.testFail')}
				{/if}
			</p>
		{/if}

		<div class="vega-backend-actions">
			<button type="button" onclick={handleTest} disabled={testStatus === 'testing'}>
				{t('connect.test')}
			</button>
			<button type="submit">{t('connect.save')}</button>
			{#if currentOverride}
				<button type="button" onclick={handleReset}>{t('connect.reset')}</button>
			{/if}
		</div>
	</form>
</div>

<style>
	.vega-backend-form {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.vega-backend-current {
		margin: 0;
		font-size: 0.85rem;
		color: var(--ink-2);
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	label {
		font-size: 0.85rem;
		font-weight: 600;
	}

	input {
		padding: 0.5rem 0.6rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		font-size: 1rem;
	}

	input[aria-invalid='true'] {
		border-color: var(--danger);
	}

	.vega-backend-error {
		margin: 0;
		color: var(--danger);
		font-size: 0.85rem;
	}

	.vega-backend-test-result {
		margin: 0;
		font-size: 0.85rem;
	}

	.vega-backend-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.vega-backend-actions button {
		padding: 0.45rem 0.8rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface-2);
		color: var(--ink);
		cursor: pointer;
	}

	.vega-backend-actions button[type='submit'] {
		background: var(--accent);
		color: var(--accent-ink);
		font-weight: 600;
	}

	.vega-backend-actions button:disabled {
		cursor: not-allowed;
		opacity: 0.6;
	}
</style>
