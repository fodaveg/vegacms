# Lote 13 «Revisión antes de publicar»: lámina

Una lámina para ver ANTES de construir la interfaz de la revisión (tarea de Lumbre `a681c289`).
Modo componente: el sistema de diseño de Vega (tema Aquelarre, claro y oscuro) se aplica tal cual.
La lógica ya existe en `src/lib/publish-review/` y aquí no se toca nada de `src/`.

Medido al empezar: rama `design/l13-revision-lamina` desde `origin/integracion/lotes-audit-30sep`
en `968ee0c` (el worktree nació en `origin/main`, 289 commits por detrás; se rehízo la rama).

## Cómo se monta y se captura

```sh
node design/mockups/2026-10-02-revision-antes-de-publicar/build.mjs      # fuente/ -> lámina autocontenida
node design/mockups/2026-10-02-revision-antes-de-publicar/capturar.mjs   # capturas/ (390 y 1440, claro y oscuro)
```

Misma mecánica que el lote 12: `build.mjs` copia en cada montaje el CSS REAL (temas, `base.css`,
`admin.css`, el `<style>` de cada componente que aparece, los trazos de `Icon.svelte`).
`fuente/lamina.css` tiene el cromo de la lámina (parte 1) y las composiciones propuestas (parte 2,
prefijo `vega-review-`). `capturar.mjs` corre en headless y avisa de desbordes; la última pasada
salió «Sin desbordes horizontales». `capturas/` no se versiona. La lámina montada sale sin
formatear y `pnpm lint` corre `prettier --check .` sobre `design/`: tras montar, pasarle
`prettier --write` a la lámina de la raíz de la carpeta.

## Decisiones y su motivo

1. **La tarjeta va arriba del aside, no junto al campo Estado.** En el modelo real (Páginas y
   Entradas del sembrado) Estado no tiene grupo y cae en la columna central entre Layout y
   «Publicar el», y el grupo SEO va en el aside. Una tarjeta ahí partiría los campos y empujaría
   los bloques. Arriba del aside se ve mientras se edita (es pegajoso) y queda encima de los campos
   de SEO que señala la mitad de los avisos. Junto a Estado queda una línea («La revisión tiene 7
   avisos. Ver la revisión») por el hueco `below` de `FieldRow`, con las piezas de la línea de
   «Programar…». Es lo que cubre el móvil, donde el aside cae al final.
2. **Un grupo por comprobación que aplica** (SEO, Enlaces, Imágenes), cada uno con su estado:
   «Sin avisos», «N avisos», «Comprobando…», «No comprobado». Así «0 avisos» nunca se confunde con
   «no se ha mirado», y SEO (que no necesita leer nada) sale antes que el resto.
3. **Resumen en la cabecera, siempre con texto**: «7 avisos» (tono aviso), «Sin avisos» (tono
   éxito), «Incompleta» (neutro: cero avisos pero algo sin comprobar). La píldora es la de
   `.vega-editor-tag`.
4. **Una acción por aviso.** Ir al campo, o al bloque (se despliega, se desplaza y el foco va al
   campo). Para `media.alt-missing` ir al bloque no arregla nada (el alt vive en Medios), así que
   la acción es «Describir la imagen…», que abre `MediaDetail` encima del formulario.
5. **Hasta 3 avisos por grupo y «Ver N más».** Una galería de nueve fotos sin alt haría nueve
   filas y sacaría el resto del aside pegajoso de la pantalla.
6. **Editor visual: «Marcar como publicada» pregunta solo si hay avisos o algo sin comprobar**, en
   el popover de confirmación que ya existe, con la pareja de color `--warning`/`--warning-soft`.
   Sin avisos publica a la primera, como hoy. Con bloques sin guardar y avisos, sale UNA
   confirmación con las dos cosas. Foco en «Cancelar», Esc cierra. Nunca publica solo.
7. **Sin permiso para editar**: la tarjeta enseña los avisos sin acciones. En el editor visual hoy
   ya no hay botón, así que tampoco hay popover.
8. **Sin Estado, sin tarjeta.** Etiquetas y Redirecciones no publican nada. Tampoco hay tarjeta si
   no aplica ninguna comprobación.

## Textos: claves propuestas para `review.*` (es)

Los ocho mensajes de hoy se usan tal cual, salvo uno:

- `review.media.altMissing`: **cambio** a «La imagen «{file}» no tiene texto alternativo.» (se cae
  «Añádelo en Medios.»: la acción «Describir la imagen…» lo hace desde aquí).

Faltan, y se proponen:

| Clave                           | Texto                                                                                                           |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `review.title`                  | Revisión                                                                                                        |
| `review.count.one` / `.many`    | 1 aviso / {count} avisos                                                                                        |
| `review.count.none`             | Sin avisos                                                                                                      |
| `review.count.incomplete`       | Incompleta                                                                                                      |
| `review.checking`               | Comprobando…                                                                                                    |
| `review.group.seo`              | SEO                                                                                                             |
| `review.group.links`            | Enlaces                                                                                                         |
| `review.group.media`            | Imágenes                                                                                                        |
| `review.group.skipped`          | No comprobado                                                                                                   |
| `review.skipped.links`          | Vega no ha podido saber qué páginas y redirecciones tiene el sitio, así que los enlaces no se han comprobado.   |
| `review.skipped.media`          | No se ha podido leer la biblioteca de medios, así que el texto alternativo de las imágenes no se ha comprobado. |
| `review.recheck`                | Volver a comprobar                                                                                              |
| `review.loadError`              | No se han podido leer los bloques de la página: los enlaces y las imágenes no se han comprobado.                |
| `review.notBlocking`            | Ningún aviso impide publicar.                                                                                   |
| `review.more` / `review.less`   | Ver {count} más / Ver menos                                                                                     |
| `review.go.field`               | {label} (nombre accesible: «Ir al campo {label}»)                                                               |
| `review.go.block`               | Bloque {position} · {block} › {label} (nombre accesible: «Ir a {label}, en el bloque {position} ({block})»)     |
| `review.go.form`                | Abrir {label} en el formulario                                                                                  |
| `review.describeImage`          | Describir la imagen…                                                                                            |
| `review.statusLine`             | La revisión tiene {count} avisos. (con `.one`)                                                                  |
| `review.statusLine.open`        | Ver la revisión                                                                                                 |
| `editor.visual.review.title`    | Antes de publicar: {count} avisos / Antes de publicar (si también hay bloques sin guardar)                      |
| `editor.visual.review.body`     | Ningún aviso impide publicar. Puedes publicar igualmente o arreglarlos antes.                                   |
| `editor.visual.review.checking` | Revisando la página… / Tarda un momento. Puedes esperar o publicar sin la revisión.                             |
| `editor.visual.review.skipWait` | Publicar sin esperar                                                                                            |
| `editor.visual.review.error`    | No se ha podido revisar la página                                                                               |

«Publicar igualmente», «Cancelar» y «Reintentar» ya existen. La tabla de la lámina dice, aviso por
aviso, el texto y adónde lleva su acción en el formulario y en el editor visual.

## Lo que el implementer necesita y hoy no existe

- **Qué comprobaciones aplican a un tipo.** La tarjeta pinta un grupo solo si aplica, y
  `reviewRecord` no lo dice (un grupo que no aplica no da ni hallazgo ni `skipped`). Hace falta un
  `applicableChecks(type, model)` exportado de `publish-review.ts` con el mismo criterio que
  `seoFields` y los campos de enlace e imagen. Es lógica, no interfaz: va al implementer.
- **Llegar a un campo dentro de un bloque**: desplegar el bloque desde fuera de `RecordBlocks`
  (hoy solo lo hace su propio botón) y un id estable del control del campo dentro de
  `BlockEditor`. Para campos traducibles, cambiar antes la pestaña de idioma (`localeForField`).
- **`MediaDetail` abierto desde el formulario** con el foco en «Texto alternativo».

## Límites de fidelidad

- El campo «Contenido» (texto con formato) se dibuja como texto (`.lam-richtext`); el editor real
  no entra en la lámina. «Imagen para redes» se dibuja solo con su lista vacía y su nota.
- Árbol, lienzo y ficha del editor visual son huecos rotulados: la lámina no los toca.
- El foco, el popover abierto y «Ver N más» se fijan con clases de la lámina (`.lam-foco`);
  en producto dependen de JS.
- En las capturas el viewport se estira al alto de la lámina, así que el `max-height` del popover
  (`min(70vh, 34rem)`) sale siempre como 34rem.
- Las etiquetas «Path» y «Layout» son las que pinta hoy un sitio sembrado (ver hallazgos).

## De dónde sale el contenido

- Modelo: `site-seeding-manifest.json` (Páginas con grupo SEO en el aside, bloques Hero, Texto
  rico, Galería y Llamada a la acción) y `site-seeding-blog.ts`. Sitio «Aguja», el del sembrado.
- **Relleno escrito para la lámina**: la página «Talleres de otoño», su descripción (211
  caracteres), las rutas `/precios`, `/profesoras`, `/inscripcion`, `/reservas`,
  `/talleres-de-invierno`, los nombres de fichero (con el sufijo aleatorio que añade PocketBase) y
  la colección sin SEO de 1.8.
