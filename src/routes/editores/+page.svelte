<script lang="ts">
	/**
	 * `/editores`: cuentas de `vega_editors`, la colección con la que entran los editores (lámina
	 * del audit, pieza 5). Solo con `capabilities.administration` y su sección del puerto; un
	 * editor que llega por URL ve la tarjeta «Solo para superusuarios» y nada más.
	 *
	 * Estados: cargando, error con «Reintentar», colección ausente (aviso con dónde crearla: el
	 * sembrado del sitio no tiene botón en la SPA), vacía y lista. La lista se pide junto con
	 * `mailEnabled()`, que decide si «Añadir editor» ofrece invitar por correo y si una cuenta
	 * pendiente ofrece «Reenviar invitación». Si esa segunda lectura falla, se trata como «sin
	 * correo»: la pantalla sigue siendo útil y no promete un envío que no sabe si saldrá.
	 *
	 * Etiqueta de estado = `verified` (medido en PocketBase 0.39.6: una invitación nace pendiente y
	 * pasa a activa cuando la persona confirma el restablecimiento; poner la contraseña a mano la
	 * deja activa). «Quitar acceso» borra la cuenta, con confirmación del mismo patrón que
	 * `DeleteConfirm` (foco inicial en «Cancelar»). La sesión de superusuario no es una cuenta de
	 * esta colección, así que no puede quitarse a sí misma; aun así, una cuenta con el mismo id que
	 * la sesión no ofrece el botón.
	 */
	import { getVegaContext } from '$lib/app-context';
	import {
		VegaError,
		VEGA_EDITORS_COLLECTION_NAME,
		type EditorAccount,
		type NewEditorAccess
	} from '$lib/backend';
	import { DEFAULT_PASSWORD_MIN_LENGTH } from '$lib/backend/administration-rules';
	import Icon from '$lib/icons/Icon.svelte';
	import AdminDialog from '$lib/admin/AdminDialog.svelte';
	import AddEditorDialog from '$lib/admin/AddEditorDialog.svelte';
	import ChangePasswordDialog from '$lib/admin/ChangePasswordDialog.svelte';
	import SuperuserGate from '$lib/admin/SuperuserGate.svelte';
	import { editorInitial } from '$lib/admin/editor-form';
	import { formatDay } from '$lib/admin/format';
	import '$lib/admin/admin.css';

	const ctx = getVegaContext();
	const administration = $derived(
		ctx.port.capabilities.administration ? ctx.port.administration : undefined
	);

	type LoadStatus = 'loading' | 'ready' | 'missing' | 'error';

	let status = $state<LoadStatus>('loading');
	let editors = $state<EditorAccount[]>([]);
	let passwordMinLength = $state(DEFAULT_PASSWORD_MIN_LENGTH);
	let mailEnabled = $state(false);
	let headingEl = $state<HTMLElement | null>(null);

	async function load(): Promise<void> {
		const admin = administration;
		if (!admin) return;
		status = 'loading';
		const mailPromise = admin.mailEnabled().catch(() => false);
		try {
			const directory = await admin.listEditors();
			editors = directory.editors;
			passwordMinLength = directory.passwordMinLength;
			mailEnabled = await mailPromise;
			status = 'ready';
		} catch (err) {
			const vegaErr =
				err instanceof VegaError ? err : VegaError.backend('Error cargando los editores', err);
			if (vegaErr.kind === 'not-found') {
				status = 'missing';
				return;
			}
			ctx.feedback.reportError(vegaErr, { action: 'editors:load' });
			status = 'error';
		}
	}

	$effect(() => {
		if (!administration) return;
		void load();
	});

	function isSelf(account: EditorAccount): boolean {
		return account.id === ctx.session.user.id;
	}

	// ————— Alta —————

	let adding = $state(false);

	function handleCreated(account: EditorAccount, kind: NewEditorAccess['kind']): void {
		adding = false;
		ctx.feedback.toast(
			ctx.t(
				kind === 'invite'
					? 'admin.editors.addDialog.successInvite'
					: 'admin.editors.addDialog.successPassword',
				{ email: account.email }
			),
			{ kind: 'success' }
		);
		void load();
	}

	// ————— Cambiar contraseña —————

	let passwordTarget = $state<EditorAccount | null>(null);

	function handlePasswordChanged(account: EditorAccount): void {
		passwordTarget = null;
		ctx.feedback.toast(ctx.t('admin.editors.passwordDialog.success', { email: account.email }), {
			kind: 'success'
		});
		void load();
	}

	// ————— Reenviar invitación —————

	let resendingId = $state<string | null>(null);

	async function resend(account: EditorAccount): Promise<void> {
		if (resendingId !== null || !administration) return;
		resendingId = account.id;
		try {
			await administration.sendEditorInvitation(account.id);
			ctx.feedback.toast(ctx.t('admin.editors.resendSuccess', { email: account.email }), {
				kind: 'success'
			});
		} catch (err) {
			ctx.feedback.reportError(
				err instanceof VegaError ? err : VegaError.backend('Error al reenviar la invitación', err),
				{ action: 'editors:resend' }
			);
		} finally {
			resendingId = null;
		}
	}

	// ————— Quitar acceso —————

	let removeTarget = $state<EditorAccount | null>(null);
	let removing = $state(false);

	async function confirmRemove(): Promise<void> {
		const target = removeTarget;
		if (!target || removing || !administration) return;
		removing = true;
		try {
			await administration.removeEditor(target.id);
			removing = false;
			removeTarget = null;
			ctx.feedback.toast(ctx.t('admin.editors.removeDialog.success', { email: target.email }), {
				kind: 'success'
			});
			void load();
		} catch (err) {
			removing = false;
			ctx.feedback.reportError(
				err instanceof VegaError ? err : VegaError.backend('Error al quitar el acceso', err),
				{ action: 'editors:remove' }
			);
		}
	}
