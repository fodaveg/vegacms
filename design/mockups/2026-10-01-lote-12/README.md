# Lote 12 «Mejoras de UX»: láminas

Ocho láminas para ver ANTES de construir nada. Modo componente: el sistema de diseño de Vega
(tema Aquelarre, claro y oscuro) se aplica tal cual; cada «después» cambia solo lo que su mejora
pide. Aquí no hay código de producto: nada de esto toca `src/`.

Medido al empezar: rama `design/l12-laminas` desde `main` en `8291a9c`.

## Cómo se montan y se capturan

```sh
node design/mockups/2026-10-01-lote-12/build.mjs      # fuente/*.html -> *.html autocontenidos
node design/mockups/2026-10-01-lote-12/capturar.mjs   # capturas/ (390 y 1440 px, claro y oscuro)
```

- `fuente/NN-*.html` es lo que se edita. Las láminas de la raíz de la carpeta son salida del
  montaje: no se editan a mano.
- `build.mjs` copia en cada montaje el CSS REAL: los temas generados, `base.css`, `admin.css`, el
  `<style>` de cada componente que aparece y los trazos de `Icon.svelte`. Si el producto cambia,
  volver a montar actualiza el «antes».
- `fuente/lamina.css` tiene dos partes: el cromo de la lámina (no es producto) y las
  composiciones propuestas (lo que el implementer lleva a Svelte).
- `capturar.mjs` corre siempre en headless y avisa de cualquier desbordamiento horizontal.
  `capturas/` no se versiona (ver `.gitignore`).
- Cada lámina se abre también en el navegador: lleva botones Claro y Oscuro y un selector con los
  21 temas.

## Las láminas

| N.º | Lámina                                | Qué propone                                                                |
| --- | ------------------------------------- | -------------------------------------------------------------------------- |
| 1   | `01-portada.html`                     | Portada con accesos a crear y «Lo último que editaste»                     |
| 2   | `02-programar-publicacion.html`       | Botón «Programar…» junto al campo Estado, con diálogo                      |
| 3   | `03-densidad-al-menu-de-cuenta.html`  | Cómoda y Compacta pasan al menú de cuenta                                  |
| 4   | `04-titulo-que-crece.html`            | El campo del título crece hacia abajo con el texto                         |
| 5   | `05-imagen-desde-un-campo.html`       | La imagen subida desde un campo pide texto alternativo y se copia a Medios |
| 6   | `06-listado-movil-crear-primero.html` | En móvil, «Crear» primero y Exportar e Importar en «Más»                   |
| 7   | `07-accion-de-fila-en-menu.html`      | Un botón de menú por fila en vez de «Borrar»; una parada de tabulación     |
| 8   | `08-editor-visual-solo-textos.html`   | Modo «solo textos» del editor visual por debajo de 900 px                  |

Cada lámina trae: qué cambia, una tabla de cifras (clics, toques o paradas de tabulación antes y
después), la pantalla entera antes y después, los estados que hay que construir y una nota con UNA
recomendación y el modo de fallo de la alternativa.

## De dónde sale el contenido

- Sitio, menú, colecciones y campos: el sitio de muestra del repo (`SHOWCASE_MANIFEST` en
  `src/lib/session/demo-seed.ts`): «fodaveg.net», Entradas, Páginas, Proyectos, Autores, Etiquetas.
- Entradas: las 12 de la semilla, con sus títulos, slugs, estados y autores.
- **Relleno escrito para las láminas** (no existe en el repo, avisado en cada figura):
  - 18 entradas más, para llegar a la página real de 30 filas (`DEFAULT_PER_PAGE`).
  - La entrada «Notas del huerto: octubre» y los nombres de fichero de la lámina 5.
  - Los nombres de colección largos de las láminas 1 y 6 y los dos bloques de más de la lámina 8.
  - Lámina 2: a «Entradas» se le supone el campo «Publicar el» (`publishAtField`), que la muestra
    no declara.
- El título de 140 caracteres de la lámina 4 es el de la entrada 2 de la semilla, recortado de 152
  a 140.
- Las láminas no llevan fotos: las miniaturas son el bloque tintado con icono que ya usa Medios
  mientras no hay imagen.

## Límites de fidelidad del «antes»

- El editor de Entradas se dibuja sin su raíl lateral de registros (`editorRail`) y con el campo
  Contenido resumido en una línea: ninguna lámina los toca.
- Los menús desplegados, el foco y el ratón encima se fijan con clases de la lámina
  (`.lam-foco`, `.lam-fila-foco`): en producto dependen de `:hover`, `:focus` y de JS.
