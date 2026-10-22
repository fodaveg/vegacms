/** Descarga independiente: el chrome y los formularios no incluyen la gestión de carpetas al arrancar. */
export function loadMediaFoldersComponent() {
	return import('./MediaFolders.svelte');
}
