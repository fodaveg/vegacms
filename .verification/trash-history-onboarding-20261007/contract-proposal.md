# Preparar historial y recuperar borrados: contrato propuesto

Candidato leído en solo lectura: `4d9f891e1237504ed136573f76493b1b77497c56`, árbol `ea4a545149a2d9888344e338e64f8cf20bfda6dd`, worktree `/private/tmp/vegacms-backlog-r2-20261007`. Tarea `c49bf0f1-a6d1-474d-a408-d7546dc7d9f7`. Fuente: petición y lectura fresca suministradas por raíz; notas de tarea vacías. No hay código de producto editado, worktree nuevo, instalación, backend, gate ni build por este análisis. Grafo `vega-backlog-r2-20261007` primero para localizar; sus snippets Svelte y alguno TS incompletos/antiguos obligaron a leer las rutas actuales del checkout.

## Veredicto sobre las premisas

**P2 de premisa: «apagados de fábrica» ya no describe el código.** Resolver del modelo, decorador y Ajustes fijan `enabled=true`, `keepPerRecord=20`, `trashDays=30` si el manifiesto no declara estos valores. Sí puede faltar `vega_revisions`: sin su colección no existe almacenamiento real, aunque el flag esté habilitado. Un `enabled:false` explícito conserva una decisión existente; no se reactiva automáticamente. Tampoco se cambian retenciones explícitas (incluido cero).

**P2 de contrato: una restauración no equivale a Deshacer todo un borrado.** La papelera actual guarda pre-imágenes JSON, no hace soft delete. PocketBase destruye ficheros y limpia relaciones entrantes al borrar; recrear el mismo ID no recupera esos enlaces ni cascadas. Está documentado junto al consumidor en `integrity/references.ts#hasRelationMatches`, `revisions/restore.ts` y `docs/POCKETBASE-INTEGRATION.md`. No autoriza una garantía nueva ni cambiar el invariante best-effort global.

Reconciliación recomendada antes de implementar: ofrecer preparar el almacenamiento faltante al primer acceso elegible a Inicio; añadir acceso a la entrada concreta de papelera únicamente tras confirmar un snapshot real del borrado; rotular recuperación con sus límites. La recomendación sustituye la premisa vieja, pero es una propuesta de producto dirigida a raíz, no una aceptación atribuida a David. No cerrar la tarea con «Deshacer» completo si solo se implementa recuperación.

## Hechos verificados y consumidores

