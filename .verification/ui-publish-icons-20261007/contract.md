# Publicar desde el formulario e iconos

Base privada: 9ae8b57c3297f1c32b6f22a3d66a17a78579383b. Worktree: /private/tmp/vegacms-ui-publish-icons-20261007. Tareas: 566da926-e10f-4c9c-b281-c5cf34f7623b, bbc42d52-501d-4b81-8dfd-c39f89805603, c46a0999-fc61-43d3-8fa6-81b789f24176. No adjuntos. Owner invitado; raíz integra y certifica candidato conjunto.

## Comportamiento

- Pantalla normal de formulario de edición (no modal), para cualquier registro existente con statusField escribible y permiso update; sin exigir type.page: control de publicación junto a Guardar. Creación mantiene Guardar → abrir registro; los modales de relación no añaden publicación.
- Reutilizar VisualPublishControl: permisos, estado confirmado, revisión en vivo, confirmación única de avisos/bloques sin guardar, accesibilidad y mensajes de estado. Avisos no bloquean. No se autoguardan bloques ni se reconstruye el sitio.
- Si los campos del registro cambiaron: guardar primero por save/sendRecord existente, incluida validación, versión esperada, redirecciones, afterSave e historial. No avisar al padre ni navegar entre pasos. Solo tras éxito escribir el cambio de estado con la versión recién confirmada. Si no cambiaron, solo escribir estado. El reintento tras fallo de estado no vuelve a escribir contenido ya guardado.
- Fallo del primer paso: sin cambio de estado; conservar errores/foco/conflicto habituales. Fallo del segundo: contenido ya guardado, estado confirmado anterior y error habitual. No fabricar una revisión garantizada: se conserva el intento de snapshot de la capa existente.
- Un lock abarca ambos pasos: bloqueo de edición/Guardar/duplicado/publicación y cancelación de navegación mientras se escribe. Guardado correcto avisa al padre una sola vez al final, conservando notas de afterSave y mensaje de estado. La etiqueta sigue el estado confirmado del servidor. Estado readonly impide ofrecer publicación; publishAt readonly resuelve null (no capacidad de programación): no acción vencida ni limpieza de esa fecha arbitraria; Estado escribible conserva publicación normal. Un backend que no confirme el estado solicitado produce error, nunca un aviso de publicación exitosa.
- La acción «Publicar ahora» de programación vencida usa la misma revisión y operación. El editor visual mantiene comportamiento sin delegado.
- Set SVG local: link (cadena), publish (cohete). Sustituir emoji de enlace en barra richtext/Markdown y upload solo en publicación del shell. Upload de ficheros permanece. SVG decorativo con labels de botones existentes.

## Diseño y verificación

Lámina previa en esta carpeta, basada en tokens/CSS reales del formulario y VisualPublishControl, no nuevos tokens. 7 ejes: tokens cubierto; componentes/estados cubierto; responsive parcial hasta capturas; a11y parcial hasta foco/teclado y navegador; contenido/casos límite cubierto (registro largo, errores y bloques pendientes); feedback cubierto; assets cubierto (SVG propio). No se atribuye una decisión técnica a David.

Pruebas dirigidas: contenido sucio → dos escrituras ordenadas/versiones; cliente/backend/conflicto → nunca publicar; fallo de estado → contenido conservado y reintento solo status; lock durante promesas/navegación; limpio → una escritura; permisos/sin estado/creación; confirmación de revisión/bloques; iconos. Reutilizar suites de VisualPublishControl, revisión/formulario, programación e iconset; check/lint de paths; navegador mínimo con slot global concedido. No gate full individual, backend ni despliegue. Node22/deps existentes, sin instalación, presupuesto preparación <=0.5 GiB; df inicial 127 GiB compartidos.
