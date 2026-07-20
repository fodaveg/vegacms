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
	// Buscador global (R1 del rediseño C2): visual/atajo de teclado, sin backend de búsqueda
	// global todavía (§ pendiente de un P posterior) — ver `GlobalSearch.svelte`.
	'topbar.search.ariaLabel': 'Búsqueda global',
	'topbar.search.placeholder': 'Buscar en todo el contenido…',
	'topbar.avatar.label': 'Sesión de {email}',

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

	// ————— Conexión a backend / onboarding genérico (lote L5) —————
	// `BackendUrlForm.svelte`: override runtime de la URL de PocketBase, guardado en
	// `localStorage`. Montado en `/login` (disclosure, primer arranque) y `/settings`
	// (reconfiguración, ya autenticado).
	'connect.disclosureLabel': '¿PocketBase en otro servidor? Configúralo',
	'connect.title': 'Backend / conexión',
	'connect.description':
		'Apunta Vega a un PocketBase distinto de este mismo servidor, sin recompilar.',
	'connect.urlLabel': 'URL de PocketBase',
	'connect.urlPlaceholder': 'https://pb.midominio.com',
	'connect.invalidUrl': 'Introduce una URL válida (http:// o https://).',
	'connect.current.sameOrigin': 'Usando el mismo origen que esta página (por defecto).',
	'connect.current.override': 'Conectado a: {url}',
	'connect.test': 'Probar conexión',
	'connect.testing': 'Probando…',
	'connect.testOk': 'Conexión correcta.',
	'connect.testFail':
		'No se pudo confirmar la conexión (puede ser CORS). Puedes guardar igualmente.',
	'connect.save': 'Guardar y recargar',
	'connect.reset': 'Restablecer valores por defecto',
	'connect.reloadConfirm':
		'Se recargará la página para aplicar el cambio de backend. Si tienes cambios sin guardar en el editor, se perderán. ¿Continuar?',
	// `authCollection` (lote L6c): colección de auth contra la que autentica el adaptador
	// `pocketbase` — vacía/ausente ⇒ `_superusers` (superusuario, comportamiento previo). Un
	// operador que monte el rol editor plano (colección dedicada, p.ej. `vega_editors`) la fija
	// aquí para entrar como editor en vez de superuser.
	'connect.authCollectionLabel': 'Colección de autenticación',
	'connect.authCollectionPlaceholder': '_superusers',
	'connect.authCollectionHint':
		'Déjalo en blanco para entrar como superusuario. Los editores usan una colección dedicada (p. ej. "vega_editors") que te indicará quien administre este PocketBase.',
	'connect.current.authCollectionDefault': 'Autenticando como superusuario (_superusers).',
	'connect.current.authCollectionOverride': 'Autenticando contra la colección: {authCollection}',

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
	// ————— Vistas fusionadas (mergedViews, Fase L7c) —————
	'errors.notFoundView.title': 'Vista no encontrada',
	'errors.notFoundView.body': 'No existe la vista fusionada "{view}".',

	// ————— Editor de registro (Fase F5-a del contrato P5) —————
	// `editor.create.title`/`editor.edit.title`: desde R7 del rediseño C2 solo alimentan el `<h1>`
	// VISUALMENTE OCULTO de `RecordForm.svelte` (a11y de jerarquía de headings) — el título visible
	// del editor es ahora el crumb de `EditTopBar`, no un heading en pantalla.
	'editor.create.title': 'Crear «{label}»',
	'editor.edit.title': 'Editar «{label}»',
	'editor.save': 'Guardar',
	'editor.saving': 'Guardando…',
	'editor.saveSuccess': 'Guardado.',
	'editor.leaveConfirm': 'Hay cambios sin guardar. ¿Salir de todos modos?',
	'editor.readonlyNotice': 'Esta colección es de solo lectura: no se puede editar.',
	'editor.load.error.body': 'No se pudo cargar el registro. {message}',

	// ————— Barra pegajosa del editor (R7 del rediseño C2, mockup `.edit-top`) —————
	'editor.new': 'nuevo',
	'editor.dirty': 'sin guardar',
	'editor.savedAt': 'último guardado {time}',
	'editor.previewLink': 'Ver en el sitio',
	'editor.previewDisabledTitle': 'El borrador no tiene URL pública todavía',

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

	// ————— Widget relation (Fase F5-e del contrato P5) —————
	'form.relation.searchAriaLabel': 'Buscar «{label}»',
	'form.relation.searchPlaceholder': 'Buscar por título…',
	'form.relation.typeToSearch': 'Escribe para buscar…',
	'form.relation.searching': 'Buscando…',
	'form.relation.noResults': 'Sin resultados',
	'form.relation.emptySelection': '— sin selección —',
	'form.relation.remove': 'Quitar',
	'form.relation.removeLabel': 'Quitar «{title}»',
	'form.relation.notFound': 'no encontrado',
	'form.relation.degradedNote':
		'Este tipo no tiene un campo de título con el que buscar: elige de la lista.',

	// ————— Widget file (Fase F5-f del contrato P5) —————
	'form.file.dropHint': 'Arrastra ficheros aquí o haz clic para elegir',
	'form.file.empty': 'Sin ficheros',
	'form.file.remove': 'Quitar',
	'form.file.removeLabel': 'Quitar «{name}»',
	'form.file.tooLarge': '«{name}» es demasiado grande.',
	'form.file.invalidType': '«{name}» no es un tipo de fichero permitido.',
	'form.file.tooMany': '«{name}» no se añadió: se alcanzó el máximo de ficheros.',
	// Fase P6·6e (D-P6.6): botón que abre `MediaPicker.svelte`. Oculto por completo sin
	// `ctx.mediaPicker` (L-P6.9), nunca deshabilitado sin explicación.
	'form.file.pickFromLibrary': 'Elegir de la biblioteca',

	// ————— Editor richtext/markdown (Fase F5-d del contrato P5) —————
	'form.editor.toolbarLabel': 'Herramientas de formato',
	'form.editor.paragraph': 'Párrafo',
	'form.editor.heading': 'Título {level}',
	'form.editor.headingLabel': 'Estilo de párrafo',
	'form.editor.bold': 'Negrita',
	'form.editor.italic': 'Cursiva',
	'form.editor.strike': 'Tachado',
	'form.editor.code': 'Código',
	'form.editor.codeBlock': 'Bloque de código',
	'form.editor.blockquote': 'Cita',
	'form.editor.bulletList': 'Lista con viñetas',
	'form.editor.orderedList': 'Lista numerada',
	'form.editor.horizontalRule': 'Línea horizontal',
	'form.editor.link': 'Enlace',
	'form.editor.linkRemove': 'Quitar enlace',
	'form.editor.linkPrompt': 'URL del enlace',
	'form.editor.image': 'Imagen',
	'form.editor.imagePrompt': 'URL de la imagen',
	'form.editor.imageAltPrompt': 'Texto alternativo de la imagen',

	// ————— Listado (Fase 4c del contrato P4) —————
	'list.empty.title': 'Aquí no hay nada todavía',
	'list.empty.body': 'Crea el primer registro de "{label}" para empezar.',
	'list.empty.cta': 'Crear',
	'list.error.title': 'No se pudo cargar el listado',
	'list.error.body': '{message}',
	'list.pagination.prev': 'Anterior',
	'list.pagination.next': 'Siguiente',
	'list.pagination.total': '{count} registros',
	'list.cell.yes': 'Sí',
	'list.cell.no': 'No',
	'list.untitled': '(sin título)',

	// ————— Toolbar de listado (Fase 4d del contrato P4) —————
	'list.search.placeholder': 'Buscar…',
	'list.search.ariaLabel': 'Buscar en el listado',
	'list.filter.status.all': 'Todos',
	'list.sort.ariaLabel': 'Ordenar por {column}',
	'list.emptySearch.title': 'Sin resultados',
	'list.emptySearch.body':
		'Ningún registro de "{label}" coincide con la búsqueda o los filtros activos.',
	'list.emptySearch.clear': 'Limpiar filtros',

	// ————— Cabecera de listado (R2 del rediseño C2, mockup `.listhead`) —————
	'list.filter.groupLabel': 'Filtrar por estado',
	'list.new.button': 'Crear «{label}»',

	// ————— Paginación numerada (R4 del rediseño C2, mockup `.gridfoot`) —————
	'list.pagination.perPage': '{count} por página',
	'list.pagination.goToPage': 'Ir a la página {page}',

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

	// ————— Reorder manual (orderField) —————
	'list.reorder.columnHeader': 'Orden',
	'list.reorder.handleLabel': 'Arrastra para reordenar "{label}"',
	'list.reorder.error': 'No se pudo guardar el nuevo orden. Vuelve a intentarlo.',

	// ————— Vista fusionada (mergedViews, Fase L7c) —————
	'list.merged.typeHeader': 'Tipo',
	'list.merged.titleHeader': 'Título',
	'list.merged.empty.title': 'Aquí no hay nada todavía',
	'list.merged.empty.body': 'Ningún registro de las colecciones de esta vista coincide todavía.',
	'list.merged.truncatedNotice':
		'Alguna de las colecciones de esta vista tiene más registros de los mostrados.',

	// ————— Medios: bootstrap + esquema (Fase P6·6a) —————
	'media.loadErrorBody': 'No se pudo cargar la biblioteca de medios. Vuelve a intentarlo.',
	'media.empty.title': 'La biblioteca de medios está vacía',
	'media.empty.body': 'Todavía no hay ningún fichero. Sube el primero desde el apartado de arriba.',
	'media.bootstrap.confirmBody':
		'Vega va a crear la colección "vega_media" en tu PocketBase. ¿Continuar?',
	'media.bootstrap.confirm': 'Crear colección',
	'media.bootstrap.creating': 'Creando…',
	'media.bootstrap.create': 'Crear colección de medios',
	'media.bootstrap.manualBody':
		'La colección "vega_media" todavía no existe en este backend y no se puede crear automáticamente. El apartado quedará deshabilitado hasta que la crees a mano.',
	'media.bootstrap.manualImportHint':
		'En el Admin de PocketBase: Collections → Import collections, pega el siguiente JSON y confirma.',
	// Rol editor (lote L6c): un editor nunca puede crear/importar colecciones (no tiene acceso al
	// Admin de PocketBase), así que el JSON de importación de arriba no le sirve de nada.
	'media.bootstrap.editorBody':
		'Pídele a un administrador que configure la colección de medios ("vega_media") en PocketBase.',

	// ————— Medios: grid + detalle (Fase P6·6b) —————
	'media.detail.title': 'Editar medio',
	'media.detail.alt': 'Texto alternativo',
	'media.detail.titleLabel': 'Título',
	'media.detail.tags': 'Etiquetas',
	'media.detail.tagPlaceholder': 'Añadir etiqueta…',
	'media.detail.tagInputLabel': 'Nueva etiqueta',
	'media.detail.addTag': 'Añadir',
	'media.detail.removeTag': 'Quitar «{tag}»',
	'media.detail.saveSuccess': 'Medio actualizado.',

	// ————— Medios: borrado (Fase P6·6d) —————
	// D-P6.5/audit H3: el modelo de media es COPIA de bytes, no referencia (`filePerRecord`) — borrar
	// el original de la biblioteca no rompe las copias ya insertadas en registros, así que el aviso
	// es honesto y genérico, SIN contador de uso (no hay consulta inversa "quién usa este asset").
	'media.detail.delete': 'Borrar',
	'media.delete.confirmTitle': '¿Borrar «{label}»?',
	'media.delete.confirmBody':
		'Esto elimina el original de la biblioteca. Las copias ya insertadas por la biblioteca en registros no se ven afectadas.',
	'media.delete.confirm': 'Borrar',
	'media.delete.deleting': 'Borrando…',
	'media.delete.success': '"{label}" se ha borrado de la biblioteca.',

	// ————— Medios: subida drag&drop (Fase P6·6c) —————
	'media.upload.inputLabel': 'Subir ficheros',
	'media.upload.dropHint':
		'Arrastra ficheros aquí o usa el botón de arriba para elegirlos. Puedes seleccionar varios a la vez.',
	'media.upload.status.pending': 'Pendiente',
	'media.upload.status.uploading': 'Subiendo…',
	'media.upload.status.done': 'Subido',
	'media.upload.status.error': 'Error: {message}',
	'media.upload.reason.tooLarge': 'excede el tamaño máximo permitido',
	'media.upload.reason.invalidType': 'tipo de fichero no permitido',
	'media.upload.aborted':
		'subida cancelada: un fichero anterior del lote falló por conexión/permiso',
	'media.upload.summary': '{uploaded} fichero(s) subido(s), {failed} fallido(s).',

	// ————— Medios: picker de biblioteca (Fase P6·6e) —————
	// D-P6.6/L-P6.8: el picker COPIA bytes (nunca referencia un `vega_media` desde un registro),
	// así que el aviso es honesto sobre eso mismo (D-P6.7, la duplicación de bytes se acepta en v1).
	'media.picker.title': 'Elegir de la biblioteca',
	'media.picker.copyNotice': 'Se insertará una copia del fichero elegido en este campo.',
	'media.picker.searchLabel': 'Buscar por título o texto alternativo',
	'media.picker.searchPlaceholder': 'Buscar…',
	'media.picker.empty': 'Ningún asset coincide con la búsqueda o el tipo de fichero admitido.',
	'media.picker.selectedCount': '{count} elegido(s)',
	'media.picker.insert': 'Insertar',
	'media.picker.inserting': 'Insertando…',

	// ————— Warnings (L10 de P2) —————
	'warnings.title': 'Avisos del modelo',
	'warnings.empty': 'Sin avisos.',

	// ————— Ajustes / editor del manifiesto (§3.5 del contrato P3) —————
	'settings.reload': 'Recargar modelo',
	'settings.reloading': 'Recargando…',
	'settings.saveSuccess': 'Manifiesto guardado.',
	'settings.loadErrorBody': 'No se pudo cargar Ajustes. Vuelve a intentarlo.',

	// ————— Rol editor (lote L6c): degradado de la edición del manifiesto —————
	// Sin `schemaBootstrap` (colección de auth distinta de `_superusers`) un editor no puede
	// introspeccionar ni crear/migrar esquema — la edición del manifiesto es, por definición,
	// una operación de superusuario. Ver `computeCollectionState`/`Capabilities.schemaBootstrap`.
	'settings.manifest.editorGateTitle': 'Modelo de contenido',
	'settings.manifest.editorGateBody':
		'La edición del manifiesto requiere una cuenta de administrador (superusuario). Pide a quien administre este PocketBase que ajuste el modelo de contenido desde este mismo panel.',

	// ————— Apariencia: selector de tema + modo (Fase F7w-a, "encender los temas") —————
	'settings.appearance.title': 'Apariencia',
	'settings.appearance.theme': 'Tema',
	'settings.appearance.mode': 'Modo',
	'settings.appearance.light': 'Claro',
	'settings.appearance.dark': 'Oscuro',

	// ————— Acerca de (P8·F2) —————
	'settings.about.title': 'Acerca de',
	'settings.about.line': 'Vega v{version} · PocketBase {pbServer}',

	// ————— Toasts (§2.3) —————
	'toast.dismiss': 'Descartar aviso',

	// ————— Genérico —————
	'common.retry': 'Reintentar',
	'common.cancel': 'Cancelar',
	'common.close': 'Cerrar',
	'common.loading': 'Cargando…'
};