| Superficie | Estado real en esta base | Consecuencia |
|---|---|---|
| `model/resolve.ts#resolveRevisions`, `model/manifest-schema.json#/revisions`, `revisions/with-revisions.ts` | enabled=true, keep=20, trash=30. Claves estrictas; additionalProperties=false en raíz/revisions. | No flip de defaults ni metadatos onboarding inventados en manifiesto. |
| `revisions/trash-availability.ts` | `enabled` y nombre de colección presente. `isDeleteRecoverable` además excluye required file. No prueba permisos/esquema de revisions ni resultado del snapshot. | Es señal de disponibilidad previa, nunca comprobante de Undo posterior. |
| `revisions/RevisionsSettings.svelte` | Ya monta bootstrap, confirmación inline, retención, lectura fresca del manifiesto y recuento. `settings/+page.svelte` lo monta solo con schemaBootstrap. | Reutilizar destino `settings#vega-revisions-settings-title`; no duplicar creación en Home. |
| `revisions/revisions-collection.ts` | `ensureRevisionsCollection` llama solo ensureCollections([VEGA_REVISIONS_COLLECTION]); idempotente/no modifica colección existente. | No inventar migraciones UI. Después bootstrap exige refresco, validación y reset del latch. |
| `model/load.ts#saveManifest` | Validación estricta, bootstrap de vega si falta, snapshot de esquema, update/create del manifiesto canónico. No expectedVersion. | Si se escribiera enabled, merge sobre lectura fresca; no fingir atomicidad entre GET/PATCH. Ruta existente basta en propuesta recomendada. |
| `session/backend.ts#createInstance`, `routes/+layout.svelte` | Ambos adaptadores envueltos por withRevisions; reloadModel resetea latch/config y relee modelo. Memory con preview test crea un spread externo del puerto. | Todo ticket privado debe sobrevivir decoradores/spreads (ver seam propuesto). |
| `backend/port.ts` | delete→Promise<void>; create({id}) requiere explicitRecordId; no trash/restore/transaction/conditionalDelete. | No deducir ticket de un éxito void. Restore usa contrato create, sin sobrescribir ID vivo. |
| `revisions/with-revisions.ts#snapshotBeforeDelete/delete` | Lee pre-imagen→crea snapshot→delete real. Fallo snapshot no bloquea delete; delete fallido compensa snapshot best-effort. La poda global puede correr antes de terminar delete. | Un ticket no nulo exige comprobar persistencia/caducidad tras el éxito, no solo tener revisionId en memoria. Nunca falla la escritura por no disponer de recuperación. |
| `routes/papelera/+page.svelte#handleRestore` | Valida colección/readonly/requiredfile/explicitID, buildRestoreInput elimina file/readonly/unsupported, create mismoID; limpia snapshot best-effort. UI no gatea create permission aparte; backend decide. | El nuevo acceso solo navega a la papelera existente tras acreditar permiso/snapshot; no extrae ni modifica restore. Retención vencida no ofrece acción. |
| `integrity/references.ts`, `DeleteConfirm.svelte` | Referencias consultadas con parcial/error; fallos no bloquean delete. Aviso explícito sobre relaciones limpiadas. cascadeDelete se expone en Field. | Referencias desconocidas no significan sin relaciones. Ni esquema completo del modelo incluye auth/sistema excluidos por adaptador. |
| `routes/c/[type]/+page.svelte`, `routes/c/[type]/[id]/+page.svelte` | Dueños de delete registro, toast y refresco/navegación. `RecordForm` delega onDelete a ruta. | Ubicar feedback después de éxito ahí; conservar confirmación/errores/navegación. No duplicar delete en RecordForm. |
| `shell/toasts.svelte.ts`, `ToastHost.svelte`, `app-context.ts#FeedbackApi` | Solo mensaje+kind+timeout, sin acción. success/info=4s; error persistente. | Acciones precisan extensión aditiva documentada, trap/timeout/foco propio; no pasar callbacks por tipos ficticios. |
| `session/backend-config.ts`, `backend-override.ts` | Runtime opcional vega.config, override URL/auth y same-origin; manifestKey existe. | SPA no puede reescribir el fichero estático de configuración. Identidad por URL resuelta+manifestKey, no override aislado. |
| `home/recent-edits-store.ts` | Precedente localStorage best-effort; clave user/override usada para recientes, no identidad exacta del backend configurado. | Imitar tolerancia, no reutilizar clave incompleta para instalaciones. |

## Opciones concretas

| Opción | Entrega | Coste/superficie | Riesgo y límite |
|---|---|---|---|
| **A recomendada: preparación y recuperación honesta** | Tarjeta en Inicio → configuración existente; acceso «Ver en papelera» a snapshot confirmado tras delete. Al entrar allí se mantienen avisos/confirmación existentes. | Home componente+estado/preferencia; anchor de settings; resultado privado de delete; rutas de lista/edición; feedback con acción; es/en; tests afectados. Dos tramos coherentes, ~10–14 archivos, no 3–6. | Cumple descubribilidad y recuperación real, sin decir que restaura archivos/enlaces. Requiere ticket confirmado; no es Deshacer íntegro. |
| B: Deshacer para registros aislados | A + acción inmediata de restore para subconjunto seguro verificado, sin archivos ni posibilidad de relaciones/cascadas conocidas. | Reutilizar servicio restore compartido con papelera; revalidar esquema/identidad/permiso/caducidad, lock por ticket. ~4–6 archivos extra sobre A. | GET/DELETE no atómicos; hooks, esquema concurrente o relaciones de colecciones auth/sistema fuera del modelo impiden demostrar seguridad completa de una instalación genérica. No recomendar promesa universal. |
| C: Deshacer íntegro | Soft delete/transacción o guardar/restaurar binarios y referencias/cascadas. | Extensión/backend y contrato nuevo, migraciones y QA real. | Fuera de este encargo; no diseñar/implementar por arrastre. |

