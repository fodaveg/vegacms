# Actividad

`01-actividad.html` es la lámina previa de `/actividad`: filtros, lista por día, guardados
agrupados, importación desplegable y los estados vacío, sin resultados, error y no disponible.
Carga los tokens generados del repo. Se abre desde la raíz del repo o directamente como fichero.

Recorrido de los siete ejes de diseño:

- Tokens: cubierto; roles existentes, escala de 4 px, fuente del sistema. Las mediciones de
  contraste del candidato en navegador quedan en su recibo; no se introducen pares de color propios.
- Componentes y estados: cubierto; filtros con etiquetas, carga con esqueleto, error/reintento,
  vacío, sin resultados, no disponible y más resultados en curso.
- Responsive: cubierto en diseño; filtros envuelven, filas apilan hora, textos largos se parten,
  la lámina incluye breakpoint de 600 px. Medición móvil en e2e.
- Accesibilidad: cubierto en diseño; lista de contenido semántica, cabeceras por día, botones de
  al menos 44 px, foco visible, etiquetas, fechas con datetime, sin animaciones.
- Contenido real y extremos: cubierto; correos, borrado sin copia, múltiples guardados y racha de
  importación; id como respaldo de título, valores externos pintados como texto.
- Feedback del sistema: cubierto; estados explícitos y límite de cobertura del hook visible.
- Assets: no aplicable; iniciales tipográficas y el icono `update` ya empaquetado.

La lámina es documentación de implementación; las mediciones y capturas reales viven en el
recibo de verificación del candidato, fuera del worktree.
