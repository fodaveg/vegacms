/** Estado de una apertura de compartir; transporte único en preview-share-client, sin storage. */
import {
	PreviewShareRequestError,
	type CreatedPreviewShareLink,
	type PreviewShareLink,
	type createPreviewShareClient
} from '$lib/backend/preview-share-client';
import type { BackendPort } from '$lib/backend/port';
import type { ResolvedContentType } from '$lib/model/types';

export const SHARE_MAX_SECONDS = 30 * 24 * 60 * 60;
export const SHARE_UNITS = { seconds: 1, minutes: 60, hours: 3600, days: 86400 } as const;
export type ShareUnit = keyof typeof SHARE_UNITS;
export type ShareFailure =
	'session' | 'forbidden' | 'unavailable' | 'limit' | 'notReady' | 'input' | 'network' | 'server';
export type ShareInputError = 'duration' | 'label';

/** El derecho de leer no basta: compartir exige también actualizar un registro ya guardado. */
export function canManagePreviewShare(
	type: Pick<ResolvedContentType, 'readonly' | 'permissions'>,
	recordId: string | null,
	port: Pick<BackendPort, 'previewApiUrl' | 'previewShare'>,
	typeReadonly = false
): boolean {
	return Boolean(
		recordId &&
		port.previewApiUrl &&
		port.previewShare === true &&
		!typeReadonly &&
		!type.readonly &&
		type.permissions.view &&
		type.permissions.update
	);
}

/** Sin mínimo ficticio: cualquier entero positivo hasta 30 días se envía al rango real del sitio. */
export function validateShareInput(
	amount: string,
	unit: ShareUnit,
	rawLabel: string
): { ok: true; ttlSeconds: number; label: string } | { ok: false; field: ShareInputError } {
	const quantity = Number(amount);
	const ttlSeconds = quantity * SHARE_UNITS[unit];
	if (
		!amount.trim() ||
		!Number.isSafeInteger(quantity) ||
		quantity <= 0 ||
		!Number.isSafeInteger(ttlSeconds) ||
		ttlSeconds > SHARE_MAX_SECONDS
	)
		return { ok: false, field: 'duration' };
	const label = rawLabel.trim();
	const characters = [...label];
	const hasControl = characters.some((character) => {
		const code = character.codePointAt(0)!;
		return code <= 0x1f || (code >= 0x7f && code <= 0x9f);
	});
	if (characters.length > 120 || hasControl) return { ok: false, field: 'label' };
	return { ok: true, ttlSeconds, label };
}

/** Solo categorías de UI: nunca cuerpo servidor, URL o mensaje/cause de transporte en feedback. */
export function shareFailure(error: unknown): ShareFailure {
	if (error instanceof PreviewShareRequestError) {
		if (error.status === 401) return 'session';
		if (error.status === 403) return 'forbidden';
		if (error.status === 404) return 'unavailable';
		if (error.status === 409) return 'limit';
		if (error.status === 503) return 'notReady';
		if (error.status === 400) return 'input';
		return 'server';
	}
	return error instanceof TypeError ? 'network' : 'server';
}

export interface PreviewShareState {
	listPhase: 'loading' | 'ready' | 'error';
	links: PreviewShareLink[];
	pending: 'create' | 'revoke' | null;
	error: ShareFailure | null;
	inputError: ShareInputError | null;
	uncertain: boolean;
	/** URL únicamente de esta apertura; lista y persistencia nunca reciben este objeto. */
	created: CreatedPreviewShareLink | null;
	copied: boolean;
	revokedId: string | null;
}

function emptyState(): PreviewShareState {
	return {
		listPhase: 'loading',
		links: [],
		pending: null,
		error: null,
		inputError: null,
		uncertain: false,
		created: null,
		copied: false,
		revokedId: null
	};
}

/**
 * Ciclo de vida de un solo diálogo. dispose borra el secreto e invalida todas las respuestas;
 * cambiar registro o sesión construye otra instancia, nunca reutiliza esta apertura.
 */
export class PreviewShareController {
	private live = true;
	private sequence = 0;
	private current = emptyState();
	constructor(
		private readonly client: ReturnType<typeof createPreviewShareClient>,
		private readonly collection: string,
		private readonly recordId: string,
		private readonly changed: (state: PreviewShareState) => void
	) {}

	get state(): PreviewShareState {
		return this.current;
	}
	private update(patch: Partial<PreviewShareState>): void {
		if (!this.live) return;
		this.current = { ...this.current, ...patch };
		this.changed(this.current);
	}
	private valid(sequence: number): boolean {
		return this.live && sequence === this.sequence;
	}

	async load(): Promise<void> {
		if (!this.live || this.current.pending) return;
		const sequence = ++this.sequence;
		this.update({ listPhase: 'loading', error: null });
		try {
			const links = await this.client.listLinks(this.collection, this.recordId);
			if (this.valid(sequence)) this.update({ links, listPhase: 'ready' });
		} catch (error) {
			if (this.valid(sequence)) this.update({ listPhase: 'error', error: shareFailure(error) });
		}
	}

	async create(amount: string, unit: ShareUnit, label: string): Promise<void> {
		if (
			!this.live ||
			this.current.pending ||
			this.current.listPhase !== 'ready' ||
			this.current.uncertain ||
			this.current.created
		)
			return;
		const input = validateShareInput(amount, unit, label);
		if (!input.ok) {
			this.update({ inputError: input.field });
			return;
		}
		const sequence = ++this.sequence;
		this.update({ pending: 'create', error: null, inputError: null });
		try {
			const created = await this.client.createLink(this.collection, this.recordId, {
				ttlSeconds: input.ttlSeconds,
				label: input.label
			});
			if (!this.valid(sequence)) return;
			const { url: _url, ...link } = created;
			this.update({ created, links: [link, ...this.current.links], copied: false });
		} catch (error) {
			if (!this.valid(sequence)) return;
			const failure = shareFailure(error);
			// Red, respuesta malformada o un fallo genérico del servidor pueden haber seguido al alta.
			this.update({ error: failure, uncertain: failure === 'network' || failure === 'server' });
		} finally {
			if (this.valid(sequence)) this.update({ pending: null });
		}
	}

	async revoke(linkId: string): Promise<boolean> {
		if (
			!this.live ||
			this.current.pending ||
			!this.current.links.some((link) => link.id === linkId)
		)
			return false;
		const sequence = ++this.sequence;
		this.update({ pending: 'revoke', error: null });
		try {
			await this.client.revokeLink(this.collection, this.recordId, linkId);
			if (!this.valid(sequence)) return false;
			this.update({
				links: this.current.links.filter((link) => link.id !== linkId),
				revokedId: linkId,
				created: this.current.created?.id === linkId ? null : this.current.created
			});
			return true;
		} catch (error) {
			if (this.valid(sequence)) this.update({ error: shareFailure(error) });
			return false;
		} finally {
			if (this.valid(sequence)) this.update({ pending: null });
		}
	}

	markCopied(): void {
		if (this.current.created) this.update({ copied: true });
	}
	/** El enlace servidor sigue vivo; aquí se borra únicamente la URL de un solo uso. */
	dispose(): void {
		this.live = false;
		this.sequence++;
		this.current = emptyState();
	}
}
