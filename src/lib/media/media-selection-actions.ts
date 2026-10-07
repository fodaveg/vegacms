import type { VegaAppContext } from '$lib/app-context';
import type { BackendPort, RecordId } from '$lib/backend';
import type { MediaItemView } from './media-item';
import { resolveMediaFileUrl } from './media-thumb';

/** Copia las URLs públicas resolubles de la selección visible y anuncia el resultado. */
export async function copySelectedMediaUrls(
	ctx: VegaAppContext,
	items: readonly MediaItemView[]
): Promise<void> {
	const urls: string[] = [];
	for (const item of items) {
		const url = resolveMediaFileUrl(ctx.port, item);
		if (url !== null) urls.push(url);
	}
	if (urls.length === 0) return;
	try {
		await navigator.clipboard.writeText(urls.join('\n'));
		ctx.feedback.toast(ctx.t('media.selection.copySuccess', { count: urls.length }), {
			kind: 'success'
		});
	} catch {
		ctx.feedback.toast(ctx.t('media.selection.copyError'), { kind: 'error' });
	}
}

/** Borra en secuencia y corta en el primer fallo; el llamador conserva el estado del diálogo. */
export async function deleteSelectedMedia(
	port: BackendPort,
	targets: readonly MediaItemView[],
	onDeleted: (id: RecordId) => void
): Promise<{ deleted: number; failure: unknown }> {
	let deleted = 0;
	let failure: unknown = null;
	for (const item of targets) {
		try {
			await port.delete('vega_media', item.id);
			onDeleted(item.id);
			deleted++;
		} catch (err) {
			failure = err;
			break;
		}
	}
	return { deleted, failure };
}
