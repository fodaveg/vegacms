# Ampliación de P7 para Inicio v2 (20 de octubre de 2026)

Este documento amplía el vocabulario cerrado de P7 para la interfaz elegida en
`design/mockups/2026-10-20-inicio-profesional/inicio-v2.html`. Conserva el modelo de temas
empaquetados, sus tres ejes ortogonales y el gate AA medido. La implementación del generador,
`theme-tokens.ts` y los tests debe coincidir con estas reglas.

## Roles nuevos

- Tipo: `--display` usa Bricolage Grotesque, `--sans` Geist y `--mono` Geist Mono,
  autoalojadas con fallback local. Ningún tema modifica estas familias.
- Forma y ritmo: `--r-sm` (10 px), `--r-md` (16 px), `--r-lg` (22 px), `--r-pill`
  (999 px); `--fs-12/13/14/15/17/22/28/36/44` y `--sp-1/2/3/4/5/6/8/10/12`
  equivalen a 4, 8, 12, 16, 20, 24, 32, 40 y 48 px en la escala de espacios.
  Son roles globales, independientes de tema y modo. En densidad compacta cambian
  solo las dimensiones que el contrato de densidad declare.
- Elevación: `--shadow-raised` y `--shadow-brand` complementan `--shadow-card`;
  cambian con el modo, y la sombra de marca toma el acento del tema. `--glass`
  deriva de la superficie del tema al 72 % de opacidad; el componente aplica blur.
- Editor: `--v-ol-select` (fondo de selección, el acento), `--v-ol-select-ink` (texto
  encima), `--v-ol-hover` (hover de bloque, acento al 55 %), `--v-ol-inline` (contorno y
  cursor de edición en línea), `--v-ol-inline-text` (texto activo), `--v-ol-inline-soft`
  (fondo tenue, opaco sobre `--paper`) y `--v-stage` (escenario).
  - La edición en línea tiene un color PROPIO, no derivado de la marca: naranja
    (#e8562a contorno y #bf3f14 texto en claro, #ff7a4d en oscuro, valores de
    `edicion-en-vivo.html`). Si el acento del tema ya es cálido (a menos de 45° de matiz
    OKLCH del naranja: brasa, faro, rescoldo, halloween, aquelarre, terracota, cereza,
    miel) usa el violeta alternativo, para que seleccionar y escribir nunca compartan
    color. Nunca usa warning. El generador oscurece el texto hacia la tinta del modo, en
    pasos del 2 %, solo lo justo para que sea AA en cada tema; el umbral no baja.
  - `--v-stage` es el fondo de la app con un velo de tinta (6 % en claro, 3 % en oscuro):
    en claro es más oscuro que `--bg`, como el #e6e8ee sobre #f3f4f7 de la lámina; en
    oscuro queda un punto por encima del fondo (#101318 sobre #0c0e12 en la lámina). No es
    `--paper`: el sitio es una hoja sobre el escenario.
- Tema por defecto: `niebla` (FALLBACK_THEME) adopta la paleta de la lámina: acento
  #4c4ad9, neutros fríos de `inicio-v2.html` por modo, degradado de marca #4c4ad9 → #6a5ae0
  en `--accent-grad` enrutado a `--accent-fill`, y `--accent-text` por modo (#4441cf en
  claro, #9b9ffc en oscuro) mediante el override nuevo `modes.<modo>.accentText`. El resto
  de temas conserva su identidad; la tarjeta de marca y Publicar consumen `--accent-fill`,
  que es el degradado donde el tema lo declara y el acento sólido donde no (contrato del
  esquema: `effects` ausente equivale al acento sólido).

Los pares de texto nuevos (`--v-ol-select-ink` sobre `--v-ol-select` y
`--v-ol-inline-text` sobre `--v-ol-inline-soft`, `--v-stage`, `--paper` y `--surface`)
entran en `COMPONENT_CONTRAST_PAIRS` con mínimo 4.5:1 para cada tema y modo; el contorno
`--v-ol-inline` entra en `COMPONENT_GRAPHIC_PAIRS` con 3:1 sobre `--paper` y `--surface`
(WCAG 1.4.11). Ningún componente declara valores de color crudos. Los artefactos CSS y TS
se regeneran desde el generador y siguen sujetos al checker de cobertura.

Inicio usa los datos y permisos reales del modelo, el puerto y la sesión. El estado
«cambios sin publicar» solo aparece cuando se conoce el estado del build; publicar
reutiliza el flujo de la barra y nunca afirma que haya guardado un borrador.