**Recomendación:** A. La raíz debe decidir si reformula la tarea a preparación y recuperación con límites, o exige resolver primero una garantía del backend para B. No iniciar implementación desde la premisa vieja ni esconder la parte Deshacer faltante. Una alternativa aún menor (solo tarjeta y link genérico a papelera) no puede ofrecer recuperación como resultado confirmado: sin ticket se puede decir «Borrado» y permitir navegación general, pero no «podrás recuperarlo».

## Contrato de preparación inicial (A)

1. Solo Inicio, después del modelo/sesión listos; no popup, no login y no bloqueo de crear/editar. Renderizar para sesión `schemaBootstrap` y modelo habilitado pero colección ausente. El Home sin nav ya tiene guía a Ajustes: añadir contexto en esa guía sin producir dos CTAs iguales. Si revisions está explícitamente deshabilitado, no interpretar como olvido ni acosar con primer arranque.
2. Tarjeta: «Guarda versiones anteriores y recupera registros borrados». Texto: «Prepara el historial y la papelera para este sitio. Los archivos adjuntos y los enlaces que se eliminan al borrar no se recuperan». CTA «Preparar historial y papelera» navega a sección existente. Secundario «Ahora no». Sin escrituras de esquema ni manifiesto desde Home.
3. Persistencia de «Ahora no»: **preferencia de este navegador**, aislada por URL del backend efectivamente resuelta y normalizada (incluye subpath) + manifestKey normalizado, versión de clave. In-memory fallback si storage inaccesible; no decir «se guardó» si falla. La identidad se calcula en el bootstrap que YA conoce projectConfig/resolved url, se entrega por seam de sesión; no llamar resolveDisplayBackendUrl (no incorpora discovery manifestKey) ni leer solo override. No credenciales/ID/tokens en clave. Modo memory usa identidad explícita distinta y no se confunde con PocketBase.
4. Esta preferencia no es estado global compartido de instalación: otro navegador puede ofrecerlo otra vez. Una vez colección creada+enabled, la tarjeta desaparece por estado real en todos los navegadores, sin depender de storage. Persistencia global de descarte exigiría ampliar contrato/manifiesto o almacenamiento backend y gestionar concurrencia; no procede para metadata de un aviso. Nunca escribir enabled:false para representar descarte.
5. Ajustes conserva su bootstrap y confirmación inline sin ampliar su código. La oferta lleva al título con id existente. Nombre presente no ofrece la tarjeta inicial ni atribuye una garantía de protección: la confirmación posterior del snapshot decide acceso real. No añadir validación/bootstrap/refresco nuevo en Ajustes salvo bug acreditado necesario para esta oferta; los estados de error de la lámina no conceden alcance adicional.
6. Con permisos editor/no schemaBootstrap no ofrecer Activar. Papelera conserva su aviso de hablar con administrador/acceso permitido; Home no promete una operación no disponible. Retención se explica con valores vigentes; no reescribir 0/custom.

## Contrato de ticket y recuperación (A vigente)

