# Escritorio 1280 + Ajustar — revisión independiente

**Veredicto: listo para merge. Sin hallazgos pendientes.** Árbol final `08872fff27dd3d0a363049e6f2017b4132bb01a2`, nueve archivos revisados. La ejecución E2E/navegador del candidato integrado sigue pendiente del gate de raíz y no se sustituye con esta revisión.

## Hallazgo

🔴 **P2 — el test consumidor existente conserva desktop medido/default100.** `src/lib/visual/VisualEditorScreen.svelte.test.ts:2058` y `:2073`. El caso de zoom mide canvas700×500 y exige stage.width700px y scale(1); el candidato produce ancho CSS1280 y fit700/1280. Tras zoom50 vuelve a exigir700px. Focal3/31 no incluye esta suite, por lo que el test fallará en el gate completo aunque el producto cumpla el nuevo contrato. Se descubrió al revisar las expectativas directas adicionales, tras grafo sin matches y lectura del bloque2032–2076; no se ejecutó test desde review.

**P2 cerrado.** Delta consumidor inventariado y leído completo, **1/1 archivo** entre41c150 y08872; total **9/9**. El autor aísla localStorage por caso y actualiza las expectativas a ancho1280, fit700/1280 y altura500/factor; zoom50 mantiene1280; volver a Ajustar y resize a900 comprueban escala900/1280 y altura correspondiente. Persiste el literal fit, sin convertir la medida calculada en preferencia. Los casos mobile/tablet vecinos permanecen intactos. No se aflojan las comprobaciones del contrato. Index coincide con08872, sin cambios unstaged.

## Inventario y candidato

WT `/private/tmp/vegacms-visual-desktop-20261007`, rama `codex/visual-desktop-20261007`, base/HEAD `51de23c9a7375649e8992b27d14b5fe51217d607`, FREEZE staged `41c1505cf01da37a48879d5d4925a97533cd1e45`. Index coincide y no hay cambios unstaged. Inventario git diff --stat/--name-status y lectura íntegra por bloques: **8/8 archivos**, 279 inserciones y 48 eliminaciones.

Paths: docs/PROJECT-CONTRACT-v1.md; e2e/visual-editor.spec.ts; AppShell.svelte y su nuevo test; VisualEditorScreen.svelte; viewport.ts y test; viewport-storage.dom.test.ts. No código de bridge, overlay, inspector, árbol, columnas ni almacenamiento global cambiado por otro dueño.

## Contrato y contexto comprobado

Contrato de propuesta leído completo antes del diff; comparación HTML leída en su representación legible de medidas/contenido y CSS propio, sin volcar el CSS generado incrustado ni considerarlo prueba runtime. La cláusula normativa añadida reconcilia 1280 CSS con fit físico y describe temporalidad de sidebar; no inventa una aceptación humana. Se verificó la cláusula vecina del bridge: rect relativo al viewport del iframe, Vega aplica offset/zoom, protocolo intacto.

Grafo `vegacms-visual-desktop-20261007` primero para cálculo de escala, storage, preferencias de sidebar y consumidores. El índice se creó antes del cambio: el snippet de resolveZoomFactor salió recortado; se completó el símbolo y los vecinos directamente en el checkout. trace_path no incluyó el consumidor Svelte, por lo que se verificaron los usos acotados de frameWidthFor: solo VisualEditorScreen y tests, actualizados al nuevo signature. Sin reindex.

frameWidthFor fija mobile390/tablet834/desktop1280. Cambia DEFAULT_ZOOM a fit solo como fallback para preferencias nuevas; read/sanitize y storage conservan 50/75/100/fit válidos existentes sin migración/escritura silenciosa. Elegir preset no sobrescribe zoom. resolveZoomFactor conserva límites defensivos [0.1,1] y valores finitos para canvas0/NaN; nunca amplía sobre1. El escenario mantiene stageHeight=canvasHeight/factor.

Se revisó el ResizeObserver y marcado/CSS vecino de VisualEditorScreen: mide canvas físico, iframe y VisualOverlay siguen hijos del mismo stage con transform-origin top left. El viewport CSS fijo y la escala física se separan sin transformar rects del bridge ni modificar selección/resizer/atajos. El observador reacciona a ancho/alto reales al plegar sidebar o redimensionar; no compensa medidas con CSS del sitio.

AppShell sigue único dueño: manualSidebarCollapsed lee la preferencia anterior; entrar en route.id visual pliega en memoria sin setSidebarCollapsed. El toggle manual actualiza preferencia y estado por el mecanismo existente. Navegar entre registros de la misma ruta conserva apertura manual; salir restaura la última preferencia manual; volver a entrar inicia plegado temporal nuevo. sidebarOpen del drawer móvil sigue separado y cierra tras navegar como antes. No store/evento extra ni escritura desde editor.

Tests del diff leídos completos: AppShell entry/exit con ambos valores previos, toggle persistido y navegación entre visuales, drawer/inert separados; storage conserva zooms; viewport/default/fit0/NaN. Se revisó además el consumidor existente VisualEditorScreen y se cerró el P2 anterior mediante el delta consumidor. El E2E nuevo usa un sitio cross-origin, innerWidth/mediaquery propios, bbox real de bloque/overlay, canvas vs iframe pintado y resize1440→1200. Cubre mobile390/tablet834 como presets, zoom50 conservado al volver a desktop, fit, y ventanas físicas834/390 en el modo Solo textos existente. El E2E está preparado, todavía no ejecutado por este agente/autor.

## Evidencia y límites

Receipt del autor leído, árbol41c1505, argv/cwd/Node22.22.3 y session37610 terminal0: **3 archivos/31 tests**. focal-final.log confirma31/31. Formato/ESLint/diffcheck0 del autor acreditados sobre los mismos blobs, con patch byte-idéntico tras rebase. No se declara typecheck/build/E2E completo por esos resultados.

Receipt final leído sobre08872, base51de23 y nueve blobs explícitos: **4 archivos/96 tests**, session9537 terminal0. focal-consumers-final.log confirma96/96 e incluye VisualEditorScreen.svelte.test.ts; static-final.log acredita Prettier nueve paths, ESLint ocho fuentes/tests y diffcheck exit0. Se reutiliza evidencia del autor del mismo árbol; no se ejecutó ninguna suite adicional desde revisión.

Siete ejes: tokens/componentes/estados/casos límite/feedback cubiertos; assets nuevos no aplicables. Responsive/a11y parciales hasta prueba runtime, conservando etiquetas/teclado y la prueba de estado AppShell. La comparación de diseño no acredita editor montado ni integración del starter real. No ejecuté suite, navegador, build, instalación, reindex ni edité fuentes; full gate y E2E del candidato conjunto pertenecen a raíz. Sin backend real, QA física, push ni deploy acreditados aquí.
