/**
 * Diccionario de español (chrome de Vega, §2.5 del contrato P3): SOLO strings de UI del shell
 * (menús, botones, estados de sesión, errores de transporte, estados vacíos, densidad,
 * warnings). NUNCA contenido de usuario ni mensajes de `ModelWarning` (esos ya vienen en
 * español desde P2 y se pintan tal cual, sin pasar por `t()`).
 *
 * Mismo juego de claves que `en.ts` (invariante verificado por `tests/shell/i18n.test.ts`):
 * una clave que falta en un idioma y no en el otro es un bug de este fichero, no de `t()`.
 */
export const es = {
	// ————— Navegación / índice —————
	'nav.emptyTitle': 'Todavía no hay nada que mostrar',
	'nav.emptyBody': 'Crea colecciones en tu PocketBase o revisa el manifiesto en Ajustes.',
	'nav.emptyCta': 'Ir a Ajustes',
	'nav.media': 'Medios',
	'nav.settings': 'Ajustes',
	'nav.sidebarLabel': 'Navegación principal',
	'nav.warningsBadge': '{count} avisos',
	'nav.singletonManyRecords':
		'"{label}" está marcada como Ajustes pero tiene {count} registros. Editando el primero.',
	'nav.readonlyBadge': 'Solo lectura',

	// ————— Topbar —————
	'topbar.logout': 'Cerrar sesión',
	'topbar.menu.open': 'Abrir navegación',
	'topbar.menu.close': 'Cerrar navegación',
	'topbar.density.toggleLabel': 'Densidad',
	'topbar.density.comfortable': 'Cómoda',
	'topbar.density.compact': 'Compacta',
	'topbar.connection.connected': 'Conectado',
	'topbar.connection.disconnected': 'Sin conexión',
	'topbar.connection.retrying': 'Reintentando…',
	'topbar.connection.retry': 'Reintentar',

	// ————— Login / sesión —————
	'login.title': 'Acceder a Vega',
	'login.email': 'Correo electrónico',
	'login.password': 'Contraseña',
	'login.submit': 'Entrar',
	'login.submitting': 'Entrando…',
	'login.invalidCredentials': 'Credenciales no válidas.',
	'login.networkError': 'Sin conexión con el backend.',
	'session.reloginTitle': 'Tu sesión ha caducado',
	'session.reloginBody': 'Vuelve a entrar para seguir donde lo dejaste. No se pierde nada.',
	'session.reloginSubmit': 'Reautenticar',
	'session.logoutConfirm': 'Hay cambios sin guardar. ¿Cerrar sesión igualmente?',

	// ————— Estados globales de transporte (§3.4) —————
	'errors.network.title': 'Sin conexión con el backend',
	'errors.network.body': 'No se pudo contactar con el servidor. Comprueba tu conexión.',
	'errors.network.retry': 'Reintentar',
	'errors.backend.title': 'El backend ha respondido algo inesperado',
	'errors.forbidden.title': 'No tienes permiso',
	'errors.forbidden.body': 'Tu sesión no tiene acceso a este recurso.',
	'errors.forbidden.readonlyType.body':
		'"{label}" es una colección de solo lectura: no se pueden crear registros nuevos.',
	'errors.notFoundType.title': 'Colección no encontrada',
	'errors.notFoundType.body': 'No existe (o está oculta) el tipo de contenido "{type}".',
	'errors.notFoundRecord.title': 'Registro no encontrado',
	'errors.notFoundRecord.body': 'Este registro ya no existe.',
	'errors.notFoundRecord.backToList': 'Volver al listado',
	'errors.backToIndex': 'Volver al índice',

	// ————— Placeholders honestos de rutas de contenido (hueco pre-P5, P3-L10) —————
	'placeholder.create.title': 'El formulario de creación llega pronto',
	'placeholder.create.body': 'El formulario de creación de "{label}" llega en P5.',
	'placeholder.edit.title': 'La edición llega pronto',
	'placeholder.edit.body': 'La edición de "{label}" #{id} llega en P5.',

	// ————— Listado (Fase 4c del contrato P4) —————
	'list.empty.title': 'Aquí no hay nada todavía',
	'list.empty.body': 'Crea el primer registro de "{label}" para empezar.',
	'list.empty.cta': 'Crear',
	'list.error.title': 'No se pudo cargar el listado',
	'list.error.body': '{message}',
	'list.pagination.prev': 'Anterior',
	'list.pagination.next': 'Siguiente',
	'list.pagination.pageOf': '{page} de {totalPages}',
	'list.pagination.total': '{count} registros',
	'list.cell.yes': 'Sí',
	'list.cell.no': 'No',
	'list.untitled': '(sin título)',

	// ————— Toolbar de listado (Fase 4d del contrato P4) —————
	'list.search.placeholder': 'Buscar…',
	'list.search.ariaLabel': 'Buscar en el listado',
	'list.filter.status.label': 'Estado',
	'list.filter.status.all': 'Todos',
	'list.sort.ariaLabel': 'Ordenar por {column}',
	'list.emptySearch.title': 'Sin resultados',
	'list.emptySearch.body':
		'Ningún registro de "{label}" coincide con la búsqueda o los filtros activos.',
	'list.emptySearch.clear': 'Limpiar filtros',

	// ————— Borrado (Fase 4e del contrato P4) —————
	'list.actions.header': 'Acciones',
	'list.delete.rowButton': 'Borrar',
	'list.delete.rowButtonLabel': 'Borrar "{label}"',
	'list.delete.confirmTitle': '¿Borrar este registro?',
	'list.delete.confirmBody':
		'"{label}" se borrará de forma permanente. Esta acción no se puede deshacer.',
	'list.delete.confirm': 'Borrar',
	'list.delete.deleting': 'Borrando…',
	'list.delete.success': '"{label}" se ha borrado.',

	// ————— Medios (hueco pre-P6) —————
	'media.placeholderTitle': 'Los medios llegan en una fase próxima',
	'media.placeholderBody': 'La biblioteca de medios todavía no está disponible.',

	// ————— Warnings (L10 de P2) —————
	'warnings.title': 'Avisos del modelo',
	'warnings.empty': 'Sin avisos.',

	// ————— Ajustes / editor del manifiesto (§3.5 del contrato P3) —————
	'settings.reload': 'Recargar modelo',
	'settings.reloading': 'Recargando…',
	'settings.saveSuccess': 'Manifiesto guardado.',
	'settings.loadErrorBody': 'No se pudo cargar Ajustes. Vuelve a intentarlo.',

	// ————— Toasts (§2.3) —————
	'toast.dismiss': 'Descartar aviso',

	// ————— Genérico —————
	'common.retry': 'Reintentar',
	'common.cancel': 'Cancelar',
	'common.close': 'Cerrar',
	'common.loading': 'Cargando…'
};
