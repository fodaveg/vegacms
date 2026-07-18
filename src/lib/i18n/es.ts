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

	// ————— Editor de registro (Fase F5-a del contrato P5) —————
	'editor.create.title': 'Crear «{label}»',
	'editor.edit.title': 'Editar «{label}»',
	'editor.cancel': 'Volver',
	'editor.save': 'Guardar',
	'editor.saving': 'Guardando…',
	'editor.saveSuccess': 'Guardado.',
	'editor.leaveConfirm': 'Hay cambios sin guardar. ¿Salir de todos modos?',
	'editor.readonlyNotice': 'Esta colección es de solo lectura: no se puede editar.',
	'editor.load.error.body': 'No se pudo cargar el registro. {message}',

	// ————— Widgets de campo (Fase F5-a/F5-b del contrato P5) —————
	'form.unsupported': 'Campo no editable en Vega',
	'form.select.empty': '— sin selección —',
	'form.errorCode.validation_required': 'Este campo es obligatorio.',
	'form.errorCode.validation_min_text_constraint': 'El texto es demasiado corto.',
	'form.errorCode.validation_max_text_constraint': 'El texto es demasiado largo.',
	'form.errorCode.validation_invalid_format': 'El formato no es válido.',
	'form.errorCode.validation_min_number_constraint': 'El valor es demasiado bajo.',
	'form.errorCode.validation_max_number_constraint': 'El valor es demasiado alto.',
	'form.errorCode.validation_min_greater_equal_than_required': 'La fecha es demasiado temprana.',
	'form.errorCode.validation_max_less_equal_than_required': 'La fecha es demasiado tardía.',
	'form.errorCode.validation_invalid_value': 'El valor seleccionado no es válido.',
	'form.errorCode.validation_too_many_values': 'Has seleccionado demasiados elementos.',
	'form.errorCode.validation_missing_rel_records':
		'Alguno de los registros relacionados no existe.',
	'form.errorCode.vega_unsupported_field': 'Vega no puede escribir este campo.',
	'form.errorCode.vega_readonly_field': 'Este campo es de solo lectura.',
	'form.errorCode.vega_unknown_field': 'Este campo no existe en el tipo de contenido.',
	'form.errorCode.vega_foreign_file_ref': 'Ese fichero no pertenece a este registro.',

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