- Ticket privado de operación exacta: `{revisionId, collection, recordId}`; no lleva fecha ni valores del registro. Proviene del MISMO snapshot que precedió al delete exitoso. El helper público de aplicación no amplía BackendPort. Fecha/caducidad se comprueban al leer la revisión persistida.
- Mantener snapshot best-effort y compensación vigentes. Snapshot fallido, eliminado por poda o no comprobable → éxito «Borrado» sin CTA. Después del delete: get(revisionId), parse, kind/collection/recordId exactos, fecha válida y retención vigente; luego list con filtro AND id=revisionId y kind=delete, perPage1. Solo ofrecer acceso si ESA revisión aparece realmente en items. List exitoso vacío no prueba acceso (listRule puede filtrar).
- Acción «Ver en papelera» persistente hasta cerrar/accionar: SOLO llama ctx.nav.toTrash(), sin parámetros de selección, nueva ruta, detalle ni extracción de restore. Navegación no promete enfocar una entrada. La papelera existente conserva restauración, avisos, conflictos y límites de archivos/enlaces. No se modifica su fuente ni se crean tests nuevos de restore en este lote.
- Revalidar contexto capturado ctx.port/user/token tras cada await y antes de emitir/ejecutar acción. Logout, renovación o cambio de contexto retiran la acción. No persistir tokens, títulos ni tickets. Ni repetir delete ni usar otro puerto para una operación de sesión anterior.
- Disponibilidad y permisos de listar/ver revisiones, snapshot real y enabled/caducidad vigentes gatean CTA; no exige restaurabilidad completa para CONSULTAR metadatos. No anuncia restauración, archivos ni relaciones repuestas. Fallos del helper de confirmación no transforman un borrado exitoso en error.
- La pre-imagen puede estar vieja si otro escribe entre GET y DELETE; BackendPort no tiene delete condicional. Ticket acredita versión guardada antes del borrado, sin nueva garantía de atomicidad. Inicialmente cubrir consumidores de borrado unitario de registros lista/edición; medios y múltiples conservan su feedback actual.

## Si raíz elige B

Solo ofrecer literal «Deshacer» cuando ticket real, explicitID, create permitido, esquema actual completo suficiente y sin pérdida de contenido del registro ni relaciones/cascadas. `hasRelationMatches=false` solo prueba lo observado; partial/error excluye y ni «sin matches» cierra carreras. La restricción estática más conservadora excluye toda colección con CUALQUIER campo relation entrante en esquema, aun vacío, además de file no vacío/requiredfile/unsupported con valores y destinos internos/readonly; no prueba hooks ni auth/sistema que el modelo omite. Por tanto B requiere una premisa adicional acreditada por instalación o capability backend que garantice seguridad, hoy ausente. Sin ella mostrar «Ver en papelera», no rotular un restore parcial como Deshacer. No ejecutar B solo porque el backend acepta create mismo ID.

## Verificación prevista (no ejecutada en este diseño)

- Elegibilidad: defaultenabled con colección faltante, explícito false, presente real, nombre presente esquema incompatible, admin/editor, Home vacío, custom/cero retención. Almacenamiento inválido/denegado no rompe Inicio; backend A→B, misma app con staticconfig diferente, manifestKey A→B, discovery, trailing slash/subpaths y logout no comparten descarte/ticket.
- Bootstrap: cero escrituras desde Home/descartar; CTA llega a sección; crear exige confirmación una sola vez; ensureCollection idempotente; refresh fallido no promete active ni pierde opción; no overwrite de configuración existente. Lectura de manifiesto concurrente no se reemplaza por snapshot viejo.
- Ticket: snapshotcreate falla/notfound/forbidden→delete sigue sin recuperación; delete falla→sin toastsuccess/ticket y compensación; dos deletes simultáneos no intercambian tickets; poda/trashDays0→sin CTA; ticket de otra colección/ID/kind/fecha rechaza. Test que falsifique snapshot silencioso discrimina la promesa, no solo refleja implementación.
- Restauración queda intacta y conserva evidencia/tests existentes; no escribir ni ejecutar nuevos tests de restore solo por esta propuesta. Los tests nuevos acreditan ticket exacto, existencia/caducidad, acceso get y listRule filtrando vacío, contexto y navegación a la ruta existente; no anuncian archivos/enlaces restaurados.
- UI: teclado/foco 44px, aria-live polite sin robar foco, acción persistente con cierre, acción ejecutándose única, feedback final real, fallback a papelera si caduca desaparece. Navegador desktop/móvil en ambos modos y sin pageErrors del candidato final. No crear otro gate; checks rápidos+focal y raíz gate conjunto.

