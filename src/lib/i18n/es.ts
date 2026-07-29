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
	'nav.trash': 'Papelera',
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
	// Buscador global (caja y atajo: R1 del rediseño C2 · búsqueda de verdad: `#lote-shell`) —
	// ver `GlobalSearch.svelte`. `topbar.search.empty` cita el término BUSCADO (el de los
	// resultados en pantalla), no lo que se esté tecleando en ese instante.
	'topbar.search.ariaLabel': 'Búsqueda global',
	'topbar.search.placeholder': 'Buscar en todo el contenido…',
	'topbar.search.results': 'Resultados de la búsqueda global',
	'topbar.search.searching': 'Buscando…',
	'topbar.search.empty': 'Sin resultados para «{q}»',
	'topbar.search.error': 'No se pudo buscar. Revisa la conexión e inténtalo de nuevo.',
	'topbar.search.minChars': 'Escribe al menos {count} caracteres',
	'topbar.search.seeAll': 'Ver los {count} restantes',
	'topbar.search.partial': 'No se pudo buscar en {count} colección(es).',
	'topbar.avatar.label': 'Sesión de {email}',
	// Chip de usuario → menú "Ajustes" (#l12-ux, item 3): rótulo del propio botón disparador,
	// DISTINTO del `topbar.avatar.label` de arriba (ese describe la identidad de sesión del
	// `<span role="img">` interior; este describe la ACCIÓN de abrir el menú).
	'topbar.userMenu.toggle': 'Menú de cuenta',

	// ————— Publicación (lote "publicación", fase A): `PublishButton.svelte` —————
	// Ausente por completo (§cabecera del componente) si el proyecto conectado no declaró `build`
	// en su discovery — estas claves solo se pintan cuando la funcionalidad existe de verdad.
	'topbar.publish.loading': 'Comprobando publicación…',
	'topbar.publish.running': 'Publicando…',
	'topbar.publish.failed': 'Reintentar publicación',
	'topbar.publish.noChanges': 'Sin cambios',
	'topbar.publish.ok': 'Publicado',
	'topbar.publish.ready': 'Publicar',
	'topbar.publish.viewLog': 'Ver registro',
	'topbar.publish.triggerError': 'No se pudo iniciar la publicación.',
	'topbar.publish.lastPublished': 'Última publicación: {date}',

	// ————— Login / sesión —————
	'login.title': 'Acceder a Vega',
	'login.email': 'Correo electrónico',
	'login.password': 'Contraseña',
	'login.submit': 'Entrar',
	'login.submitting': 'Entrando…',
	'login.invalidCredentials': 'Credenciales no válidas.',
	'login.networkError': 'Sin conexión con el backend.',
	'login.or': 'o',
	'login.passkey': 'Entrar con passkey',
	'login.mfa.title': 'Verificación en dos pasos',
	'login.mfa.body': 'Confirma tu identidad para terminar de entrar.',
	'login.mfa.totpLabel': 'Código de la app de autenticación',
	'login.mfa.verifying': 'Verificando…',
	'login.mfa.verify': 'Verificar',
	'login.mfa.invalidCode': 'El código no es válido.',
	'login.mfa.useRecovery': 'Usar un código de recuperación',
	'login.mfa.recoveryLabel': 'Código de recuperación',
	'login.mfa.recoverySubmit': 'Entrar con código de recuperación',
	'login.mfa.cancel': 'Cancelar y volver al login',
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

	// ————— Seguridad de la cuenta (L6: TOTP, recuperación y passkeys) —————
	'security.title': 'Seguridad de la cuenta',
	'security.description': 'Gestiona la verificación en dos pasos y las passkeys de esta cuenta.',
	'security.refresh': 'Actualizar',
	'security.loading': 'Cargando factores de seguridad…',
	'security.error.generic': 'No se pudo completar la operación de seguridad.',
	'security.status.enabled': 'Activado',
	'security.status.disabled': 'Desactivado',
	'security.totp.title': 'App de autenticación (TOTP)',
	'security.totp.enabled': 'La app de autenticación está activada.',
	'security.totp.disabled': 'La app de autenticación está desactivada.',
	'security.totp.disableConfirm': '¿Desactivar la app de autenticación?',
	'security.totp.disable': 'Desactivar TOTP',
	'security.totp.setupBody':
		'Abre el enlace en tu gestor de contraseñas o introduce manualmente el secreto. Después confirma un código de seis dígitos.',
	'security.totp.openApp': 'Abrir en la app de autenticación',
	'security.totp.codeLabel': 'Código de 6 dígitos',
	'security.totp.verify': 'Activar y verificar',
	'security.totp.disabledBody':
		'Añade un segundo paso al login con una app compatible con códigos TOTP.',
	'security.totp.enroll': 'Configurar TOTP',
	'security.recovery.remaining': '{count} códigos de recuperación disponibles.',
	'security.recovery.regenerate': 'Regenerar códigos',
	'security.recovery.regenerateConfirm':
		'Los códigos actuales dejarán de funcionar. ¿Generar un juego nuevo?',
	'security.recovery.saveTitle': 'Guarda tus códigos de recuperación',
	'security.recovery.saveBody':
		'Cada código sirve una sola vez. Esta es la única ocasión en la que se muestran.',
	'security.recovery.copy': 'Copiar todos',
	'security.recovery.copied': 'Copiados',
	'security.recovery.copyError': 'No se pudieron copiar los códigos. Cópialos manualmente.',
	'security.passkeys.title': 'Passkeys',
	'security.passkeys.body':
		'Entra sin contraseña usando Touch ID, una llave física o tu gestor de contraseñas.',
	'security.passkeys.defaultName': 'Passkey',
	'security.passkeys.added': 'Passkey añadida.',
	'security.passkeys.deleted': 'Passkey eliminada.',
	'security.passkeys.deleteConfirm': '¿Eliminar esta passkey?',
	'security.passkeys.delete': 'Eliminar',
	'security.passkeys.empty': 'Todavía no hay passkeys registradas.',
	'security.passkeys.nameLabel': 'Nombre de la passkey',
	'security.passkeys.namePlaceholder': 'Ej. MacBook (Touch ID)',
	'security.passkeys.add': 'Añadir passkey',

	// ————— Estados globales de transporte (§3.4) —————
	'errors.network.title': 'Sin conexión con el backend',
	'errors.network.body': 'No se pudo contactar con el servidor. Comprueba tu conexión.',
	'errors.network.retry': 'Reintentar',
	'errors.backend.title': 'El backend ha respondido algo inesperado',
	'errors.forbidden.title': 'No tienes permiso',
	'errors.forbidden.body': 'Tu sesión no tiene acceso a este recurso.',
	'errors.forbidden.readonlyType.body':
		'"{label}" es una colección de solo lectura: no se pueden crear registros nuevos.',
	// `#lote-shell`: vedado por una REGLA de acceso del backend, no por la naturaleza de la
	// colección — la UI ya no ofrece el camino, pero la ruta sigue siendo alcanzable por URL.
	'errors.forbidden.noCreate.body': 'No tienes permiso para crear registros en "{label}".',
	'errors.forbidden.noList.body': 'No tienes permiso para ver los registros de "{label}".',
	'errors.forbidden.noView.body': 'No tienes permiso para ver este registro de "{label}".',
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
	'editor.duplicate': 'Duplicar',
	'editor.duplicating': 'Duplicando…',
	'editor.duplicate.saveFirst': 'Guarda los cambios antes de duplicar.',
	'editor.duplicate.success': 'Página y bloques duplicados.',
	'editor.leaveConfirm': 'Hay cambios sin guardar. ¿Salir de todos modos?',
	'editor.readonlyNotice': 'Esta colección es de solo lectura: no se puede editar.',
	// `#lote-shell`: bloqueado por una REGLA de acceso del backend, no por ser una vista — el
	// registro se puede ver, pero esta sesión no puede guardarlo.
	'editor.noUpdateNotice':
		'No tienes permiso para editar registros de esta colección: puedes verlo, pero no guardar cambios.',
	'editor.load.error.body': 'No se pudo cargar el registro. {message}',

	// ————— Barra pegajosa del editor (R7 del rediseño C2, mockup `.edit-top`) —————
	'editor.new': 'nuevo',
	'editor.dirty': 'sin guardar',
	'editor.savedAt': 'último guardado {time}',
	'editor.previewLink': 'Ver en el sitio',
	'editor.previewDisabledTitle': 'El borrador no tiene URL pública todavía',

	// ————— Panel de vista previa de borrador (lote "publicación", fase B) —————
	// Solo se pintan cuando el proyecto declaró `preview` en su discovery (`ctx.port.previewApiUrl`,
	// ver la cabecera de `RecordForm.svelte`) — igual criterio que las claves `topbar.publish.*`
	// con `build`.
	'editor.preview.toggle': 'Vista previa',
	'editor.preview.panel.label': 'Panel de vista previa',
	'editor.preview.panel.title': 'Vista previa del borrador',
	'editor.preview.panel.refresh': 'Actualizar vista previa',
	'editor.preview.panel.close': 'Cerrar vista previa',
	'editor.preview.panel.frameTitle': 'Vista previa del borrador en el sitio',
	'editor.preview.panel.loading': 'Cargando vista previa…',
	'editor.preview.panel.loadError': 'No se pudo cargar la vista previa.',
	'editor.preview.panel.genericError': 'No se pudo generar la vista previa.',

	// ————— Editor «master-detail» (mockup final `aquelarre-detalle-post.html`) —————
	// Raíl de hermanos (`.rail`), aside de metadatos (`.kv`) y zona de peligro: piezas GENÉRICAS
	// opt-in del renderer — los rótulos de las tarjetas del aside salen de `fieldGroups` (dato del
	// manifiesto), así que aquí solo viven los literales que NO son dato de colección.
	'editor.rail.label': 'Registros de la colección',
	'editor.meta.title': 'Registro',
	'editor.meta.id': 'id',
	'editor.meta.created': 'Creado',
	'editor.meta.updated': 'Actualizado',
	'editor.dangerZone.title': 'Zona de peligro',
	'editor.delete': 'Eliminar {label}…',
	'editor.slug.regenerate': 'Regenerar',

	// ————— Bloques ordenables embebidos (capacidad `blocks`, lote "editor" Fase A) —————
	// Reutiliza a propósito claves ya existentes para el resto del ciclo de vida de un bloque:
	// `editor.save`/`editor.saving`/`editor.saveSuccess` (guardar un bloque es lo mismo que
	// guardar cualquier registro, solo que en miniatura), `list.delete.rowButton*`/`.confirm*`/
	// `.success` (borrar un bloque es lo mismo que borrar una fila del listado, mismo diálogo
	// `DeleteConfirm`) y `list.reorder.handleLabel`/`.error` (el asa de arrastre es la MISMA
	// pieza que la del listado). Aquí solo viven los literales que no tienen ya una clave.
	'editor.blocks.add': 'Añadir {label}',
	'editor.blocks.addMenu.label': 'Tipos de bloque',
	'editor.blocks.type.unknown': 'Tipo desconocido: {name}',
	'editor.blocks.type.none': 'Sin tipo',
	'editor.blocks.empty': 'Todavía no hay {label}.',
	'editor.blocks.duplicateLabel': 'Duplicar «{label}»',
	'editor.blocks.duplicateSuccess': 'Bloque duplicado.',
	'editor.blocks.expandLabel': 'Desplegar «{label}»',
	'editor.blocks.collapseLabel': 'Plegar «{label}»',
	'editor.blocks.reorder.moved': '«{label}» movido a la posición {position} de {total}',
	'editor.blocks.notice.saveParentFirst': 'Guarda el registro para poder añadir {label}.',

	// ————— Vista previa de tarjeta social (capacidad `social`, lote "editor" Fase B) —————
	'editor.social.title': 'Vista previa social',

	// ————— Selector de idioma de contenido (campos traducibles del manifiesto) —————
	'form.locale.tabsLabel': 'Idioma del contenido',
	'form.locale.status.error': '{label}: contiene errores',
	'form.locale.status.dirty': '{label}: tiene cambios sin guardar',
	'form.locale.status.missing': '{label}: faltan traducciones',
	'form.locale.status.complete': '{label}: traducción completa',

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
	'form.editor.heading1': 'Título 1',
	'form.editor.heading2': 'Título 2',
	// El editor richtext se carga aparte (`import()` dinámico, ~145 KB): hasta que monta, el hueco
	// dice que está cargando en vez de fingir un campo vacío ya usable — ver `Richtext.svelte`.
	'form.richtext.loading': 'Cargando el editor…',
	// L11: mesa de trabajo Markdown crudo + prueba segura en vivo. Los modos son acciones de
	// visualización, no cambian ni reserializan el valor del campo.
	'form.markdown.modeLabel': 'Vista del editor',
	'form.markdown.mode.write': 'Escribir',
	'form.markdown.mode.split': 'Dividido',
	'form.markdown.mode.preview': 'Vista',
	'form.markdown.previewRegion': 'Vista previa de Markdown',
	'form.markdown.previewEmpty': 'La vista previa aparecerá aquí.',
	'form.markdown.previewLoading': 'Preparando la vista previa…',
	'form.markdown.wordCountOne': '1 palabra',
	'form.markdown.wordCountMany': '{count} palabras',
	'form.markdown.shortcutHint': 'Markdown · ⌘/Ctrl B · I · K',
	'form.markdown.placeholderText': 'texto',
	'form.markdown.placeholderCode': 'código',
	'form.markdown.placeholderAlt': 'descripción',
	'form.markdown.unsafeUri':
		'El Markdown contiene HTML o una dirección no permitida. Usa sintaxis Markdown y enlaces http, https, mailto o relativos.',

	// ————— Listado (Fase 4c del contrato P4) —————
	'list.empty.title': 'Aquí no hay nada todavía',
	'list.empty.body': 'Crea el primer registro de "{label}" para empezar.',
	'list.empty.cta': 'Crear',
	'list.error.title': 'No se pudo cargar el listado',
	'list.error.body': '{message}',
	'list.pagination.prev': 'Anterior',
	'list.pagination.next': 'Siguiente',
	// Rango de registros visibles (match 1:1 con el mockup `.table-foot .range`, "1–20 de 24"):
	// sustituye a `list.pagination.total`/`.perPage` (contador + tamaño de página por separado).
	'list.pagination.range': '{first}–{last} de {total}',
	'list.cell.yes': 'Sí',
	'list.cell.no': 'No',
	'list.untitled': '(sin título)',

	// ————— Toolbar de listado (Fase 4d del contrato P4) —————
	'list.search.placeholder': 'Filtrar por título o slug…',
	'list.search.ariaLabel': 'Buscar en el listado',
	'list.sort.ariaLabel': 'Ordenar por {column}',
	'list.emptySearch.title': 'Sin resultados',
	'list.emptySearch.body':
		'Ningún registro de "{label}" coincide con la búsqueda o los filtros activos.',
	'list.emptySearch.clear': 'Limpiar filtros',
	// Menú "Filtrar" (M6, reabre R2): botón que despliega las opciones crudas del `statusField`
	// (`ListToolbar.svelte`); `list.filter.groupLabel` (abajo) etiqueta el popup en sí.
	'list.filter.menu.trigger': 'Filtrar',
	// "Limpiar filtros" siempre visible en la toolbar mientras haya algún filtro/búsqueda activo
	// (mockup `.toolbar .clear-filters`) — clave DISTINTA de `list.emptySearch.clear` (mismo texto,
	// contexto distinto: aquella vive dentro del estado vacío-búsqueda).
	'list.filter.clearAll': 'Limpiar filtros',

	// ————— Cabecera de listado (R2 del rediseño C2, mockup `.listhead`) —————
	// Etiqueta del POPUP del menú "Filtrar" (M6): antes describía el grupo de chips de la extinta
	// `FilterChips.svelte`; ahora describe el `role="menu"` con las opciones para ELEGIR un
	// filtro nuevo (ver `ListToolbar.svelte`).
	'list.filter.groupLabel': 'Filtrar por estado',
	'list.new.button': 'Crear «{label}»',

	// ————— Chips de filtro ACTIVO (M6, reabre R2, mockup `.toolbar .chip`) —————
	'list.activeFilter.groupLabel': 'Filtros activos',
	'list.activeFilter.status.key': 'Estado:',
	'list.activeFilter.status.remove': 'Quitar filtro de estado',

	// ————— Meta de cabecera + exportar (M2, mockup `.page-head .meta`/`.btn`) —————
	'list.meta.records': 'registros',
	'list.meta.filters': 'filtros',
	'list.export.button': 'Exportar',

	// ————— Exportar: diálogo de alcance + progreso (`#lote-esquema`, Fase 1) —————
	'list.export.dialog.title': 'Exportar «{label}»',
	'list.export.dialog.scopeLabel': 'Qué exportar',
	'list.export.scope.all': 'Toda la colección',
	'list.export.scope.filtered': 'Solo el filtro o búsqueda actual',
	'list.export.scope.filteredDisabledHint': 'No hay ningún filtro ni búsqueda activos.',
	'list.export.dialog.confirm': 'Exportar',
	'list.export.progress.starting': 'Preparando la exportación…',
	'list.export.progress': 'Exportando… {fetched} de {total}',
	// Dos claves, no un plural genérico (i18n v1 lo deja fuera de alcance a propósito, ver
	// `$lib/i18n/index.ts`) — mismo idioma que `media.selection.labelOne`/`labelMany`
	// (`MediaSelectionBar.svelte`): el llamador elige con `count === 1`.
	'list.export.success.one': 'Se ha exportado 1 registro de «{label}».',
	'list.export.success.many': 'Se han exportado {count} registros de «{label}».',
	'list.export.error': 'No se pudo completar la exportación. Vuelve a intentarlo.',

	// ————— Importar (`#lote-esquema`, Fase 2): botón + diálogo (ver `ImportDialog.svelte`) —————
	'list.import.button': 'Importar',
	'list.import.dialog.title': 'Importar un fichero .vega.json',
	'list.import.pick.label': 'Elige un fichero .vega.json',
	'list.import.pick.hint':
		'Solo ficheros .vega.json generados por "Exportar". Puede traer varias colecciones.',
	'list.import.reading': 'Leyendo «{fileName}»…',

	// ————— Fichero inválido (§4.1: cabecera/colecciones/campos, todo-o-nada) —————
	'list.import.invalid.title': 'Este fichero no se puede importar',
	'list.import.invalid.malformed': 'El fichero no tiene la forma de un .vega.json válido.',
	'list.import.invalid.unrecognizedVersion':
		'Este fichero es de una versión del formato que esta versión de Vega no reconoce.',
	'list.import.invalid.unknownCollection': 'La colección «{type}» no existe en este proyecto.',
	'list.import.invalid.unknownField':
		'El campo «{field}» de «{type}» ya no existe en el esquema actual.',

	// ————— Vista previa (§4.2): los tres estados + confirmación aparte del PISA —————
	'list.import.status.create': 'Nuevo',
	'list.import.status.overwrite': 'Sobrescribe',
	'list.import.status.blocked': 'Bloqueado',
	'list.import.preview.summary':
		'{create} nuevos · {overwrite} sobrescriben · {blocked} bloqueados',
	'list.import.preview.confirmOverwrite':
		'Confirmo que quiero sobrescribir estos {count} registros ya existentes.',
	'list.import.preview.nothingToImport':
		'No hay nada que importar: todos los registros están bloqueados.',
	'list.import.blockedReason.noCreatePermission': 'sin permiso para crear en esta colección',
	'list.import.blockedReason.noUpdatePermission': 'sin permiso para editar en esta colección',
	'list.import.blockedReason.danglingRelation':
		'el campo «{field}» apunta a un registro que no existe',
	'list.import.blockedReason.requiredEmpty': 'el campo obligatorio «{field}» llega sin valor',
	'list.import.blockedReason.unreachableRequiredFile':
		'el fichero obligatorio del campo «{field}» no se pudo traer del origen',

	// ————— Escritura + informe (§4.3/§4.4) —————
	'list.import.dialog.confirm': 'Importar',
	'list.import.progress': 'Importando…',
	'list.import.report.summary':
		'{created} creados · {updated} actualizados · {failed} con error · {skipped} omitidos',
	'list.import.report.failedTitle': 'Registros que fallaron',
	// Mismo criterio "dos claves, no plural genérico" que `list.export.success.*` de arriba.
	'list.import.success.one': 'Se ha importado 1 registro.',
	'list.import.success.many': 'Se han importado {count} registros.',
	'list.import.partial':
		'La importación terminó con {failed} registros fallidos. Revisa el informe.',
	'list.import.error': 'No se pudo preparar la vista previa. Vuelve a intentarlo.',

	// ————— Borrado (Fase 4e del contrato P4) —————
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

	// ————— Integridad referencial (`#lote-integridad`, Fase A): motor "¿dónde se usa esto?" —————
	// Compartido por `UsedInPanel`/`ReferencesSummary` (panel pasivo) y por el aviso de
	// `DeleteConfirm`/`MediaDeleteConfirm` (gate antes de borrar) — de ahí el namespace `integrity.*`
	// en vez de `list.*`/`media.*`: la MISMA redacción vale para un registro de contenido o un asset.
	'integrity.usedIn.toggle': 'Se usa en',
	'integrity.usedIn.loading': 'Comprobando dónde se usa…',
	'integrity.usedIn.empty': 'Nadie le apunta todavía.',
	'integrity.usedIn.error': 'No se pudo comprobar dónde se usa.',
	'integrity.usedIn.retry': 'Reintentar',
	'integrity.usedIn.partial':
		'Aviso: no se pudo comprobar todo. Puede haber más referencias de las que se muestran aquí.',
	'integrity.usedIn.countLabel': '{count} registro(s)',
	'integrity.usedIn.moreCount': 'y {count} más',
	'integrity.usedIn.collectionDegraded': 'No se pudo comprobar "{collection}" ({reason}).',
	// Traducción de `VegaErrorKind` (más `'unknown'`, ver `ReferenceMatchDegraded`) al motivo
	// humano que rellena `integrity.usedIn.collectionDegraded` — NUNCA el `message` crudo del
	// `VegaError` (P1 §5: puede llevar sintaxis/URLs del backend).
	'integrity.usedIn.reason.forbidden': 'sin permiso para leer esta colección',
	'integrity.usedIn.reason.network': 'sin conexión con el backend',
	'integrity.usedIn.reason.backend': 'el backend respondió algo inesperado',
	'integrity.usedIn.reason.not-found': 'la colección ya no existe',
	'integrity.usedIn.reason.auth-expired': 'la sesión caducó a mitad de la comprobación',
	'integrity.usedIn.reason.validation': 'la consulta no es válida contra este backend',
	'integrity.usedIn.reason.unknown': 'motivo desconocido',

	// ————— Aviso de referencias ANTES de borrar (mismo motor, `DeleteConfirm`/`MediaDeleteConfirm`) —————
	'integrity.deleteGuard.checking': 'Comprobando referencias…',
	'integrity.deleteGuard.checkFailed':
		'No se pudo comprobar si hay referencias activas; puedes borrar igual.',
	'integrity.deleteGuard.warning':
		'Hay referencias activas hacia esto. Bórralo con conocimiento de causa:',
	// Solo se pinta cuando alguna referencia es POR RELACIÓN (`hasRelationMatches`, fix de code
	// review contra PocketBase 0.39.6): al borrar, PB limpia esos campos en el acto, y restaurar
	// desde la papelera NO los reconecta — las de texto/URL sí se benefician del id vivo de nuevo,
	// así que esta línea sería falsa para ellas y no se muestra en ese caso.
	'integrity.deleteGuard.relationWarning':
		'Al borrar, PocketBase limpia esas relaciones al instante (vacía el campo o quita el id del array). Si restauras este registro desde la papelera más tarde, esos enlaces NO vuelven.',
	'integrity.deleteGuard.confirmCheckbox':
		'Entiendo que hay referencias activas y quiero borrar igualmente.',

	// ————— Historial de versiones (`#lote-integridad`, Fase B) — panel del editor —————
	'revisions.panel.toggle': 'Historial',
	'revisions.panel.loading': 'Cargando historial…',
	'revisions.panel.empty': 'Todavía no hay versiones guardadas.',
	'revisions.panel.error': 'No se pudo cargar el historial.',
	'revisions.panel.retry': 'Reintentar',
	'revisions.panel.unavailable': 'El historial de versiones no está activado en este proyecto.',
	'revisions.panel.unknownDate': 'Fecha desconocida',
	'revisions.panel.unknownAuthor': 'alguien',
	'revisions.restoredToast':
		'Valores cargados en el formulario. Revisa y guarda para conservarlos.',

	// ————— Historial de versiones — diff de una revisión —————
	'revisions.diff.back': 'Volver al historial',
	'revisions.diff.loading': 'Comparando versiones…',
	'revisions.diff.error': 'No se pudo comparar esta versión.',
	'revisions.diff.noChanges': 'No hay diferencias con la versión actual.',
	'revisions.diff.restore': 'Restaurar en el formulario',
	'revisions.diff.empty': '(vacío)',
	'revisions.diff.absent': '(no existía)',
	'revisions.diff.relationCount': '{count} vinculado(s)',
	'revisions.diff.retry': 'Reintentar',

	// ————— Historial de versiones — Ajustes (bootstrap + retención + recuento) —————
	'revisions.settings.title': 'Historial y papelera',
	'revisions.settings.description':
		'Guarda una versión anterior de cada registro antes de sobrescribirlo, para poder compararla o recuperarla.',
	'revisions.settings.count': '{count} versión(es) guardadas ahora mismo.',
	'revisions.settings.countError': 'No se pudo obtener el recuento de versiones.',
	'revisions.settings.enabled': 'Historial activado',
	'revisions.settings.keepPerRecord': 'Versiones a conservar por registro',
	'revisions.settings.trashDays': 'Días en la papelera',
	'revisions.settings.save': 'Guardar retención',
	'revisions.settings.saving': 'Guardando…',
	'revisions.settings.creatableBody':
		'La colección "vega_revisions" todavía no existe en este backend.',
	'revisions.settings.create': 'Crear colección de historial',
	'revisions.settings.confirmBody':
		'Vega va a crear la colección "vega_revisions" en tu PocketBase. ¿Continuar?',
	'revisions.settings.confirm': 'Crear colección',
	'revisions.settings.creating': 'Creando…',
	'revisions.settings.manualBody':
		'La colección "vega_revisions" no se puede crear automáticamente. En el Admin de PocketBase: Collections → Import collections, pega el siguiente JSON y confirma.',
	'revisions.settings.staleReadError':
		'No se pudo comprobar el manifiesto actual antes de guardar. Vuelve a intentarlo: nada se ha guardado.',

	// ————— Papelera (`#lote-integridad`, Fase B2) — línea compartida de los 4 diálogos de borrado —————
	'revisions.trash.deleteHint': 'Podrás recuperarlo desde la papelera durante {days} día(s).',
	'revisions.trash.deleteHintUnavailable':
		'Este borrado será DEFINITIVO: la papelera no está activada en este proyecto.',
	'revisions.trash.deleteFilesHint':
		'Los ficheros adjuntos no se recuperan, aunque restaures el registro.',

	// ————— Papelera — ruta /papelera —————
	'revisions.trash.pageTitle': 'Papelera',
	'revisions.trash.description':
		'Registros y assets borrados. Puedes restaurarlos con su id original mientras no pasen de la retención configurada en Ajustes.',
	'revisions.trash.loading': 'Cargando papelera…',
	'revisions.trash.error': 'No se pudo cargar la papelera.',
	'revisions.trash.retry': 'Reintentar',
	'revisions.trash.unavailable': 'La papelera no está activada en este proyecto.',
	'revisions.trash.empty': 'La papelera está vacía.',
	'revisions.trash.itemCollection': 'Colección: {collection}',
	'revisions.trash.itemFilesLost': 'Tenía ficheros adjuntos: no se restaurarán.',
	'revisions.trash.restore': 'Restaurar',
	'revisions.trash.restoring': 'Restaurando…',
	'revisions.trash.restoreUnavailable':
		'Este backend no permite restaurar con el id original: "Restaurar" no está disponible.',
	'revisions.trash.restoreUnknownSchema':
		'La colección "{collection}" ya no existe en el esquema: no se puede restaurar con seguridad.',
	// `requiredFileFieldName` (`revisions/restore.ts`): ningún campo `file` sobrevive a un
	// restaurado (PB destruye el binario al borrar, §0.3), así que una colección con uno OBLIGATORIO
	// no puede recrearse completa — derivado del esquema, no un caso especial de "vega_media".
	'revisions.trash.restoreBlockedRequiredFile':
		'El campo "{field}" de "{collection}" es un fichero obligatorio: los ficheros no se restauran nunca (§0.3), así que este registro no se puede recrear completo. "Restaurar" no está disponible.',
	'revisions.trash.restoreSuccess': '"{label}" se ha restaurado.',
	'revisions.trash.deleteForever': 'Borrar definitivamente',
	'revisions.trash.deleteForeverConfirmTitle': '¿Borrar «{label}» definitivamente?',
	'revisions.trash.deleteForeverConfirmBody':
		'Esta entrada de la papelera desaparecerá para siempre: ya no podrás restaurar este registro.',
	'revisions.trash.deleteForeverConfirm': 'Borrar definitivamente',
	'revisions.trash.deleteForeverDeleting': 'Borrando…',
	'revisions.trash.deleteForeverSuccess': '"{label}" se ha borrado definitivamente de la papelera.',
	'revisions.trash.emptyTrash': 'Vaciar papelera',
	'revisions.trash.emptyTrashConfirmTitle': '¿Vaciar la papelera?',
	'revisions.trash.emptyTrashConfirmBody':
		'Se borrarán definitivamente las {count} entrada(s) de la papelera: ya no podrás restaurar ninguno de estos registros.',
	'revisions.trash.emptyTrashConfirm': 'Vaciar papelera',
	'revisions.trash.emptyTrashEmptying': 'Vaciando…',
	'revisions.trash.emptyTrashSuccess': 'Papelera vaciada.',
	// Un fallo cortó el bucle de `emptyTrash` a mitad (revisions/empty-trash.ts): nunca "vaciada"
	// con algo pendiente — dice lo que de verdad pasó, `remaining` sale del último recuento
	// fiable del backend.
	'revisions.trash.emptyTrashPartial':
		'Se han borrado {deleted} entrada(s); quedan {remaining} por un error. Vuelve a intentarlo.',

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
	// el original de la biblioteca no rompe las copias ya insertadas en registros. Desde
	// `#lote-integridad` Fase A, `MediaDeleteConfirm` SÍ consulta la vía (b) del motor de
	// referencias (`contains <filename>` en campos texto/richtext): el aviso genérico de abajo
	// sigue siendo cierto para las copias, pero una URL directa pegada a mano en un campo de texto
	// SÍ puede quedar rota — de eso avisan las claves `integrity.deleteGuard.*`.
	'media.detail.delete': 'Borrar',
	'media.delete.confirmTitle': '¿Borrar «{label}»?',
	'media.delete.confirmBody':
		'Esto elimina el original de la biblioteca. Las copias ya insertadas por la biblioteca en registros no se ven afectadas.',
	'media.delete.confirm': 'Borrar',
	'media.delete.deleting': 'Borrando…',
	'media.delete.success': '"{label}" se ha borrado de la biblioteca.',

	// ————— Medios: reemplazar fichero (`#lote-integridad`, Fase A) —————
	// Premisa CORREGIDA (ver cabecera del contrato): PB renombra el fichero guardado con un sufijo
	// aleatorio, así que NO se puede prometer "conserva su URL" — solo se conserva el id y los
	// metadatos del registro (`alt`/`title`/`tags`), por eso `warningIdentity`/`warningUrl` son dos
	// mensajes DISTINTOS y ninguno menciona caché (no aplica: la URL cambia de nombre, no de valor).
	'media.detail.replace': 'Reemplazar fichero',
	'media.replace.rejectedTooLarge': 'El fichero elegido excede el tamaño máximo permitido.',
	'media.replace.rejectedInvalidType': 'El fichero elegido no es de un tipo admitido.',
	'media.replace.confirmTitle': '¿Reemplazar el fichero de «{label}»?',
	'media.replace.warningIdentity':
		'El registro conserva su id y sus metadatos (alt, título, etiquetas): cualquier referencia por relación sigue siendo válida.',
	'media.replace.warningUrl':
		'La URL directa del fichero VA A CAMBIAR: quien la tuviera pegada a mano dejará de verla.',
	'media.replace.usedInIntro': 'Esto es lo que usaba la URL actual, antes de reemplazarla:',
	'media.replace.confirm': 'Reemplazar',
	'media.replace.replacing': 'Reemplazando…',
	'media.replace.success': 'Fichero reemplazado. La URL directa ha cambiado.',

	// ————— Medios: cabecera + toolbar de la biblioteca (rediseño «aquelarre-medios») —————
	// El recuento de la cabecera es el TOTAL de la biblioteca (`totalItems` del listado), nunca el
	// de la página ni el del filtro. El mockup añade además el peso total en MB: Vega no lo sabe
	// (§4.4, el puerto no expone el tamaño de un fichero ya almacenado) y no se inventa.
	'media.meta.files': 'archivos',
	'media.search.placeholder': 'Buscar por nombre de archivo…',
	'media.search.ariaLabel': 'Buscar en la biblioteca por nombre de archivo',
	'media.filter.groupLabel': 'Filtrar por tipo',
	'media.filter.all': 'Todos',
	'media.filter.images': 'Imágenes',
	'media.filter.video': 'Vídeo',
	'media.filter.documents': 'Documentos',
	'media.filter.empty': 'Ningún archivo de esta página coincide con la búsqueda o el tipo elegido.',
	'media.filter.clear': 'Limpiar filtros',

	// ————— Medios: barra de selección (rediseño «aquelarre-medios») —————
	// Sin "Insertar" (ver `MediaSelectionBar.svelte`): insertar en un campo solo existe cuando la
	// biblioteca se abre como selector desde un formulario (`MediaPicker`).
	'media.selection.toggle': 'Seleccionar «{label}»',
	// Dos claves en vez de un "(s)": la barra es la única superficie de la app con este recuento a
	// la vista (el del picker, `media.picker.selectedCount`, es otro contexto y se queda como está),
	// así que no compensa montar un motor de plurales — se elige por el número, y punto.
	'media.selection.labelOne': 'seleccionado',
	'media.selection.labelMany': 'seleccionados',
	'media.selection.copy': 'Copiar URL',
	'media.selection.copySuccess': '{count} URL(s) copiada(s) al portapapeles.',
	'media.selection.copyError': 'No se pudo copiar al portapapeles.',
	'media.selection.delete': 'Eliminar',
	'media.selection.deleteTitle': '¿Borrar {count} archivos de la biblioteca?',
	'media.selection.deleteSuccess': '{count} archivo(s) borrado(s) de la biblioteca.',

	// ————— Medios: subida drag&drop (Fase P6·6c) —————
	'media.upload.inputLabel': 'Subir ficheros',
	'media.upload.button': 'Subir archivos',
	// Banda de arrastre (mockup `.dropzone`), troceada porque cada parte se pinta distinta: el
	// gesto en negrita y el límite en `--mono` (valor canónico). `{max}` sale del esquema REAL de
	// `vega_media` (`file.maxSizeBytes`), nunca de una constante escrita a mano.
	'media.upload.dropzoneLead': 'Arrastra archivos aquí o',
	'media.upload.dropzoneAction': 'haz clic para elegirlos',
	'media.upload.dropzoneMax': 'máx. {max}',
	'media.upload.dropzoneMaxSuffix': 'por archivo',
	'media.upload.retry': 'reintentar',
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

	// ————— Autoría de esquema (lote "esquema", Fase 1): crear colecciones/añadir campos —————
	// Visible solo cuando `capabilities.schemaBootstrap`/`schemaFieldBootstrap` lo permiten (ley
	// de capacidades) — sin superuser, esta sección entera no se ofrece (mismo gate que el
	// editor del manifiesto, ver L6c más abajo). Ver `SchemaAuthoringPanel.svelte`.
	'settings.schema.title': 'Esquema',
	'settings.schema.description':
		'Crea colecciones nuevas o añade campos a una que ya existe. Estrictamente aditivo: nunca renombra ni borra nada (en PocketBase eso destruye la columna y sus datos, sin deshacer).',
	'settings.schema.create.title': 'Crear colección',
	'settings.schema.create.nameLabel': 'Nombre de la colección',
	'settings.schema.create.namePlaceholder': 'p. ej. posts',
	'settings.schema.create.nameInvalid':
		'Debe empezar por una letra y usar solo letras, números o guion bajo.',
	'settings.schema.create.submit': 'Crear colección',
	'settings.schema.create.submitting': 'Creando…',
	'settings.schema.create.nameReserved':
		'Ese nombre pertenece a Vega («vega» y todo lo que empieza por «vega_»): son colecciones que Vega crea y mantiene por su cuenta. Elige otro.',
	'settings.schema.create.success': 'Colección "{name}" creada.',
	'settings.schema.create.alreadyExists':
		'La colección "{name}" ya existía: no se ha modificado (nunca se sobreescribe una colección real). Usa "Añadir campos" para ampliarla.',
	'settings.schema.addFields.title': 'Añadir campos',
	'settings.schema.addFields.targetLabel': 'Colección',
	'settings.schema.addFields.targetPlaceholder': 'Elige una colección…',
	'settings.schema.addFields.submit': 'Añadir campos',
	'settings.schema.addFields.submitting': 'Añadiendo…',
	'settings.schema.addFields.success': '{count} campo(s) añadido(s) a "{collection}".',
	'settings.schema.addFields.noneAdded':
		'Ningún campo nuevo: todos los indicados ya existían en "{collection}" y se han dejado intactos.',
	'settings.schema.addFields.empty':
		'Todavía no hay ninguna colección propia. Crea una primero en "Crear colección".',
	'settings.schema.fields.nameLabel': 'Nombre del campo',
	'settings.schema.fields.namePlaceholder': 'p. ej. title',
	'settings.schema.fields.typeLabel': 'Tipo',
	'settings.schema.fields.requiredLabel': 'Obligatorio',
	'settings.schema.fields.maxLabel': 'Longitud máx. (opcional)',
	'settings.schema.fields.addRow': 'Añadir campo',
	'settings.schema.fields.removeRow': 'Quitar campo',
	// Landmine real de PocketBase, ya cazada en producción: un `number` `required` rechaza el
	// valor 0 (PB trata "obligatorio" como "distinto del cero-valor", y 0 ES el cero-valor de
	// number). Aviso, no bloqueo: hay rangos legítimos que necesitan 0 (p. ej. una valoración
	// 0–5) sin marcar el campo como obligatorio.
	'settings.schema.fields.numberRequiredWarning':
		'PocketBase rechaza el valor 0 en un campo numérico marcado como obligatorio. Si necesitas permitir 0 (p. ej. una valoración de 0 a 5), no lo marques como obligatorio.',
	'settings.schema.fields.type.text': 'Texto',
	'settings.schema.fields.type.number': 'Número',
	'settings.schema.fields.type.bool': 'Sí/No',
	'settings.schema.fields.type.date': 'Fecha',
	'settings.schema.fields.type.json': 'JSON',
	'settings.schema.fields.type.relation': 'Relación',
	'settings.schema.fields.relation.targetLabel': 'Colección relacionada',
	'settings.schema.fields.relation.targetPlaceholder': 'Elige una colección…',
	'settings.schema.fields.relation.targetEmpty': 'No hay colecciones editables disponibles',
	'settings.schema.fields.relation.targetRequired':
		'Elige la colección con la que se relaciona este campo.',
	'settings.schema.fields.relation.multipleLabel': 'Permitir varios registros',
	'settings.schema.fields.relation.onDeleteLabel': 'Al borrar el registro relacionado',
	'settings.schema.fields.relation.onDeleteUnlink': 'Conservar este registro',
	'settings.schema.fields.relation.onDeleteCascade': 'Borrar este registro',
	'settings.schema.fields.relation.cascadeWarning':
		'PocketBase borrará este registro al eliminar su última relación. Esta acción no se puede deshacer.',
	'settings.schema.error': 'Error: {message}',
	// Migración JS emitida tras crear/añadir con éxito (mitad 2 del lote "esquema"): sin esto,
	// cada edición de esquema desde Vega aleja producción del repo EN SILENCIO.
	'settings.schema.migration.title': 'Migración generada',
	'settings.schema.migration.instructions':
		'Guarda este fichero como pb_migrations/{filename} en el repositorio de tu proyecto y commítalo: sin él, este cambio de esquema solo existe en tu PocketBase, no en tu control de versiones.',
	'settings.schema.migration.copy': 'Copiar',
	'settings.schema.migration.copied': 'Copiado',

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

	// ————— Comprobación de actualizaciones (P8, opt-in): ver `update/check-update.ts` —————
	'settings.about.checkUpdate': 'Comprobar actualizaciones',
	'settings.about.checking': 'Comprobando…',
	'settings.about.upToDate': 'Estás en la última versión (v{version}).',
	'settings.about.updateAvailable': 'Hay una versión nueva: v{version}.',
	'settings.about.updateAvailableLink': 'Ver el release',
	'settings.about.checkError': 'No se pudo comprobar (revisa tu conexión).',
	'settings.about.autoCheckLabel': 'Comprobar actualizaciones automáticamente al iniciar',
	'settings.about.autoCheckHelp':
		'Al activarlo, Vega contacta con api.github.com cada vez que abres la app para ver si hay una versión nueva. Desactivado por defecto: Vega nunca sale a internet sin que lo pidas.',

	// ————— Banner de actualización disponible (`UpdateBanner.svelte`, P8) —————
	'update.banner.message': 'Hay una versión nueva de Vega disponible: v{version}.',
	'update.banner.link': 'Ver el release',
	'update.banner.dismiss': 'Descartar aviso de actualización',

	// ————— Toasts (§2.3) —————
	'toast.dismiss': 'Descartar aviso',

	// ————— Genérico —————
	'common.retry': 'Reintentar',
	'common.cancel': 'Cancelar',
	'common.close': 'Cerrar',
	'common.loading': 'Cargando…'
};
