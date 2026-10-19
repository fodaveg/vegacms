# L10 · Contraste del texto secundario

**Propuesta visual pendiente de aprobación de David.** Entrega de diseño; no modifica `src/`, el motor ni tokens de producto. Tarea: `7d91bb57-ed2f-475c-a90d-3bfbbae6364c`.

Abrir [la lámina comparativa](lamina.html). Incluye Niebla, Miel y Aquelarre, antes/después, dos pantallas ancla (Inicio y Ajustes), estado de error, modos claro/oscuro/sistema y viewports de 1440/390 px. Los seis HTML individuales permiten inspeccionar cada variante a tamaño natural; admiten `?mode=light&screen=settings` (pantallas `home`, `settings`, `error`).

## Dirección

**Evolución del sistema existente: sobria, legible, coherente.** La referencia es la propia cabina C2 de Vega. Los rótulos de sección sobre el lienzo y el texto secundario del rail pierden contraste antes que las ayudas sobre tarjeta. Oscurecer levemente su tinta común conserva el matiz del papel, la diferencia título/cuerpo/ayuda y la continuidad de la navegación. No hace falta aumentar pesos, tamaños o saturación para compensarlo.

Se propone mantener el vocabulario y la mezcla OKLab, modificando dos valores existentes. La composición visual sirve para juzgar la presencia global de la tinta, no para aprobar una reorganización de pantallas.

## Cambio propuesto

| Fuente existente                                                        | Actual    | Propuesta |
| ----------------------------------------------------------------------- | --------- | --------- |
| `scripts/build-themes.mjs` → `BASE_NEUTRALS.light['ink-2']`             | `#6a665e` | `#625e56` |
| `src/lib/themes/aquelarre.theme.json` → `modes.light.neutrals['ink-2']` | `#68625f` | `#605a57` |

El tinte de la tinta sigue siendo 5%. Aquelarre necesita el segundo ajuste porque su override final evita la base compartida. Las tres componentes sRGB de cada base bajan 8 niveles; se preserva la tendencia cromática. Una alternativa más ajustada (`#646058` y Aquelarre `#625c59`) da un mínimo de solo **4,50345:1**: se descarta como recomendación por su margen prácticamente nulo. La propuesta deja un margen de **0,14448** respecto a 4,5 en el peor par.

## Evidencia medida

Baseline real: `8a10f7f61da35a777b51d6cd8b3290e136660636`, 21 temas de `src/lib/themes/index.json`. Se usan las funciones puras existentes `resolveNeutral` y `contrastRatio`; la propuesta vive únicamente en memoria del proceso. [measurements.json](measurements.json) conserva colores y ratios completos antes/después para los dos modos.

| Modo   | Pares | Fallos actuales | Fallos propuestos | Mínimo actual | Mínimo propuesto |
| ------ | ----: | --------------: | ----------------: | ------------: | ---------------: |
| Claro  |   105 |              24 |                 0 |       4,10921 |          4,64448 |
| Oscuro |   105 |               0 |                 0 |       5,24818 |          5,24818 |

Cada conjunto cubre `ink-2` sobre `bg`, `sidebar`, `surface`, `paper` y `surface-2` en 21 temas. El mínimo propuesto claro es Aquelarre sobre `bg`. Los 105 resultados oscuros son idénticos entre variantes. Los fallos actuales se concentran en 21 pares sobre `bg` y 3 sobre `sidebar`.

| Tema de la lámina | Tinta final actual → propuesta | bg          | sidebar     | surface     |
| ----------------- | ------------------------------ | ----------- | ----------- | ----------- |
| Niebla            | `#696764` → `#615f5d`          | 4,36 → 4,92 | 4,52 → 5,10 | 5,44 → 6,13 |
| Miel              | `#6f695d` → `#676156`          | 4,32 → 4,87 | 4,51 → 5,08 | 5,32 → 5,99 |
| Aquelarre         | `#68625f` → `#605a57`          | 4,11 → 4,64 | 4,30 → 4,86 | 5,72 → 6,47 |

El cálculo resuelve la mezcla a sRGB de 8 bits como hace el motor actual. **La matriz completa procede del motor puro; la comprobación de estilos computados cubre los tres temas de la lámina. No es una certificación de toda la app.** No se han medido otros tokens, estados con opacidad, gradientes, foco o lectores de pantalla. Chromium headless 149.0.7827.55, ejecutado con Node 22.22.3, confirma estos ratios en Niebla, Miel y Aquelarre: diferencia máxima con el cálculo puro de 1,78 × 10⁻¹⁵ (precisión numérica). Los otros 18 temas conservan cobertura del motor puro; no se afirma medición de navegador para ellos.

## Fidelidad de los mockups

Se incrusta el CSS generado real del baseline, sin CDN ni fuentes remotas. `mockup.css` reproduce medidas y reglas de las fuentes siguientes; el contenedor de comparación y las composiciones HTML son específicos de esta revisión y no añaden tokens al producto:

- `src/lib/theme/base.css`: lienzo y rail de 236 px en densidad cómoda.
- `src/routes/+page.svelte`: título 1,3 rem, rótulo 0,76 em / 650 / espaciado 0,09 em en `ink-2`; tarjeta en `paper`.
- `src/routes/settings/+page.svelte`: Apariencia, etiquetas 0,85 rem en `ink-2`, tarjetas `surface-2` y ayudas secundarias.
- `src/lib/shell/Sidebar.svelte`: texto secundario sobre `sidebar`, navegación y breakpoint de 768 px.
- `src/lib/i18n/es.ts`: copias reales de estados vacíos, Ajustes/Apariencia, ayuda larga de Esquema y error de Ajustes. No se inventan registros, recuentos ni datos de dominio.