- A 1440 px, las pantallas de móvil se enseñan en escenarios de 390 px sin la barra superior de la
  app y sin los objetivos táctiles de 44 px (dependen de `pointer: coarse`). La verdad del móvil es
  la captura de 390 px.

## Token e icono nuevos

- **Tokens nuevos: ninguno.** Todas las composiciones usan tokens y medidas de piezas existentes;
  cada regla de `fuente/lamina.css` cita de cuál.
- **Icono nuevo: uno**, `more` (tres puntos), para el botón de menú de fila. Está dibujado en la
  lámina 7 junto a los 22 que ya existen.

## Checklist de 7 ejes

| Eje                                  | Estado                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Tokens                            | Cubierto. Ningún token nuevo ni color literal; las medidas nuevas se derivan de piezas existentes y se citan en `lamina.css`.                                                                                                                                                                                                       |
| 2. Componentes con todos los estados | PARCIAL. Cada lámina dibuja reposo, foco, error, cargando, vacío y deshabilitado de su pieza. Falta dibujar: ratón encima en los menús (solo descrito), el menú de fila abriéndose hacia arriba, el campo de imagen múltiple con varias imágenes nuevas y el conflicto de edición dentro del diálogo de programar.                  |
| 3. Responsive por componente         | Cubierto a 390 y 1440 px. PARCIAL entre medias: no hay captura a 768 ni a 900 px, que son los cortes del menú lateral y del editor visual. La lámina 3 enseña la barra a unos 990 px en las figuras sueltas.                                                                                                                        |
| 4. Accesibilidad                     | PARCIAL. Cubierto: objetivos de 44 px con puntero basto, foco visible, roles y nombres accesibles, orden de tabulación contado, nada depende solo del color. Falta: medir el contraste de las piezas nuevas en los 21 temas (solo se han mirado Aquelarre claro y oscuro) y probar con lector de pantalla, que una lámina no puede. |
| 5. Casos límite de contenido real    | Cubierto. Título de 140 caracteres, palabra sin espacios, 30 filas, lista vacía, nombres de colección y de fichero largos, registro sin título ni autor.                                                                                                                                                                            |
| 6. Feedback del sistema              | Cubierto. Guardando, guardado, fallo con reintento, segunda escritura que falla sola (láminas 2 y 5), avisos que no bloquean. PARCIAL en la lámina 1: falta decidir de dónde sale «lo último que editaste», y de eso depende su estado de error.                                                                                    |
| 7. Assets                            | Cubierto. Un icono nuevo (`more`), dibujado junto a los existentes. Sin imágenes ni fuentes nuevas.                                                                                                                                                                                                                                 |

## Lo que queda por decidir

1. **Lámina 1.** De dónde sale «lo último que editaste»: del historial de revisiones (que guarda
   quién guardó, pero puede estar desactivado) o de una lista guardada en este navegador (no viaja
   entre equipos). Y el nombre de la pantalla: aquí se llama «Inicio».
2. **Lámina 2.** En el formulario no hay botón de publicar: publicar es poner Estado en Publicado y
   guardar. «Programar…» se ha puesto junto al campo Estado. Confirmar que ese es «junto a
   publicar», y que «Programar» guarda el registro entero.
3. **Lámina 5.** Dónde vive el texto alternativo de una imagen subida desde un campo. El campo de
   fichero de un registro no tiene texto alternativo propio; la propuesta lo guarda en la ficha de
   Medios. Falta decidir cómo lo lee el sitio público.
4. **Lámina 7.** Con una sola acción («Borrar»), el menú cuesta un clic más con ratón. Decidir si
   entra alguna acción más (por ejemplo «Duplicar», que hoy solo está dentro del registro).
5. **Lámina 8.** Qué campos cuentan como texto: aquí, los de una línea y los de varias. Los de
   texto con formato quedan fuera.

## Hallazgos al leer el código (no son parte del lote)

- `VisualEditorScreen.svelte`: el botón «Volver al formulario» pinta el chevron apuntando a la
  derecha. En `RecordForm` el botón de volver lo espeja con `scaleX(-1)`; aquí no.
- A 390 px, «Borrar» queda fuera de la pantalla en todos los listados (va dentro de la última
  columna, al final del desplazamiento lateral). La lámina 7 lo resuelve de paso con la celda
  pegada.
- Los botones «Crear», «Exportar» e «Importar» de la cabecera del listado miden 31 px de alto
  también con puntero basto.
- El encargo cita `ListToolbar.svelte` para «Crear», Exportar e Importar: viven en
  `src/routes/c/[type]/+page.svelte`. `ListToolbar` solo tiene el buscador y «Filtrar».