## Diseño y siete ejes

Dirección: tarjeta contextual en Inicio dentro de la jerarquía actual, no asistente modal. En Ajustes se reutiliza la sección actual. Recuperación aparece en el toast existente como acceso persistente. Aquelarre, sistema de fuente del repo, alineado a izquierda, radios8/6, space4/8; una acción principal por estado. No nuevos tokens, imágenes, gradientes, ni dependencias.

| Eje | Estado del diseño |
|---|---|
| Tokens | Cubierto por copia exacta de themes.generated.css del candidato, semánticos ink/paper/surface/info/danger/ring; contraste medido en lámina Aquelarre: mínimo 5.91:1 de cinco pares semánticos por modo, ver plate-results.json; no acredita todos los temas de implementación. |
| Componentes/estados | Cubierto en lámina: oferta, descarte, bootstrap confirmación/carga/error, recuperación real, no ticket/ficheros/enlaces, activo. |
| Responsive | Parcial: reglas tarjeta/toast/botones ≤390, tablet y desktop escritas; lámina capturada en 390/1440 y claro/oscuro sin overflow; implementación aún pendiente de comprobar. |
| Accesibilidad | Parcial: jerarquía headings, texto envuelto, focus-visible, aria-live, targets44 y orden foco descritos; lámina medida: targets44, contraste≥5.91:1, Escape/foco de cancelación y navegación sin confirmar automáticamente; implementación y lector físico no acreditados. |
| Contenido/casos límite | Cubierto: título real largo, sin registro recuperable, disabled intencional, permisos/capabilities insuficientes, errores y pérdidas inherentes. |
| Feedback | Cubierto como propuesta: sin éxito falso de preparación, snapshot o restore; acción/cierre persistentes y bloqueo de doble acción; prueba pendiente. |
| Assets | Cubierto: SVG locales cadena/reloj/papelera existentes. Logo nuevo, imágenes y avatares: no aplicables. |

`plate.html` es una propuesta interactiva autocontenida de los estados descritos; ningún botón habla con backend ni escribe el runtime de Vega. No se acredita una implementación con esta lámina. Headless/capturas solo tras liberar el slot global de raíz. No nuevas decisiones humanas guardadas; raíz es único escritor de memoria compartida.

## Decisión de producto de raíz y API mínima propuesta (actualización)

La raíz eligió explícitamente A dentro del encargo: Home card única, bootstrap existente por acción humana, descarte local por backendURL+manifestKey y «Ver en papelera» tras un borrado cuya revisión real se confirme. No se implementa B ni código latente de Deshacer, ZIP, port.trash, restauración de relaciones o binarios. Esta elección sustituye las opciones abiertas de arriba. La raíz registra la reformulación en Lumbre y memoria compartida; este autor no muta esas superficies. Falta el freeze/revisión de este artefacto antes de escribir fuentes.

### Identidad del ofrecimiento

`session/backend.ts` YA conoce URL efectiva y discovery aplicados en createInstance. Exportar una lectura síncrona `backendInstallationKey(): string | null` desde ese mismo singleton, asignada solo al construir la instancia; la clave se compone de backend URL canónica sin username/password/query/hash, conservando origin/port/subpath, y de `port.manifestKey` normalizada (el adaptador ya la normaliza a VEGA_PROJECT_KEY). Para memory identidad explícita memory/demo, no same-origin PB. Sin identidad fiable, el descarte solo vale en memoria de esa sesión de Home. No segunda fetch de config/discovery ni nuevo campo de BackendPort. `revisions-onboarding` es un pequeño helper de preferencia local, no una segunda base de datos ni estado backend. Una clave v1 con JSON de ambos valores evita colisiones de separadores. El usuario no aparece en la clave: descarte por instalación en ESTE navegador, tal como eligió raíz. La exposición de datos frontend de URL nunca lleva credenciales; tampoco se usa el token como storagekey.

