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

El cálculo resuelve la mezcla a sRGB de 8 bits como hace el motor actual. **No es una medición de estilos computados en navegador ni una certificación de toda la app.** No se han medido otros tokens, estados con opacidad, gradientes, foco o lectores de pantalla. Capturas headless y contraste en navegador quedan pendientes de coordinar el runner con la sesión principal.

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

| Eje                       | Estado de esta propuesta    | Evidencia y límite                                                                                                                             |
| ------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Tokens                    | Cubierto                    | Dos valores existentes; sin nuevo vocabulario; 21 temas medidos.                                                                               |
| Componentes y estados     | Parcial                     | Vacío, normal y error representados; hover/active/disabled/loading no certificados en app.                                                     |
| Responsive por componente | Parcial                     | Mockups preparados para 390/1440; rail colapsable, texto largo envuelve; captura y QA pendientes.                                              |
| Accesibilidad             | Parcial                     | 210 pares por variante calculados; controles de lámina etiquetados y ≥44 px, foco explícito; sin auditoría general ni medición de navegador.   |
| Contenido real y límites  | Cubierto dentro del alcance | Copia del diccionario real, vacío y ayuda larga; sin cifras inventadas. Tablas con muchos registros no son necesarias para decidir este token. |
| Feedback                  | Parcial                     | Error estático real y botón de reintento; no se simulan peticiones ni se verifica recuperación de red.                                         |
| Assets                    | No aplicable                | No se proponen iconos, imágenes ni identidad nueva.                                                                                            |

## Reproducir

Desde la raíz del checkout baseline con las dependencias ya disponibles:

```sh
node design/mockups/2026-10-07-contraste-ink-2/generate.mjs
```

`generate.mjs` es una sonda de diseño, no un preflight ni un test de producto. Escribe únicamente este directorio. Los `.html.tpl` y `mockup.css` son la fuente; los HTML y JSON son artefactos regenerables del mismo baseline. La lámina final es autocontenida para abrirla sin servidor; los enlaces a HTML individuales requieren conservar la carpeta.

Pendientes para cerrar la decisión: inspección visual coordinada, elección de David y, solo tras aprobar, implementación y gates del candidato de producto.