</script>

<div class="vega-admin-page" data-admin-page="editors">
	{#if !administration}
		<SuperuserGate body={ctx.t('admin.editors.gateBody')} />
	{:else}
		<div class="vega-admin-head">
			<h1 bind:this={headingEl} tabindex="-1">{ctx.t('admin.editors.title')}</h1>
			{#if status === 'ready' && editors.length > 0}
				<span class="vega-admin-meta"><b>{editors.length}</b></span>
				<span class="vega-admin-head-spacer"></span>
				<button
					type="button"
					class="vega-admin-btn vega-admin-btn--primary"
					onclick={() => (adding = true)}
				>
					<Icon id="plus" size={14} />
					{ctx.t('admin.editors.add')}
				</button>
			{/if}
		</div>
		<p class="vega-admin-desc">{ctx.t('admin.editors.description')}</p>

		{#if status === 'loading'}
			<div class="vega-admin-card">
				<div class="vega-admin-state" aria-live="polite" data-editors-state="loading">
					<p><span class="vega-admin-saving">{ctx.t('admin.editors.loading')}</span></p>
				</div>
			</div>
		{:else if status === 'error'}
			<div class="vega-admin-card">
				<div class="vega-admin-state" role="alert" data-editors-state="error">
					<p>{ctx.t('admin.editors.loadError')}</p>
					<button type="button" class="vega-admin-btn" onclick={() => void load()}>
						{ctx.t('common.retry')}
					</button>
				</div>
			</div>
		{:else if status === 'missing'}
			<div class="vega-admin-notice vega-admin-notice--warning" data-editors-state="missing">
				<p class="vega-admin-notice-body">
					{ctx.t('admin.editors.missingCollection', { collection: VEGA_EDITORS_COLLECTION_NAME })}
				</p>
				<div class="vega-admin-notice-actions">
					<button type="button" class="vega-admin-btn" onclick={() => void load()}>
						{ctx.t('common.retry')}
					</button>
				</div>
			</div>
		{:else if editors.length === 0}
			<div class="vega-admin-card">
				<div class="vega-admin-state" data-editors-state="empty">
					<p class="vega-admin-state-title">{ctx.t('admin.editors.emptyTitle')}</p>
					<p>{ctx.t('admin.editors.emptyBody')}</p>
					<button
						type="button"
						class="vega-admin-btn vega-admin-btn--primary"
						onclick={() => (adding = true)}
					>
						<Icon id="plus" size={14} />
						{ctx.t('admin.editors.add')}
					</button>
				</div>
			</div>
		{:else}
			<div class="vega-admin-card" data-editors-state="ready">
				<table class="vega-admin-table">
					<thead>
						<tr>
							<th scope="col">{ctx.t('admin.editors.col.email')}</th>
							<th scope="col">{ctx.t('admin.editors.col.status')}</th>
							<th scope="col" class="vega-admin-right">{ctx.t('admin.editors.col.created')}</th>
							<th scope="col">
								<span class="vega-admin-sr-only">{ctx.t('admin.editors.col.actions')}</span>
							</th>
						</tr>
					</thead>
					<tbody>
						{#each editors as account (account.id)}
							<tr data-editor-email={account.email}>
								<td class="vega-admin-main">
									<span class="vega-admin-who">
										<span class="vega-admin-avatar" aria-hidden="true">
											{editorInitial(account.email)}
										</span>
										<span class="vega-admin-title" title={account.email}>{account.email}</span>
										{#if isSelf(account)}
											<span class="vega-admin-you">({ctx.t('admin.editors.you')})</span>
										{/if}
									</span>
								</td>
								<td class="vega-admin-side">
									{#if account.verified}
										<span class="vega-admin-tag" data-kind="pub">
											{ctx.t('admin.editors.status.active')}
										</span>
									{:else}
										<span
											class="vega-admin-tag"
											data-kind="other"
											title={ctx.t('admin.editors.status.pendingHint')}
										>
											{ctx.t('admin.editors.status.pending')}
										</span>
									{/if}
								</td>
								<td class="vega-admin-right vega-admin-mono vega-admin-meta-cell">
									{#if account.created}
										<span class="vega-admin-stack-only">
											{ctx.t('admin.editors.createdMobile', {
												date: formatDay(account.created, ctx.locale)
											})}
										</span>
										<span class="vega-admin-table-only"
											>{formatDay(account.created, ctx.locale)}</span
										>
									{:else}
										<span title={ctx.t('admin.editors.createdUnknown')}>—</span>
									{/if}
								</td>
								<td class="vega-admin-actions">
									<span class="vega-admin-row-actions">
										{#if !account.verified && mailEnabled}
											<button
												type="button"
												class="vega-admin-btn vega-admin-btn--sm"
												aria-label={ctx.t('admin.editors.resendFor', { email: account.email })}
												aria-disabled={resendingId === account.id}
												onclick={() => void resend(account)}
											>
												{resendingId === account.id
													? ctx.t('admin.editors.resending')
													: ctx.t('admin.editors.resend')}
											</button>
										{/if}
										<button
											type="button"
											class="vega-admin-btn vega-admin-btn--sm"
											aria-label={ctx.t('admin.editors.changePasswordFor', {
												email: account.email
											})}
											onclick={() => (passwordTarget = account)}
										>
											{ctx.t('admin.editors.changePassword')}
										</button>
										{#if !isSelf(account)}
											<button
												type="button"
												class="vega-admin-btn vega-admin-btn--sm vega-admin-btn--danger"
												aria-label={ctx.t('admin.editors.removeFor', { email: account.email })}
												onclick={() => (removeTarget = account)}
											>
												{ctx.t('admin.editors.remove')}
											</button>
										{/if}
									</span>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}

		<AddEditorDialog
			open={adding}
			{mailEnabled}
			{passwordMinLength}
			fallbackFocusEl={headingEl}
			onClose={() => (adding = false)}
			onCreated={handleCreated}
		/>

		<ChangePasswordDialog
			account={passwordTarget}
			{passwordMinLength}
			fallbackFocusEl={headingEl}
			onClose={() => (passwordTarget = null)}
			onChanged={handlePasswordChanged}
		/>

		<AdminDialog
			open={removeTarget !== null}
			role="alertdialog"
			title={ctx.t('admin.editors.removeDialog.title', { email: removeTarget?.email ?? '' })}
			busy={removing}
			showClose={false}
			description={ctx.t('admin.editors.removeDialog.body')}
			fallbackFocusEl={headingEl}
			onClose={() => (removeTarget = null)}
		>
			{#snippet actions()}
				<button
					type="button"
					class="vega-admin-btn"
					aria-disabled={removing}
					data-autofocus=""
					onclick={() => !removing && (removeTarget = null)}
				>
					{ctx.t('common.cancel')}
				</button>
				<button
					type="button"
					class="vega-admin-btn vega-admin-btn--danger"
					aria-disabled={removing}
					onclick={() => void confirmRemove()}
				>
					{removing
						? ctx.t('admin.editors.removeDialog.removing')
						: ctx.t('admin.editors.removeDialog.confirm')}
				</button>
			{/snippet}
		</AdminDialog>
	{/if}
</div>
