# Caddy: refresh de procedencia del lector reducido

Veredicto: **APTO estático del delta como propuesta de consentimiento**, sin must-fix identificado. **Ejecución todavía bloqueada**: el rechazo previo a valores potencialmente secretos sigue vigente hasta consentimiento explícito del usuario y aprobación runtime nueva. El informe no concede acceso ni valida servido.

## Sello y revisión

OperationId `a5119316-b809-4d9c-98e0-4a1e06ed3dda`.

- Manifest `609ed93476d50e648ac228c09236c5a1627695b5d40baa847bbeadb75f76cc92`.
- Remote `9c30f9900df46802170829fbfc2a8878fff95e0752717a04c742ed0509661ceb`.
- Wrapper `b9d5af35e778270624ec7b214ff0a23d4531b8947af815a3eb4eabe661608b05`.
- Probe `ae7189726378fbbe7e65fb9ffd26ee3f30b604b74b4ccbbbdb8fae72067b3279`.
- Propuesta `126ece761ba3837e04e39a05ad10c6dfec81aa20a8339bd345b7d6c82c8fa9a8`.

Inventario stat/name-status frente al lector precedente8e09af37/wrapper05edebe9; lectura de cada delta ejecutable, manifiesto/documentación/tests y contexto provenance/guards/wrapper/projection. Los ocho hashes del manifiesto coinciden. Patch-inputs y projection no cambiaron; su contenido se comprobó y la revisión anterior de expansión/imports/aislamiento se reutilizó. Probe.log cambia sólo duración y conserva20tests OK del owner, sin repetirlos. La ausencia del rejection.json en el nuevo directorio es diferencia del inventario entre directorios, no borrado del rechazo original, que permanece en el worktree precedente. Sin SSH, Docker, builds ni creación de approval/marker por el revisor.

## Delta e invariantes

El reader exige ahora los cuatro hashes Compose actuales y Caddy fixedID. Los tres consumidores sólo se consultan mediante Id/Name/Image y deben igualar sus tuples literales; esos mismos guards se revalidan al concluir. Caddy conserva los campos seleccionados anteriores, PID1 exacto y correspondencia de imagen. No se introduce Config.Env ni inventario de entorno.

Vega usa container007b/OCI dd978 con Compose11593; Lumbre377485/OCI40df con Compose56caa. Fod exige container6bdd e imagen **OLD0e0e**, ComposeBASEa187: la candidata22cf está cargada, no adoptada. El negativo añadido simula22cf como imagen seleccionada y exige STOP antes de consultar valores; también cubre deriva de ID de Caddy o consumidor. Estas constantes coinciden con la evidencia vigente aportada por root, pero sólo una ejecución futura puede probar metadata fresca.

El scope del wrapper incluye cuatro Caddyfiles conocidos, imports .caddy cerrados en /srv/edge/conf.d y cuatro Compose sólo para hashes. Mantiene una consulta por nombre expresamente referenciado, valores y material expandido privados en RAM, sin exportar nombres/valores/errores privados o hashes derivados de secretos. Adapt/validate usan dos contenedores aislados de la misma imagen, sin red y con scratch tmpfs; no modifica configuración activa ni reinicia servicios. Los cambios de aislamiento, imports, unset/vacío y expansión son los ya revisados del antecedente, sin cambios en este delta.

## Alcance pendiente de autorización

La petición debe nombrar expresamente la lectura RAM de valores potencialmente secretos referenciados, no presentarla como metadata inocua ni como permiso ya concedido. Whole Caddy Env sigue rechazado; no se permite fallback, replay de grants consumidos o aprobación local usada como sustituto de consentimiento. Un execution-approval.json sólo registra una autorización real posterior y nueva que coincida con este manifest/scope/operationId. Sin ella, el wrapper termina sin conexiones ni marker.

El grant anterior y la pregunta sin respuesta no cubren esta operación. El rechazo debe conservarse si vuelve a producirse. La preparación no incluye el filtro79cb del logger default; tampoco acredita CSP/panel efectivo, logs reales, imagen Fod nueva o cierre de tareas. Incluso éxito remoto sería `VALIDATED_RESOURCE_TEST_COPY_NOT_LITERAL_PRODUCTION`, no adaptación literal ni servido de producción. Subsisten los STOP conservadores del lector anterior ante sintaxis/recursos/imports no soportados; no se amplía el parser para forzar un verde.
