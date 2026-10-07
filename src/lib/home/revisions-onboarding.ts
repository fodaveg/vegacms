/** Preferencia del ofrecimiento inicial: por instalación EN ESTE navegador, nunca configuración. */
import type { ContentModel } from '$lib/model/types';

export function shouldOfferRevisions(model: ContentModel, schemaBootstrap: boolean): boolean {
	return (
		schemaBootstrap &&
		model.revisions.enabled &&
		!model.types.some((type) => type.name === 'vega_revisions')
	);
}

function storage(): Pick<Storage, 'getItem' | 'setItem'> | null {
	try {
		return typeof localStorage === 'undefined' ? null : localStorage;
	} catch {
		return null;
	}
}

/** Sin identidad/almacenamiento, el componente conserva el descarte solo mientras está montado. */
export function isRevisionsOfferDismissed(identity: string | null): boolean {
	try {
		return (
			identity !== null && storage()?.getItem(`vega.revisionsOffer.v1:${identity}`) === 'dismissed'
		);
	} catch {
		return false;
	}
}

/** Fallar al guardar esta comodidad no bloquea Inicio ni modifica revisions.enabled. */
export function dismissRevisionsOffer(identity: string | null): void {
	try {
		if (identity !== null) storage()?.setItem(`vega.revisionsOffer.v1:${identity}`, 'dismissed');
	} catch {
		/* Sin persistencia entre visitas. */
	}
}