En demo memory, el bootstrap es real respecto a su estado en memoria, pero la colección creada no sobrevive a reconstruir la semilla. La oferta no puede prometer persistencia del historial entre recargas: texto de modo demo «En esta demo, los cambios se conservan durante esta sesión». Un editor con snapshot viejo/readonly y sin schemaBootstrap no recibe Activar ni oferta administrativa; una colección de contenido readonly no afecta a un bootstrap que administra la instalación. `revisions.enabled:false` explícito no muestra la propuesta inicial, y Ajustes conserva su checkbox desmarcado. Colección seed ausente +enabledtrue sí muestra preparación; seed con colección real+enabledtrue no muestra card.

### Ticket privado exacto, sin cambiar el puerto destructivo

```ts
interface DeleteRecoveryTicket {
  revisionId: RecordId;
  collection: string;
  recordId: RecordId;
}
// Helper de aplicación de revisions/, no método ni capability del BackendPort.
async function deleteWithRecovery(
  port: BackendPort, collection: string, id: RecordId
): Promise<DeleteRecoveryTicket | null>;
```

`with-revisions.ts` factoriza su lógica delete actual en un performDelete que devuelve revisionId|null tras éxito. `wrapped.delete` lo espera y devuelve void como ahora. Una WeakMap PRIVADA registra performDelete por identidad de `wrapped.delete`, que es una función estable y sobrevive al spread externo de preview de memory. `deleteWithRecovery` pide el handler de `port.delete` (mismo módulo); si no existe llama delete normal y devuelve null. No colas compartidas de tickets, observerglobal, getter lastdelete, ni lookup por collection/id. Cada llamada obtiene SU revisionId y registro exactos; operaciones simultáneas no colisionan. El handler sigue usando exactamente snapshotBeforeDelete/compensación vigentes. Una envoltura que reemplace delete y no registre handler degrada a delete normal sin acción, jamás bypassea esa envoltura llamando otra ruta. Pruebas negativas obligatorias: wrappers/decorador ajeno, spread memory y doble delete.

El helper SOLO acredita qué snapshot se intentó crear durante ese borrado. Confirmación de recuperación vive en un helper de lectura tras delete: get(revisionId), parseRevisionRecord, kind=delete y collection/recordId exactos, fecha válida dentro de la retención vigente, revisions.enabled y colección presente; `revisionsType.permissions.view/list` ofrecidos y una consulta AND id=revisionId y kind=delete (perPage1) que devuelve ESA revisión, no solo resuelve sin error. El tipo de origen no tiene que ser restaurable para CONSULTAR metadatos, pero en copy se dice «consultar la versión guardada», no «recuperarlo completo». Un fallo de cualquiera de estas lecturas no convierte delete en fallo: feedback «Borrado» sin acción. No saltarse guards ni relanzar errores de recovery como si borrado falló. Si no hay permisos reales de acceso, no mostrar CTA aunque snapshotcreate haya funcionado.

### Segregación por puerto y sesión

Al iniciar el borrado se capturan el objeto port, user.id y token de sesión en una closure efímera. Nada del token/user entra en URLs, logs, storage ni el ticket. Después de CADA await del helper de confirmación y antes de publicar feedback con acción, comprobar mismo ctx.port, user y token. Si cambió el contexto, suprimir la acción y no filtrar el título de la sesión anterior al nuevo usuario; no repetir ni compensar el delete que ya terminó por ese cambio. Con token renovado el ticket antiguo se descarta; la entrada backend sigue en papelera y se consulta allí con permisos vigentes.

`ToastHost` ejecuta la acción solamente si la misma closure aún confirma contexto. Layout retira toasts accionables cuando cambia sesión/token/puerto o se cierra sesión; las notificaciones normales conservan su comportamiento. En ejecución se comprueba otra vez el contexto. Esta limpieza se implementa en la cola de toasts existente, sin segundo store; la closure nunca vuelve a usar un puerto de sesión anterior después de logout. No reservar un singleton usuario activo en el módulo revisions: sus WeakMap entries solo relacionan función puerto y handler del mismo puerto, no tickets ni datos de usuario.

