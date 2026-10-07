# L13 · Compartir la vista previa guardada

Propuesta visual para revisión y presentación por la sesión raíz antes de implementar. Generar la lámina no constituye aprobación. Solo montaje HTML: no es la aplicación ni QA del backend.

- Base: `0cacf4cb8673369fcdec7b40ea676277cec5c331`.
- Entrada autocontenida: `lamina.html`; anclas `01-enlaces.html`, `02-crear.html`, `03-copiar.html`.
- Reproducir: Node 22, dependencias existentes, `node design/mockups/2026-10-07-preview-compartida/generate.mjs`.
- Owner: únicamente este directorio. No cambia `src/`, permisos, contrato ni backend.

## Dirección y fuentes

Evolución del sistema Vega: sobria, legible y explícita. Referencia directa: `AdminDialog.svelte` y `src/lib/admin/admin.css`, con los colores vigentes de `themes.generated.css` (incluida tinta secundaria aprobada). El diálogo de 26rem contiene una tarea cada vez; la dirección de un solo uso tiene la máxima jerarquía tras crear. No se añade un sistema visual paralelo. La barra superior y el editor de fondo son un montaje simplificado, declarado como tal.

Fuentes funcionales: sección Share links de `docs/PROJECT-CONTRACT-v1.md`, `src/lib/backend/preview-share-client.ts`, toolbar de `RecordForm.svelte`, fixture `demo-seed.ts` con página «Sobre mí», `/sobre-mi`. Fechas y etiqueta Ana (client) proceden del ejemplo de contrato; el reloj de creación de la simulación es 7 oct 2026 10:00 Europe/Madrid. Las etiquetas largas son contenido de prueba, no datos de un cliente. La URL `.test` es sintética y no abre ni crea un recurso.

## Contrato UX para implementación

1. Acción en toolbar junto a preview: solo registro persistido, `preview.share` disponible y permiso de editar. El backend vuelve a autorizar view + update. No inferir seguridad por visibilidad. Sin permiso, nuevo y feature ausente se muestran en el selector del laboratorio; el producto simplemente no ofrece la acción. El texto explicativo de esos estados en el fondo documenta la causa para la revisión.
2. Abrir con cambios sin guardar está permitido. Aviso persistente: comparte lo guardado, nunca autosave ni borradores; cada guardado posterior cambia lo que verá la siguiente visita. No se altera el formulario padre ni su dirty guard.
3. GET es lista de enlaces vivos, orden descendente por creación. La fila muestra etiqueta opcional (fallback Sin etiqueta / No label), fechas legibles con zona, estado textual y Anular. Nunca botón de copiar o reconstrucción de URL. El estado Caducado solo representa el instante de caducidad mientras el diálogo seguía abierto; al releer desaparece. Tras revoke 204, quitar fila y mostrar confirmación local; sin historial persistente ni DTO nuevo. Al reabrir, GET fresco.
4. Crear usa etiqueta opcional de máximo 120 caracteres, texto plano recortado; duración inicial 1 día, cantidad entera y unidad segundos/minutos/horas/días. Conversión a entero de segundos >0 y <=2592000. Ningún mínimo 300s anunciado o impuesto: límites reales del servidor pueden variar; 400 conserva valores y muestra error sin ajustarlos. `expiresAt` de respuesta manda sobre la estimación local. La simulación calcula un fixture para representarlo.
5. Éxito: URL opaca sin analizar/modificar, textarea solo lectura seleccionable, botón Copiar. En producto, usar clipboard y confirmar únicamente tras éxito; si falla, mantener URL y dar instrucción para copia manual. En mockup el botón solo simula confirmación, no toca el portapapeles. Dirección y copia permanecen exclusivamente en memoria del diálogo. No storage, toast, URL de ruta ni logs con secretos. Cerrar sin copiar pide confirmación; volver conserva URL. Cerrar después de copiar o confirmar pérdida borra memoria y DOM de la dirección; el enlace sigue activo. Al reabrir nunca recupera la dirección.
6. Anular usa la misma superficie de diálogo, etiqueta y advertencia irreversible; Cancelar recibe foco inicial. Confirmar elimina la fila tras 204; error conserva fila y permite reintentar. El backend es idempotente. No navegación ni borrado de página.
7. Carga de lista bloquea creación hasta obtener un estado fiable; error no parece una lista vacía. Durante creación/anulación se bloquea envío repetido y cierre por botón/Escape, se conserva foco y `aria-busy`. Un 409 de límite 20 exige anular uno, no reintento automático. Error de red ambiguo no reenvía POST: consultar lista fresca; si la creación ocurrió sin recibir la URL, anular y crear otro. Un resultado tardío tras desmontaje no debe exponer secreto fuera del diálogo.
8. Foco: apertura al primer control útil, Tab encerrado, Escape equivalente al cierre y retorno al disparador. Cambiar subvista orienta con título anunciado, cancelar anulación vuelve a la fila. En aplicación, reutilizar AdminDialog y adaptar su cierre condicionado, sin crear otro gestor modal.