Las pantallas son **montajes estáticos declarados**, no reproducciones funcionales ni capturas QA. El estado de Inicio muestra la pieza de ediciones recientes vacía junto al rail vacío para comparar superficies; su coexistencia no afirma que ese estado sea alcanzable en runtime. Ajustes agrupa extractos relevantes para el color, no pretende replicar el editor completo. El menú móvil es una ayuda de inspección y no reproduce el focus trap del producto.

## Handoff mínimo

Tras aprobación: cambiar los dos valores fuente, regenerar los artefactos con el pipeline existente y ampliar su lista de pares para incluir `ink-2/bg` y `ink-2/sidebar`. El contrato P7 §5.3 enumera `paper/surface/surface-2`, y la ley general obliga AA también en los nuevos pares realmente usados: documentar explícitamente esta ampliación en el contrato antes de cerrar implementación. No añadir checker paralelo.

La propuesta afecta a todos los consumidores de `--ink-2` claro: navegación, rótulos, ayuda y metadatos; también donde hoy ya pasa AA. Revisar su peso visual conjunto, especialmente ayudas largas. Mantener la tinta principal, tipografía, radios, densidad, fondos, acentos y modo oscuro actuales. La aprobación de esta lámina no equivale a aprobación de cambios de layout.

En la composición, 1440 px mantiene rail lateral y el contenido de 60 rem máximo; 390 px oculta el rail, presenta botón de 44×44 y deja que ayudas/filas se partan sin truncar. El mockup no anima. En implementación se conservan las reglas responsive y focus management existentes; volver a comprobar claro/oscuro, foco, error, vacío y 390/1440 con el candidato real.

## Checklist de siete ejes

| Eje                       | Estado de esta propuesta    | Evidencia y límite                                                                                                                                                                            |
| ------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tokens                    | Cubierto                    | Dos valores existentes; sin nuevo vocabulario; 21 temas medidos.                                                                                                                              |
| Componentes y estados     | Parcial                     | Vacío, normal y error representados; hover/active/disabled/loading no certificados en app.                                                                                                    |
| Responsive por componente | Parcial                     | Capturas a 390/1440 sin overflow; rail colapsable y texto largo revisados; QA de la app pendiente.                                                                                            |
| Accesibilidad             | Parcial                     | 210 pares por variante calculados; controles de lámina etiquetados y ≥44 px, foco explícito; medición de navegador confirmada para los tres temas mostrados; sin auditoría general de la app. |
| Contenido real y límites  | Cubierto dentro del alcance | Copia del diccionario real, vacío y ayuda larga; sin cifras inventadas. Tablas con muchos registros no son necesarias para decidir este token.                                                |
| Feedback                  | Parcial                     | Error estático real y botón de reintento; no se simulan peticiones ni se verifica recuperación de red.                                                                                        |
| Assets                    | No aplicable                | No se proponen iconos, imágenes ni identidad nueva.                                                                                                                                           |

## Reproducir

Desde la raíz del checkout baseline con las dependencias ya disponibles:

```sh
node design/mockups/2026-10-07-contraste-ink-2/generate.mjs
```

`generate.mjs` es una sonda de diseño, no un preflight ni un test de producto. Escribe únicamente este directorio. Los `.html.tpl` y `mockup.css` son la fuente; los HTML y JSON son artefactos regenerables del mismo baseline. La lámina final es autocontenida para abrirla sin servidor; los enlaces a HTML individuales requieren conservar la carpeta.

Pendientes para cerrar la decisión: elección de David y, solo tras aprobar, implementación y gates del candidato de producto.

## Verificación de navegador de los mockups

62 PNG: 48 pantallas (3 temas × antes/después × claro/oscuro × 390/1440 × Inicio/Ajustes), 6 railes móviles, 4 estados de error y 4 láminas completas. La ejecución final pasó **247 comprobaciones, cero fallos y cero errores JS**. Tras actualizar únicamente la redacción del estado de la lámina, se refrescaron sus cuatro imágenes con **67 comprobaciones correctas**. Se comprobó también el modo sistema y su cambio en caliente.

La primera ejecución detectó 24 fallos: el override del mockup tenía menor especificidad que el CSS generado y la tinta propuesta no se aplicaba. Se corrigió el selector a `[data-theme="<id>"][data-mode="light"]`, se regeneró y se repitió la verificación. El registro rojo se conserva como evidencia; no se confundieron las mediciones puras con lo renderizado. Las capturas completas ajustan el viewport al alto de la lámina para que Chromium pinte también los iframes inferiores.

[Resumen y hashes](browser-summary.json) identifica fuentes, capturas y resultados. Los PNG e informes detallados se entregan fuera del repo en `/private/tmp/vega-l10-ink2-captures-20261007/`; esta ubicación es temporal y debe conservarse en el archivo de evidencia de la sesión principal. Las imágenes revisadas visualmente incluyen la lámina clara de escritorio, lámina oscura móvil, Ajustes Aquelarre claro móvil, su rail y la portada Miel oscura de escritorio.

Driver reproducible (solo con el runner de navegador libre):

```sh
~/.nvm/versions/node/v22.22.3/bin/node design/mockups/2026-10-07-contraste-ink-2/capture.mjs /ruta/de/evidencia
```

No inicia servidor, no construye, no instala, no abre ventanas y no conecta a PocketBase. Cierra contexto y navegador en `finally`. Todos los procesos de estas ejecuciones terminaron; recursos cerrados. Capturas y evidencia ocupan 3,5 MiB, bajo el presupuesto de 0,5 GiB. Disco libre al finalizar: 150 GiB (148 GiB al inicio; el delta es global y no se atribuye a una limpieza propia). Se conservan worktree, fuentes y evidencia para revisión.
