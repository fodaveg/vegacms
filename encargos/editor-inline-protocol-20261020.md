# Inline v2 — decisiones técnicas del encargo

Base CMS b01e9fe; Astro 59be7e4 (referencia local, frescura remota no verificable).
Análisis previo: architecture-analyst, 20 octubre 2026. Aplicar antes de implementar.

## Negociación

El sitio inicia con ready v1. CMS nuevo envía hello v1 con supportedProtocols
['vega-visual-2', 'vega-visual-1'] y sessionId, al menos una vez por carga incluso
si recibió ready v1 temprano. Solo con ese opt-in el sitio contesta ready v2.
CMS viejo + sitio nuevo y CMS nuevo + sitio viejo conservan v1 sin inline.
Una vez negociado v2, ignorar anuncios v1 tardíos hasta nueva carga.

## Campo y propietario

data-vega-field contiene nombre simple de campo del bloque más cercano, nunca rutas,
selectores ni HTML. El renderer real anota sus componentes: VegaBlocks no puede
inferir los campos del componente del consumidor. Anotar starter/fixture y documentar.
Solo nodos que representan texto plano y campos text/textarea visibles, editables,
no estructurales y con permisos. Resolver data/record desde el manifiesto.

BlockEditor conserva la propiedad de current/dataCurrent y la escritura por save().
Añadir API beginInline/updateInline/finishInline que reenvía VisualInspector.
Guardar valor inicial exacto, incluido null. Actualizar con los handlers existentes,
sin modificar directamente snapshots de blocks ni crear otro propietario del borrador.
Cancel restaura ese valor inicial; commit conserva el nuevo borrador sin persistir.
Inspector muestra «En la página» y bloquea un segundo escritor del mismo campo.

## Mensajes e identidad

select {blockId,field,intent:'edit'} pide entrada; CMS valida y devuelve editField
{sessionId,documentId,editId,collection,id,blockId,field,widget,value}.
Solo entonces el sitio habilita contenteditable plaintext-only.
input/commit/cancel llevan esa identidad y secuencia creciente; input/commit value:string.
Acuse de inicio (input secuencia 0) y plazo; un campo ausente cancela solo la interacción.
Validar origen Y source exacto, registro, bloque/campo y permisos antes de cada mutación.
Descartar sesión/documento/edición/secuencia obsoletos. No innerHTML para valores.

## Teclado, foco y refresco

Text: Enter confirma. Textarea: Enter inserta salto, Cmd/Ctrl+Enter confirma.
Escape cancela; composición IME no finaliza. Blur/cambiar campo conserva en borrador,
sin guardar. Cmd/Ctrl+S dentro del iframe transmite intención explícita que usa saveSelected.
Pegado/arrastre solo texto plano.

La vista previa existente debounces a 400ms y el sitio reemplaza DOM: no puede
continuar durante inline. Al empezar, invalidar peticiones/debounce/fallback pendientes
en CMS y sustitución pendiente en sitio. Posponer refresco/renovación mientras se escribe.
Al salir, refrescar una vez con el borrador actual. Correlacionar refresh/ready v2;
documentId identifica generación DOM y ready repetido del mismo documento no cancela.
Navegar/cargar iframe invalida la interacción pero conserva el último input recibido
en BlockEditor. Las guardas de navegación siguen anyDirty; no prometer persistencia
de borrador tras cerrar todo Vega.

## Normativa y verificación

Actualizar PROJECT-CONTRACT antes de código: excepción inline acotada a v2, transporte
del texto activo por puente, borrador completo sigue cifrado vía /token. Corregir Live
refresh que todavía habla solo de GET guardado aunque 0.13 ya admite POST de borrador.
No puente en páginas públicas ni previews compartidas; conservar allowlist y CSP.

Pruebas de compatibilidad v1/v2, campo data/record, null y claves huérfanas, permisos,
origen/source falsos, replay, refresco pendiente, cancel sobre borrador previo,
commit sin backend y guardar con expectedVersion. Navegador cross-origin real necesario
para caret, foco, IME, pegado, teclado y guardado/recarga; mocks no sustituyen esa prueba.