- Los mensajes de los avisos: `review.*` de `src/lib/i18n/es.ts`.

## Checklist de 7 ejes

| Eje                                  | Estado                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Tokens                            | Cubierto. Ningún token, color literal ni icono nuevo (`warning`, `check`, `chevron` ya existen). Cada regla de la parte 2 de `lamina.css` cita la pieza de la que sale.                                                                                                                                                                                                                                                                                                                                 |
| 2. Componentes con todos los estados | Cubierto en la tarjeta (sin avisos, varios, muchos, no comprobado con y sin avisos, cargando, error, sin SEO, sin permiso, línea bajo Estado, destino de las dos acciones) y en el popover (con avisos, con avisos y bloques sin guardar, revisando, error, sin avisos, sin permiso). PARCIAL: falta dibujar «Ver menos» desplegado, el registro en creación y el paso del popover de «revisando» a «sin avisos». Ratón encima de las acciones, solo descrito (subrayado).                              |
| 3. Responsive por componente         | Cubierto a 390 y 1440 px, claro y oscuro: el formulario entero en los dos anchos y el popover a 390. PARCIAL entre medias: sin captura a 900 px (el corte en que el aside baja) ni a 768 (el control del editor visual baja de línea).                                                                                                                                                                                                                                                                  |
| 4. Accesibilidad                     | PARCIAL. Cubierto: contraste medido en los 21 temas, claro y oscuro, de cada pareja de la propuesta (todas ≥ 4,5:1; las tres que no llegaban sobre `--warning-soft` pasan a `--ink` dentro del popover), nada depende solo del color (el resumen y los grupos llevan texto, las acciones del popover van subrayadas), objetivos de 44 px con puntero basto, foco en «Cancelar», nombres accesibles de las acciones, `aria-live` solo en el resultado de una carga. Falta probar con lector de pantalla. |
| 5. Casos límite de contenido real    | Cubierto. Nueve avisos de un tipo, rutas y nombres de fichero largos sin espacios (rompen dentro de los 296 px del aside), descripción de 211 caracteres, colección sin SEO, colección sin Estado.                                                                                                                                                                                                                                                                                                      |
| 6. Feedback del sistema              | Cubierto. Comprobando, fallo con reintento, no comprobado con su salida, recálculo en vivo al corregir, aviso de éxito al publicar (el de hoy). El popover nunca publica solo.                                                                                                                                                                                                                                                                                                                          |
| 7. Assets                            | N/A. Sin imágenes, iconos ni fuentes nuevas.                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

## Preguntas abiertas (con recomendación)

1. **Sitio de la tarjeta.** Recomiendo arriba del aside con la línea bajo Estado (decisión 1), y
   no la tarjeta entera junto a Estado como proponía el encargo.
2. **Popover en el editor visual cada vez que hay avisos.** Recomiendo que sí: es un clic más
   solo cuando hay algo que decir, y el editor visual no enseña la tarjeta. La alternativa (una
   píldora con el número junto al botón, sin preguntar) se ignora justo al publicar.
3. **Recalcular en vivo o a demanda.** Recomiendo en vivo con los valores en pantalla
   (`reviewRecord` es puro y barato) y releer páginas, redirecciones y medios al abrir, tras cada
   guardado y con «Volver a comprobar».
4. **`media.alt-missing`: «Describir la imagen…» con `MediaDetail` encima del formulario.**
   Recomiendo reutilizarlo. Si el implementer lo encuentra demasiado atado a `/media`, la salida
   es un enlace a `/media` con el elemento abierto, que hoy no existe (hace falta un parámetro).
5. **Seleccionar el enlace dentro del texto con formato** al ir a un aviso de enlace. Recomiendo
   que no en este lote: el foco en el campo basta y el mensaje ya dice la ruta.

## Hallazgos al leer el código (no son parte del lote)

- En un sitio sembrado, los campos `path` y `layout` de Páginas salen como «Path» y «Layout»: el
  manifiesto no les da etiqueta y `form.field.default.*` solo traduce `title`, `status`, `name` y
  `description`.
- A 390 px, en la cabecera de un bloque con tipo largo («Llamada a la acción») el título
  desaparece y «Borrar» queda pegado a la etiqueta del tipo.
- En el sitio de muestra (`demo-seed`), `paginas` no declara `page` ni se llama `pages`, así que
  `loadReviewData` no encuentra de dónde salen las páginas y los enlaces saldrán siempre como «no
  comprobado» en la demo.
