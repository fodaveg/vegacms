/** Altas manuales de la interfaz, compuestas sin alterar los permisos del backend. */
import type { ResolvedContentType } from './types';

/** `hideCreate` también se aplica al superusuario; importación y escrituras técnicas usan permisos. */
export function canCreateManually(type: ResolvedContentType): boolean {
	return type.permissions.create && !type.hideCreate;
}