### Toast con acción aditiva

Extender las opciones de FeedbackApi y toastStore únicamente con:

```ts
interface ToastAction {
  label: string;
  invoke: () => void;     // Ver en papelera solo navega con ctx.nav.toTrash().
  isCurrent: () => boolean; // Guard de puerto/user/token; sin revelar su contenido.
}
// opts previo intacto, se añade action?: ToastAction.
```

Un toast con acción es persistente y muestra cierre; el timeout de success/info normales sigue 4s. La acción navega a la papelera EXISTENTE, sin nueva queryparam/detalle/paginación de selección. «Ver en papelera» no promete enfocar la entrada ni recalcular una restauración. Antes de invoke se verifica isCurrent; si falla se descarta. Tras invocar se retira ese toast para impedir activación duplicada. Layout expone dismissActions de la cola existente para retirar acciones al cambiar sesión. La implementación usará el vocabulario vecino para interfaces y comentarios, no inventará otro sistema de feedback.

Copy permitido: «Borrado. Puedes consultar la versión guardada en la papelera.» + «Ver en papelera». En el diálogo previo/papelera permanecen los avisos sobre binarios y enlaces. En la lámina se incluyen esos límites al lado del acceso para revisarlos; la fuente debe colocarlos sin duplicar warnings en cada toast. Si snapshot ausente, solo «Borrado»; no ofrece Deshacer ni Ver como resultado de recuperación real. Volver al listado desde edición mantiene navegación/labels originales. La cola sobrevive a navegación SPA; no sobrevive a logout.

### Superficie final prevista para A

Dos unidades coherentes del mismo objetivo: (1) Home card y preferencia/identidad, anchor/destino existente y copy; (2) ticket privado+confirmación, toastaction/lifecycle y consumidores unitarios lista/edición. Permiso de implementar ambos sujeto a revisión de este freeze. Paths previsibles: session/backend.ts, home/RevisionsOnboarding.svelte y helper/preferencia, routes/+page.svelte, revisions/with-revisions.ts y recovery helper, app-context.ts, shell/toasts.svelte.ts/ToastHost.svelte, routes/+layout.svelte, routes/c/[type]/+page.svelte, routes/c/[type]/[id]/+page.svelte, es/en y tests correspondientes. RevisionsSettings/settings solo si añadir destino navegable requiriese un id estable; título ya tiene id, basta anchor existente. No tocar transferencia ni namespaces list.import del otro escritor. Inventario definitivo al preparar worktree; no imponer máximo3–6 que ocultaría conexiones necesarias.

Reconciliación 2026-10-07 solicitada por raíz: eliminada selección/detalle/extracción restore; fecha solo del get real; list exactrevisionId+kind debe devolver entrada; Ajustes intactos. A final es la única implementación autorizada.

Freeze coherente tras headless: plate-proof terminal0, cuatro combinaciones, cero pageErrors/overflow y 16 capturas; ratio mínimo5.91:1. Inspección visual móvil oscuro oferta y escritorio claro acceso a papelera correcta. Navegador cerrado. El propio gate de implementación aún no se ha ejecutado.

Implementación A candidata: base4d9f891, árbol8b46b95, 22 paths (15 fuentes, 6 tests y fixture), check/lint/format exit0, 119/119 focal. Lámina acreditada; navegador de implementación y gate conjunto pendientes. Recibo canónico receipt.json.

Candidato final A e0adf413: revisión22/22+deltas cerrada; check0/0, estáticos22paths exit0,119/119 focal y navegador real4casos terminal0 sinpageErrors/overflow. Browser-attempt4 y receipt.json acreditan árbol exacto. Gate conjunto de raíz pendiente; no build/PocketBase vivo/QA física.

Evidencia corregida de modos: browser-attempt5 reemplaza afirmación dark de3/4; preferencias reales persistentes y colores computados antescaptura,4/4 sinerror/overflow y claro≠oscuro acreditado. Fuentee0ad intacta.