## Responsive y estados

Tres anclas contienen selectores de laboratorio de tema (Niebla, Miel, Aquelarre), modo claro/oscuro/sistema, ES/EN y estados. El laboratorio no forma parte del producto. 390px conserva márgenes 16px, modal 26rem máximo, scroll interno con altura máxima viewport menos 32px, botones apilados y objetivos 44px. En 1440px el diálogo mantiene su medida y contexto alrededor. Texto largo envuelve sin truncar; URL se selecciona completa. Etiqueta de formulario sigue el input existente y desplazamiento interno horizontal.

Estados representados: lista activa/vacía/error/cargando; cambios sin guardar; etiqueta larga; duración rechazada; creación incierta/ocupada; enlace recién creado; confirmación de cierre y de anulación; caducidad y anulación transitorias; no permiso/nuevo/sin capacidad. El selector no es una réplica completa de todas las respuestas backend. Revocación fallida, 401/403/404/409/503, clipboard denegado, reloj real y respuestas concurrentes quedan especificados aquí para implementación y sus tests.

## Checklist de siete ejes

| Eje                       | Estado               | Evidencia / límite                                                                                                     |
| ------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Tokens                    | Cubierto             | CSS vigente incrustado sin cambios; semánticos papel/tinta/acento/error/aviso/éxito.                                   |
| Componentes y estados     | Cubierto para diseño | AdminDialog, botones, campos, ayudas y confirmación existentes; estados y límites descritos arriba.                    |
| Responsive por componente | Cubierto para diseño | Modal 26rem, 390/1440, botones 44px, wrap y scroll; capturas en recibo.                                                |
| Accesibilidad             | Parcial              | Roles, labels, foco, Escape, reduced-motion y contraste computado; no lector de pantalla físico ni auditoría integral. |
| Contenido real y límites  | Cubierto             | Página fixture, fechas de contrato, ES/EN, etiqueta larga, vacío y pérdida de URL.                                     |
| Feedback                  | Cubierto para diseño | Busy, inline error reteniendo valores, éxito local y confirmaciones; no red real.                                      |
| Assets                    | No aplicable         | Sin imágenes, fuentes remotas ni CDN. Tipografía del sistema.                                                          |

## Verificación y límites

`capture.mjs` es un driver del mockup, no suite de producto; solo Node22 y Playwright ya instalados. Genera capturas y mediciones locales con recursos cerrados en `finally`. `browser-summary.json` registra resultados y rutas del artefacto externo. Se valida regeneración exacta de los cuatro HTML. El recibo externo identifica árbol/commit y hashes; las capturas conservan URL sintética, nunca secretos reales.

No acredita integración Svelte, autorización PocketBase, transporte HTTP, resolución del sitio, caducidad/revocación reales, lectores de pantalla ni clipboard del SO. No build, instalación, servidor web ni QA de la aplicación. La raíz conserva la decisión técnica y la presentación de la lámina.
