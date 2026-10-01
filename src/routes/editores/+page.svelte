<script lang="ts">
	/**
	 * `/editores`: cuentas de `vega_editors`, la colección con la que entran los editores (lámina
	 * del audit, pieza 5). Solo con `capabilities.administration` y su sección del puerto; un
	 * editor que llega por URL ve la tarjeta «Solo para superusuarios» y nada más.
	 *
	 * Estados: cargando, error con «Reintentar», colección ausente (aviso con «Ir a Ajustes», donde
	 * la tarjeta «Base del sitio» la crea), vacía y lista. Debajo, con `capabilities.serverSettings`,
	 * la tarjeta del correo para invitaciones (`MailCard`, carga aparte: que falle no esconde la
	 * lista). La lista se pide junto con
	 * `mailEnabled()`, que decide si «Añadir editor» ofrece invitar por correo y si una cuenta
	 * pendiente ofrece «Reenviar invitación». Si esa segunda lectura falla, se trata como «sin
	 * correo»: la pantalla sigue siendo útil y no promete un envío que no sabe si saldrá. Con la
	 * lista ya cargada, `ensureInvitationLink` deja la plantilla del correo apuntando a
	 * `/restablecer` si seguía la de fábrica y Vega está abierta desde la dirección https del
	 * servidor; si está personalizada, si se abre desde otra dirección o si no se pudo comprobar,
	 * el diálogo de alta lo dice junto a la opción de invitar.
	 *
	 * Etiqueta de estado = `verified` (medido en PocketBase 0.39.6: una invitación nace pendiente y
	 * pasa a activa cuando la persona confirma el restablecimiento; poner la contraseña a mano la
	 * deja activa). «Quitar acceso» borra la cuenta, con confirmación del mismo patrón que
	 * `DeleteConfirm` (foco inicial en «Cancelar»). La sesión de superusuario no es una cuenta de
	 * esta colección, así que no puede quitarse a sí misma; aun así, una cuenta con el mismo id que
	 * la sesión no ofrece el botón.
	 */
	import { goto } from '$app/navigation';
	import { getVegaContext } from '$lib/app-context';
	import {
		VegaError,
		type CreatedEditor,
		type EditorAccount,
		type InvitationLinkState,
		type NewEditorAccess,
		type ServerSettings
	} from '$lib/backend';
	import { DEFAULT_PASSWORD_MIN_LENGTH, sortEditors } from '$lib/backend/administration-rules';
	import { passwordResetRoute, settingsRoute } from '$lib/nav/routes';
	import Icon from '$lib/icons/Icon.svelte';
	import AdminDialog from '$lib/admin/AdminDialog.svelte';
	import AddEditorDialog from '$lib/admin/AddEditorDialog.svelte';
	import ChangePasswordDialog from '$lib/admin/ChangePasswordDialog.svelte';
	import SuperuserGate from '$lib/admin/SuperuserGate.svelte';
	import { editorInitial } from '$lib/admin/editor-form';
	import { formatDay } from '$lib/admin/format';
	import '$lib/admin/admin.css';
	import MailCard from './MailCard.svelte';

	const ctx = getVegaContext();
	const administration = $derived(
		ctx.port.capabilities.administration ? ctx.port.administration : undefined
	);
	const serverSettings = $derived(
		ctx.port.capabilities.serverSettings ? ctx.port.serverSettings : undefined
	);

	type LoadStatus = 'loading' | 'ready' | 'missing' | 'error';

	let status = $state<LoadStatus>('loading');
	let editors = $state<EditorAccount[]>([]);
	let passwordMinLength = $state(DEFAULT_PASSWORD_MIN_LENGTH);
	let mailEnabled = $state(false);
	/** A dónde lleva el enlace del correo de invitación; `'unknown'` si no se pudo comprobar. */
	let inviteLink = $state<InvitationLinkState | 'unknown'>('unknown');
	let headingEl = $state<HTMLElement | null>(null);

	/**
	 * La ruta pública donde el editor elige su contraseña, ABSOLUTA: es lo que se escribe en la
	 * plantilla del correo. Sale del origen en el que el superusuario tiene abierta la app. Que
	 * ese origen sea de fiar para dejarlo escrito en el servidor no se decide aquí: el puerto solo
	 * escribe si coincide con el `appURL` de PocketBase y va por https (`canWriteInvitationLink`),
	 * y si no responde `'foreign-origin'`, que el diálogo de alta explica.
	 */
	function absoluteResetUrl(): string {
		return new URL(passwordResetRoute(), window.location.origin).toString();
	}

	async function load(): Promise<void> {
		const admin = administration;
		if (!admin) return;
		status = 'loading';
		// Las tres lecturas salen a la vez: el adaptador junta las que piden lo mismo (los ajustes del
		// servidor, la colección) en una petición. `ensureInvitationLink` hace que el enlace del correo
		// lleve a `/restablecer` y no al Admin de PocketBase; solo escribe si la plantilla sigue la
		// de fábrica (ver el puerto) y, sin colección, no hay plantilla que tocar. No bloquea la
		// lista: si falla, la invitación avisa de que no se ha podido comprobar.
		const mailPromise = admin.mailEnabled().catch(() => false);
		const linkPromise = admin
			.ensureInvitationLink(absoluteResetUrl())
			.catch((): 'unknown' => 'unknown');
		try {
			const directory = await admin.listEditors();
			editors = directory.editors;
			passwordMinLength = directory.passwordMinLength;
			mailEnabled = await mailPromise;
			status = 'ready';
			inviteLink = await linkPromise;
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

	// ————— Correo para invitaciones (SMTP y dirección de Vega) —————

	let mailStatus = $state<'loading' | 'ready' | 'error'>('loading');
	let mailSettings = $state<ServerSettings | null>(null);

	async function loadMailSettings(): Promise<void> {
		const section = serverSettings;
		if (!section) return;
		mailStatus = 'loading';
		try {
			mailSettings = await section.get();
			mailStatus = 'ready';
		} catch (err) {
			ctx.feedback.reportError(
				err instanceof VegaError
					? err
					: VegaError.backend('Error cargando los ajustes del correo', err),
				{ action: 'editors:mail-load' }
			);
			mailStatus = 'error';
		}
	}

	$effect(() => {
		if (!serverSettings) return;
		void loadMailSettings();
	});

	/**
	 * Tras guardar el correo: «Añadir editor» ofrece invitar según el servidor, y una dirección de Vega
	 * nueva puede hacer que la plantilla del correo ya se pueda corregir en esta misma visita. Si se
	 * corrige, se dice: el enlace de la invitación cambió sin que nadie lo tocara a mano.
	 */
	async function onMailSaved(next: ServerSettings): Promise<void> {
		mailSettings = next;
		const admin = administration;
		if (!admin) return;
		// La respuesta del guardado ya trae si el correo está activado: no hace falta releerlo.
		mailEnabled = next.smtp.enabled;
		const link = await admin
			.ensureInvitationLink(absoluteResetUrl())
			.catch((): 'unknown' => 'unknown');
		if (link === 'updated' && inviteLink !== 'updated') {
			ctx.feedback.toast(ctx.t('admin.appUrl.linkFixed'), { kind: 'success' });
		}
		inviteLink = link;
	}

	// ————— Alta —————

	let adding = $state(false);

	function handleCreated(account: CreatedEditor, kind: NewEditorAccess['kind']): void {
		adding = false;
		// Cuenta creada pero correo no pedido: no es un éxito limpio. La lista la muestra como
		// pendiente y su fila ofrece «Reenviar invitación».
		const mailFailed = kind === 'invite' && !account.invitationSent;
		ctx.feedback.toast(
			ctx.t(
				mailFailed
					? 'admin.editors.addDialog.inviteMailFailed'
					: kind === 'invite'
						? 'admin.editors.addDialog.successInvite'
						: 'admin.editors.addDialog.successPassword',
				{ email: account.email }
			),
			{ kind: mailFailed ? 'error' : 'success' }
		);
		// Sin recargar: la escritura ya devolvió la cuenta tal como la lista la mostraría.
		const { id, email, verified, created } = account;
		editors = sortEditors([
			...editors.filter((e) => e.id !== id),
			{ id, email, verified, created }
		]);
	}

	// ————— Cambiar contraseña —————

	let passwordTarget = $state<EditorAccount | null>(null);

	function handlePasswordChanged(account: EditorAccount): void {
		passwordTarget = null;
		ctx.feedback.toast(ctx.t('admin.editors.passwordDialog.success', { email: account.email }), {
			kind: 'success'
		});
		// Poner la contraseña deja la cuenta verificada (ver el puerto): se refleja sin recargar.
		editors = editors.map((e) => (e.id === account.id ? { ...e, verified: true } : e));
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
			editors = editors.filter((e) => e.id !== target.id);
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
					{ctx.t('admin.editors.missingCollection')}
				</p>
				<div class="vega-admin-notice-actions">
					<button type="button" class="vega-admin-btn" onclick={() => void goto(settingsRoute())}>
						{ctx.t('admin.editors.goToSettings')}
					</button>
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

		{#if serverSettings && status === 'ready'}
			{#if mailStatus === 'loading'}
				<div class="vega-admin-card">
					<div class="vega-admin-state" aria-live="polite" data-mail-card="loading">
						<p><span class="vega-admin-saving">{ctx.t('admin.mail.loading')}</span></p>
					</div>
				</div>
			{:else if mailStatus === 'error' || !mailSettings}
				<div class="vega-admin-card">
					<div class="vega-admin-state" role="alert" data-mail-card="error">
						<p>{ctx.t('admin.mail.loadError')}</p>
						<button type="button" class="vega-admin-btn" onclick={() => void loadMailSettings()}>
							{ctx.t('common.retry')}
						</button>
					</div>
				</div>
			{:else}
				<MailCard
					settings={mailSettings}
					section={serverSettings}
					resetUrl={absoluteResetUrl()}
					defaultTestTo={ctx.session.user.email}
					onSaved={(next) => void onMailSaved(next)}
				/>
			{/if}
		{/if}

		<AddEditorDialog
			open={adding}
			{mailEnabled}
			{passwordMinLength}
			inviteLinkNote={inviteLink === 'custom'
				? ctx.t('admin.editors.addDialog.inviteLinkCustom')
				: inviteLink === 'foreign-origin'
					? ctx.t('admin.editors.addDialog.inviteLinkForeignOrigin')
					: inviteLink === 'unknown'
						? ctx.t('admin.editors.addDialog.inviteLinkUnknown')
						: null}
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
