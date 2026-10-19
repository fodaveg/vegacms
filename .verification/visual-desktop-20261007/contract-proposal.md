# Escritorio real en el editor visual

Tarea c0d0ff6e-43a9-46c8-b66a-e0a4a57921d5, leída fresca el 7 oct; sin notas ni decisiones reservadas. Base de análisis 4d9f891, árbol ea4a5451. Grafo primero: viewport.frameWidthFor/resolveZoomFactor, VisualEditorScreen y AppShell; consumers localizados. No fuentes cambiadas ni prueba de navegador ejecutada por este documento.

La tarea posterior recomienda 1280px y Ajustar: con un canvas425px el modo actual Escritorio provoca CSS móvil. El comentario antiguo implementa «llenar el lienzo» igualando viewportCSS y anchofísico. Se reconcilia ese objetivo manteniendo el ajuste al espacio físico pero separando la medida CSS: escritorio1280px, transformfit en el canvas; móvil390 y tablet834 siguen iguales. El puente conserva rectángulos relativos al iframe y Vega aplica escala, según PROJECT-CONTRACT-v1; ningún cambio de protocolo. No hay decisión humana explícita localizada que impida esta precisión técnica; no atribuir a David una aceptación nueva.

## Decisión técnica propuesta para implementación del lote

- Desktop fija viewportCSS1280px; inicialización medida0 no causa NaN ni Infinity. Ajustar=canvas/1280 con límites defensivos vigentes, nunca amplía sobre1. Alto sigue calculado para llenar el canvas. No compensar ancho tocando CSS del sitio.
- Preferencia nueva por defecto desktop+fit. Preferencias válidas ya guardadas (50/75/100/fit) se conservan: no migración silenciosa que borre elección. El control existente Ajustar permite adaptar inmediatamente una elección previa. Al elegir Escritorio no sobrescribir el zoom que el usuario acaba de elegir; no recalcular la preferencia como porcentaje persistido.
- Al entrar en la ruta del editor visual se pliega la barra global de escritorio usando el único estado dueño en AppShell. El plegado automático no persiste como preferencia global. El usuario puede volver a abrirla con el control existente; su toggle manual conserva el mecanismo de persistencia anterior. Al salir, se restaura la preferencia manual vigente. El drawer móvil sigue independiente y el afterNavigate lo cierra como hoy. No evento global, store duplicado ni escritura desde VisualEditorScreen a localStorage de sidebar.
- No plegar árbol ni inspector, no ocultar contenido ni modificar restricciones de anchura de columnas, breakpoint móvil, canvas overlay, selección, drag/resizer, zoom de teclado o bridge. Actualizar comentarios/contratos de medida afectados para que no afirmen desktop medido.

## Verificación y diseño

Antes de escribir código, el especialista prepara comparación concreta de canvas425 con iframeCSS425 frente a iframeCSS1280 escalado; usa tokens/componentes del candidato, contenido real de la demo y etiqueta ambas medidas. Una lámina no acredita runtime. Siete ejes: tokens existentes cubierto; componentes/estados cubierto por controles existentes y carga; responsive pendiente prueba real1440 y ventana estrecha; accesibilidad conservar teclado/labels/foco, pendiente captura; contenido/casoslímite incluye viewport0/NaN y preferenciasprevias; feedback conserva estado y no oculta errores de bridge; assets nuevos no aplicable.

Tests pertinentes: viewport puro y storage existente; componente AppShell entrada/salida/togglemanual/drawermóvil; editor real con sitio de fixture que cambie mediaquery y notifique innerWidth, selección overlay alineada trasfit/zoom y resize. En ventana1440 el sitio ve1280 aunque canvasseaestrecho; cambiar a móvil390/tablet834 sigue disparando CSS correspondientes. No nueva suite/preflight/dependencias; checks rápidos y focales existentes, un gate root del candidato integrado cuando corresponda.

Ownership previsto: viewport.ts/tests, comentarios y tests afectados VisualEditorScreen/viewportstorage, AppShell y tests, documentación normativa solo cláusula real aplicable. No layout/+page de historial ni import/list.import. Rama/worktree propios. Implementación todavía no despachada; no cambia tags ni publica.
