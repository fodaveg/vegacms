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
- Editor: `--v-ol-select` (fondo de selección), `--v-ol-select-ink` (texto encima),
  `--v-ol-hover` (hover de bloque), `--v-ol-inline` (borde de edición),
  `--v-ol-inline-text` (texto activo), `--v-ol-inline-soft` (fondo de edición) y
  `--v-stage` (lienzo del sitio, derivado de `--paper`). Son derivados de los roles existentes de marca y
  superficie. Selección e inline tienen semánticas distintas; inline no usa warning.

Los pares de texto nuevos (`--v-ol-select-ink` sobre `--v-ol-select` y
`--v-ol-inline-text` sobre `--v-ol-inline-soft` y `--v-stage`) entran en
`COMPONENT_CONTRAST_PAIRS` con mínimo 4.5:1 para cada tema y modo. Ningún componente
declara valores de color crudos. Los artefactos CSS y TS se regeneran desde el
generador y siguen sujetos al checker de cobertura.

Inicio usa los datos y permisos reales del modelo, el puerto y la sesión. El estado
«cambios sin publicar» solo aparece cuando se conoce el estado del build; publicar
reutiliza el flujo de la barra y nunca afirma que haya guardado un borrador.
