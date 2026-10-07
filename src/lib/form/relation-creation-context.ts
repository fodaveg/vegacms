import { getContext, setContext } from 'svelte';

const RELATION_CREATION_KEY = Symbol('vega-relation-creation');

/** El primer nivel modal permite seleccionar relaciones internas, sin encadenar altas. */
export function setRelationCreationAllowed(allowed: boolean): void {
	setContext(RELATION_CREATION_KEY, allowed);
}

/** Fuera de un formulario modal, la creación contextual está permitida. */
export function relationCreationAllowed(): boolean {
	return getContext<boolean | undefined>(RELATION_CREATION_KEY) ?? true;
}
