# Configuración de Vega

Vega resuelve la URL de su backend PocketBase en runtime, con **tres niveles de precedencia** (de mayor a menor):

1. **Override runtime** (`localStorage`, clave `vega.backendUrl.v1`): lo que el usuario guarda desde la pantalla de conexión (ver [Pantalla de conexión](#pantalla-de-conexión-primer-arranque) más abajo). Gana a todo lo demás.
2. **`static/vega.config.json`**: fichero JSON opcional, leído en runtime (sin build) al iniciar la app.
3. **Same-origin**: si ninguno de los dos anteriores aplica, Vega busca PocketBase en `window.location.origin`.

Un valor inválido en cualquiera de los dos primeros niveles (string vacío, URL malformada, sin `http(s)://`) se ignora y cae al siguiente nivel — nunca bloquea el arranque (P3-L3).

Una vez resuelta esa URL, Vega intenta leer el contrato versionado del proyecto
en `GET /api/vega/discovery`. Si existe, PocketBase pasa a ser la fuente de
verdad de la colección de autenticación, la extensión de auth y la identidad
del registro de manifiesto. Por tanto, un montaje same-origin no necesita un
`vega.config.json` específico del proyecto. Consulta el
[contrato de proyecto v1](PROJECT-CONTRACT-v1.md).

## Pantalla de conexión (primer arranque)

Sin tocar ningún fichero, puedes apuntar Vega a cualquier PocketBase desde la propia app:

- **`/login`** (antes de tener sesión): despliega "¿PocketBase en otro servidor? Configúralo" bajo el formulario.
- **`/settings`** (ya autenticado): sección "Backend / conexión".

En ambos sitios, el mismo formulario (`BackendUrlForm.svelte`) permite:

- Introducir la URL del PocketBase (`https://pb.midominio.com`).
- **Colección de autenticación** (opcional, L6): introducir el nombre de la colección de auth si no es `_superusers` (modo editor). Ausente o `_superusers` ⇒ modo superuser (default). Ver [Autenticación en Vega y rol editor](POCKETBASE-INTEGRATION.md#autenticación-en-vega-y-rol-editor) para explicación y setup.
- **Probar conexión** (opcional, best-effort): hace `GET {url}/api/health`. Un fallo (p. ej. CORS aún no configurado) no impide guardar — es solo informativo.
- **Guardar**: valida los valores, persiste en `localStorage` (claves `vega.backendUrl.v1` y `vega.authCollection.v1`) y recarga la página. Tras recargar, Vega se conecta a la nueva URL y autentica contra la colección indicada.
- **Restablecer a same-origin** / **Restablecer a `_superusers`**: borra los overrides guardados y recarga.

Los overrides viven SOLO en el navegador (`localStorage`), no se comparten entre dispositivos ni usuarios: cada persona que abre Vega en un origen distinto de su PocketBase necesita guardarlos una vez en su propio navegador (o recibir la SPA ya con `vega.config.json` configurado, ver abajo).

## Configuración de PocketBase remoto

### Fichero de configuración

Crea `static/vega.config.json` con la siguiente estructura:

```json
{
	"backendUrl": "https://pb.example.com"
}
```

**Campos**:

- **`backendUrl`** (opcional, string): URL absoluta del servidor PocketBase (http:// o https://). Si está ausente o no es válido, Vega usa same-origin (el valor por defecto).

- **`authCollection`** (opcional, string, L6): nombre de la colección de autenticación contra la que Vega autentica (`login`/`restoreSession`). Ausente ⇒ `'_superusers'` (default, modo superuser — comportamiento previo sin cambios). Cualquier otro valor activa el **modo editor**: la UI degrada la introspección de schema y bootstrap de colecciones (no puede hacerlo un editor) — el schema se sirve desde un snapshot cacheado que un superuser guarda en `/settings`. Útil para dar acceso a un cliente NO técnico con una colección auth dedicada, p. ej. `vega_editors` (ver [Autenticación en Vega y rol editor](POCKETBASE-INTEGRATION.md#autenticación-en-vega-y-rol-editor)).

  Si el PocketBase expone el contrato v1, este valor se descubre del servidor;
  solo hace falta mantenerlo aquí para servidores legacy o como recuperación.

- **`authApiBasePath`** (opcional, string, L6): base relativa de la extensión de autenticación
  fuerte instalada en ESE PocketBase, por ejemplo `/api/vega-auth`. Al definirla, Vega activa
  password + TOTP/recuperación, acceso con passkey y la gestión de factores en Ajustes. Ausente o
  inválida ⇒ login estándar de PocketBase, sin cambiar el comportamiento previo. Solo admite una
  ruta `/api/...` del mismo backend; no acepta URLs externas para no enviar el token a otro origen.

Ejemplo completo con el rol editor y la extensión opcional:

```json
{
	"backendUrl": "https://pb.example.com",
	"authCollection": "vega_editors",
	"authApiBasePath": "/api/vega-auth"
}
```

### Comportamiento

1. **Same-origin (default)**: Si `static/vega.config.json` no existe o `backendUrl` está ausente, Vega busca PocketBase en el mismo origen (`window.location.origin`). Es el caso más común cuando la SPA está copiada a `pb_public/` de PocketBase.

2. **Origen distinto**: Si defines `backendUrl`, Vega se conecta a ese servidor en lugar de same-origin. Debes habilitar CORS en PocketBase para que el navegador permita la conexión (ver [Integración con PocketBase](POCKETBASE-INTEGRATION.md)).

3. **Fallos**: Si la lectura de `vega.config.json` falla (404, JSON inválido, etc.) o `backendUrl` es malformado, Vega cae silenciosamente a same-origin. Nunca bloquea el arranque.

### Ejemplo

**Escenario**: tienes Vega desplegado en `https://admin.example.com/` y PocketBase en `https://api.example.com/`.

1. Antes de hacer build, crea `static/vega.config.json`:

   ```json
   {
   	"backendUrl": "https://api.example.com"
   }
   ```

2. Build:

   ```sh
   pnpm build
   ```

3. Despliega `build/` en `https://admin.example.com/`.

4. Asegúrate de que PocketBase en `https://api.example.com/` permite CORS desde `https://admin.example.com/` (ver [Integración con PocketBase](POCKETBASE-INTEGRATION.md)).

Al cargar la app, Vega lee `vega.config.json` en runtime y se conecta a `https://api.example.com/`.

## Validación en tiempo de build

Para verificar que tu `static/vega.config.json` es válido durante el desarrollo:

1. Asegúrate de que está colocado en `static/` (no en `public/` ni otro lado).
2. El fichero debe ser un JSON válido con la estructura indicada arriba.
3. Reinicia el servidor de desarrollo después de cambiar la configuración.

## Cambios frecuentes

Si necesitas cambiar `backendUrl` entre entornos sin recompilar:

1. Edita `static/vega.config.json` **después** de que la SPA esté desplegada (antes de hacer build, o en el servidor después de desplegar).
2. Recarga la página en el navegador — Vega re-lee el fichero en runtime.

**Nota**: esto requiere acceso al servidor web donde está la SPA. Si no lo tienes (o solo quieres cambiar la conexión para TU navegador, no para todo el mundo que use esa SPA), usa la [pantalla de conexión](#pantalla-de-conexión-primer-arranque) en vez de tocar el fichero — es el override de mayor precedencia y no requiere recompilar ni desplegar nada.

## Identidad y navegación del proyecto

El **manifiesto de contenidos** (colección `vega`, campo `manifest`, editable desde
`/settings`) controla el nombre que aparece en la cabecera y la estructura del menú lateral:

- `site.name` cambia el nombre visible del proyecto. Admite entre 1 y 60 caracteres y usa
  `Vega` como valor por defecto.
- `nav.groups` fija el orden de los grupos del menú.
- `collections.<nombre>.group` coloca una colección dentro de un grupo; `order` fija su posición
  dentro de ese grupo.
- `mergedViews.<id>.group` y `order` hacen lo mismo con una vista fusionada. Colecciones y vistas
  se intercalan por su `order` real: no hay dos menús separados.

Por ejemplo, este fragmento muestra el proyecto como `Mi sitio` y crea el bloque `Contenido` con
Entradas, Páginas y Destacados, exactamente en ese orden:

```json
{
	"schemaVersion": 1,
	"site": { "name": "Mi sitio" },
	"nav": { "groups": ["Contenido"] },
	"collections": {
		"posts": { "label": "Entradas", "group": "Contenido", "order": 0 },
		"pages": { "label": "Páginas", "group": "Contenido", "order": 1 }
	},
	"mergedViews": {
		"destacados": {
			"label": "Destacados",
			"group": "Contenido",
			"order": 2,
			"orderField": "sort",
			"sources": [{ "collection": "posts" }, { "collection": "pages" }]
		}
	}
}
```

Los elementos sin `group` aparecen primero en un grupo anónimo. Después se pintan los grupos
declarados en `nav.groups`; cualquier grupo presente pero no declarado se añade al final en orden
alfabético. Un grupo vacío no se muestra. Los rótulos de grupo que no caben en el ancho del sidebar
se truncan visualmente y mantienen el valor completo disponible como `title`.

## Portada («Inicio»)

Al entrar, Vega abre la portada (`/`) en vez de saltar al primer elemento del menú. No se configura:
sale del modelo. Tiene tres bloques.

- **Crear**: un acceso por tipo de contenido en el que la sesión puede crear, en el orden del menú
  lateral. Los tipos de un solo registro (`singleton`) no salen. Sin permiso en ninguno, el bloque no
  se pinta.
- **Pendientes**: tarjetas con un número. Cada una existe solo si el proyecto tiene el dato; si no,
  no se pinta (no se enseña un cero de algo que no se puede saber). Una tarjeta a cero sí se pinta,
  atenuada.

  | Tarjeta                            | Existe si                                                                | Enlaza     |
  | ---------------------------------- | ------------------------------------------------------------------------ | ---------- |
  | «… en borrador»                    | el tipo tiene `statusField`                                              | al listado |
  | «… con publicación programada»     | el tipo tiene `publishAtField` y el servidor tiene `vegaschedule`        | no         |
  | «… sin descripción»                | el tipo declara `social.descriptionField` o tiene un campo `description` | no         |
  | «Medios sin texto alternativo»     | existe la biblioteca de medios                                           | no         |
  | «Cambios sin publicar en el sitio» | el proyecto anuncia `build`                                              | no         |

  Solo enlaza la tarjeta cuyo filtro se puede escribir en la dirección del listado, que hoy admite
  búsqueda, orden, estado y página. «Medios sin texto alternativo» cuenta todos los archivos de la
  biblioteca, también los PDF: el tipo de archivo no se puede filtrar en el servidor.

- **Lo último que editaste**: hasta 8 elementos, del más reciente al más antiguo. La lista se guarda
  **en el navegador** (`localStorage`, clave `vega.recentEdits.v1:…`, una por servidor y por cuenta,
  con el id de la cuenta y sin su correo): no sale del historial de versiones, que solo ven los
  superusuarios. Por eso **no sigue a la persona a otro dispositivo ni a otro navegador**, y se
  pierde si se borran los datos del sitio. Solo guarda el tipo, el id y la hora del guardado; el
  título y el estado se leen del servidor al abrir la portada. Un elemento borrado, o que la sesión
  ya no puede ver, desaparece de la lista. Guardar un bloque de una página anota la página.

## Campos traducibles

El manifiesto puede agrupar campos físicos como `titleEs` y `titleEn` en un único campo editorial.
Vega mostrará un selector global de idioma en el formulario y mantendrá visibles los campos
compartidos. La referencia completa y versionada está en
[`PROJECT-CONTRACT-v1.md`](./PROJECT-CONTRACT-v1.md#localized-fields).

## Bloques ordenables y heterogéneos (`blocks` y `blockTypes`)

PocketBase no tiene campos repetidores, así que el contenido compuesto —una página hecha de
secciones— se modela como una **colección hija** cuyos registros apuntan al padre. `blocks` enlaza
ambas colecciones y `blockTypes`, en la raíz del manifiesto, declara qué clases de bloque puede
editar Vega.

Este ejemplo completo declara un bloque `hero` con un título guardado en JSON y una imagen guardada
como relación real:

```json
{
	"schemaVersion": 1,
	"collections": {
		"paginas": {
			"blocks": {
				"collection": "bloques",
				"parentField": "pagina",
				"orderField": "orden",
				"typeField": "tipo",
				"dataField": "data"
			}
		},
		"bloques": {
			"label": "Bloques",
			"labelSingular": "Bloque",
			"hidden": true
		}
	},
	"blockTypes": {
		"hero": {
			"label": "Portada",
			"fields": [
				{
					"name": "titulo",
					"label": "Título",
					"widget": "text",
					"source": "data",
					"required": true
				},
				{
					"name": "imagen",
					"label": "Imagen",
					"widget": "relation",
					"source": "record"
				}
			]
		}
	}
}
```

La colección `bloques` necesita estos campos estructurales:

- `pagina`: relación **no múltiple** que apunta a `paginas`.
- `orden`: número.
- `tipo`: texto.
- `data`: JSON.

Los nombres no están reservados. `collection` elige la colección hija y
`parentField`/`orderField`/`typeField`/`dataField` indican los cuatro nombres de campo usados por el
proyecto. Las tres primeras piezas (`collection`, `parentField` y `orderField`) son obligatorias. La
pareja `typeField`/`dataField` es opcional, pero debe declararse junta: el primero tiene que ser texto
y el segundo JSON. Si la pareja está incompleta o no coincide con el esquema, Vega conserva la lista
en modo homogéneo y emite `blocks-heterogeneous-invalid`. Si falla una de las tres piezas base,
descarta la capacidad entera con `blocks-invalid`.

### Vocabulario de tipos

`blockTypes` es un objeto en la raíz del manifiesto. Cada clave identifica un tipo y debe cumplir
`^[a-z][a-z0-9-]*$`: el nombre viaja al componente Astro que lo renderiza y al documento de
discovery del sitio, por eso solo admite minúsculas, dígitos y guiones. El orden de las claves es el
orden de presentación.

Cada tipo admite:

| Clave    | Uso                                                                                       |
| -------- | ----------------------------------------------------------------------------------------- |
| `label`  | Rótulo obligatorio, de 1 a 60 caracteres.                                                 |
| `icon`   | Identificador de icono opcional. Un icono desconocido se sustituye por el genérico.       |
| `fields` | Lista obligatoria con al menos un campo válido. Su orden es el del formulario del bloque. |

Cada elemento de `fields` admite:

| Clave      | Uso                                                                                                           |
| ---------- | ------------------------------------------------------------------------------------------------------------- |
| `name`     | Nombre obligatorio del valor o columna. No puede repetirse dentro del mismo tipo.                             |
| `label`    | Rótulo obligatorio, de 1 a 60 caracteres.                                                                     |
| `widget`   | Widget obligatorio del vocabulario cerrado indicado abajo.                                                    |
| `source`   | `"data"` o `"record"`; si se omite, usa `"data"`.                                                             |
| `required` | Booleano opcional; por defecto `false`. Aplica al formulario de ese tipo, no obliga la columna física global. |
| `options`  | Array no vacío de textos para `select` y `chips`. En los demás widgets no tiene efecto.                       |
| `default`  | Valor inicial opcional. Si el widget no puede representarlo, se ignora solo el default.                       |

El vocabulario cerrado de `widget` es:

`text`, `textarea`, `markdown`, `richtext`, `number`, `switch`, `email`, `url`, `datetime`,
`select`, `chips`, `relation`, `file` y `json`.

### Valores por defecto

El `default` de un campo es el valor con el que nace un bloque NUEVO. Nunca toca un bloque que ya
existe: si la clave está guardada, se respeta tal cual aunque su forma ya no case con el widget
actual. Vega escribe valores canónicos y lee valores históricos con tolerancia.

Por eso el default declarado no se guarda literalmente: se **normaliza** a la forma canónica de su
tipo antes de usarse. Un `datetime` con desfase horario se reescribe a UTC, así que lo que acaba en
el registro puede no ser, carácter a carácter, lo que escribiste en el manifiesto.

Tres reglas que conviene tener presentes al declararlo:

- **`datetime` exige zona explícita.** Vale una fecha sola (`"2026-07-28"`, que se interpreta como
  UTC) o un instante con `Z` o desfase (`"2026-07-28T10:00:00+02:00"`). Una fecha con hora y sin
  zona (`"2026-07-28 10:00:00"`) se descarta: dependería de la zona horaria de la máquina que
  resuelva el manifiesto, y el mismo proyecto daría valores distintos en dos servidores.
- **`null` significa «sin default»** en todos los widgets salvo `json`, donde es un valor legítimo y
  distinguible de no declarar nada.
- **`select` y `chips` contrastan el default contra sus `options`.** Sin `options` declaradas no hay
  ningún valor que ofrecer, así que solo el array vacío de `chips` es representable: un default
  suelto en un desplegable sin opciones sería un valor que el propio formulario no puede mostrar ni
  volver a elegir.

Cuando un default no es representable se descarta SOLO él, con el aviso
`block-type-field-default-invalid`. El campo sigue estando ahí y sigue siendo editable; simplemente
nace vacío.

### Frontera entre `data` y `record`

Con `source: "data"`, el valor vive como una clave dentro de la columna JSON indicada por
`dataField`. Es adecuado para texto, números, opciones y otros datos heterogéneos que no necesitas
consultar como columnas independientes.

Con `source: "record"`, el valor vive en una columna real de cada registro de la colección hija. Esa
es la opción para datos que PocketBase debe indexar, consultar o gestionar con semántica propia.
`relation` y `file` solo son válidos con `source: "record"` porque una relación y un fichero
necesitan una columna física de PocketBase; declararlos en `data` descarta ese campo.

En el vocabulario actual, `relation` está especializado en medios: la columna derivada siempre apunta
a `vega_media`. Su cardinalidad tampoco es configurable todavía; solo el nombre convencional
`images` crea una relación múltiple y cualquier otro nombre crea una relación simple. El manifiesto
no puede expresar hoy una relación a otra colección ni elegir la cardinalidad explícitamente.

Las columnas `record` se derivan del conjunto completo de `blockTypes`. El generador de esquema las
incluye en la migración de creación. El backend también puede comparar esa derivación con un esquema
existente y generar una migración aditiva para las columnas ausentes; Ajustes muestra ese diagnóstico
y ofrece el botón de generar la migración desde su panel de reconciliación. Las columnas
incompatibles se señalan igualmente, pero no se cambian automáticamente: alterar una columna que
puede contener datos requiere una decisión humana.

### Avisos de tipos de bloque

- `block-type-invalid`: se descarta el tipo entero porque su clave, forma, `label` o lista de campos
  no es válida.
- `block-type-field-invalid`: se descarta solo un campo por forma, widget, nombre duplicado o por
  usar `relation`/`file` sin `source: "record"`.
- `block-type-field-default-invalid`: el campo sigue disponible, pero se elimina su `default`
  porque el widget no puede representarlo o porque el campo pertenece al registro.

Dos comportamientos que conviene conocer antes de declararlo:

- **Cada bloque se guarda por su cuenta**, con su propio botón, contra la colección hija. No viaja en el guardado del padre. Lo que sí sube al padre es el estado sucio, para que el aviso de salir sin guardar cuente también los bloques abiertos.
- **El reorden persiste al soltar**, no al guardar. Son varias escrituras sin transacción: si una falla, el orden persistido puede quedar a medias —incluso con el mismo valor repetido en dos bloques— hasta que Vega relee el backend y repinta. Nunca en silencio: verás el error.

Conviene declarar la colección hija con `hidden: true` para que no aparezca además como lista suelta en la navegación: es el mismo contenido en dos sitios con dos modelos mentales distintos. Y con `labelSingular`, porque el botón de la lista es «Añadir {labelSingular}».

### Editar los bloques sobre la página (editor visual)

Una colección con `blocks` puede además editarse **sobre la página real del sitio**, en una pantalla
completa (`/c/<colección>/<id>/visual`) con la paleta de tipos de bloque y el árbol de secciones a un
lado, la página dentro de un `<iframe>` en el centro y la ficha del bloque seleccionado al otro lado.
Un clic sobre una sección de la página abre sus campos al lado; el texto se escribe siempre en los
controles de Vega, nunca encima de la página.

**Esto no se enciende desde el manifiesto.** No hay ninguna clave que añadir aquí: la capacidad la
declara el proyecto en su documento de discovery (`preview.visualEditing`) y la habilita de verdad el
saludo del puente que instala el sitio. Ambas mitades están en
[Vista previa de registros guardados sin publicar](POCKETBASE-INTEGRATION.md#vista-previa-de-registros-guardados-sin-publicar)
y, normativamente, en la sección «Visual editing bridge» del
[contrato de proyecto v1](PROJECT-CONTRACT-v1.md).

Lo que sí depende de lo que declares en el manifiesto es **si la entrada aparece**. Cuatro puertas
cierran la ruta, cada una con su propio aviso en vez de una pantalla en blanco:

| Puerta                             | Qué la abre                                                 |
| ---------------------------------- | ----------------------------------------------------------- |
| Permiso de ver el registro         | Las reglas de la colección, como en cualquier otra pantalla |
| La colección declara `blocks`      | Esta misma sección del manifiesto                           |
| El proyecto ofrece vista previa    | `preview.apiBasePath` en el discovery                       |
| El proyecto anuncia edición visual | `preview.visualEditing: true` en el discovery               |

Y una quinta que no se configura: **por debajo de 900 px de ancho el lienzo ni se monta**. En un
móvil no se descarga el sitio entero para acabar enseñando un aviso de que no cabe; se ofrece el
formulario de bloques de siempre, que ahí funciona bien.

Desde el lienzo se puede seleccionar, añadir en una posición concreta, duplicar, borrar y reordenar
arrastrando. Todo ello tiene equivalente por teclado, porque el lienzo no puede ser la única vía:
`Esc` deselecciona, `Alt` con las flechas mueve la sección seleccionada, `Supr` pide el borrado (con
la misma confirmación y la misma papelera que el formulario), `⌘S`/`Ctrl+S` guarda la ficha abierta y
`?` abre el panel de ayuda con la lista completa.

**La paleta** es la lista de tipos de bloque que la colección PUEDE tener, arriba de la columna
izquierda, encima del árbol de secciones, que es la lista de los que ya TIENE. Cada tipo se puede
arrastrar hasta el lienzo y soltarlo donde vaya, incluida una página sin ninguna sección todavía, que
es justo cuando más falta hace. Arrastrar no es accesible por sí solo, así que cada tipo es también
un botón normal: activarlo con Enter crea esa sección al final, y la creación se anuncia por voz
igual que reordenar y seleccionar. La paleta **sustituye** al botón «Añadir Sección ›» que antes vivía
en la cabecera del árbol, para que no haya dos caminos que hagan lo mismo; el `+` entre bloques del
lienzo se queda, porque ese sí hace algo distinto (elegir la posición exacta).

Solo se pinta cuando hay un vocabulario de tipos que enseñar, o sea con `typeField` declarado y al
menos un tipo en `blockTypes`. **En modo homogéneo** (todas las secciones comparten plantilla) no hay
tipos que elegir, así que la paleta no aparece y la cabecera del árbol conserva su botón «Añadir» de
siempre. Tampoco aparece si la lista de secciones no ha podido cargarse: con el árbol avisando de que
no está disponible, crear escribiría un orden calculado sobre una lista vacía.

Las escrituras son las mismas que las del formulario de bloques, no un segundo camino: se aplica
igual que arriba que **cada bloque se guarda por su cuenta** y que **el reorden persiste al soltar**.
La barra superior enseña esa asimetría en vez de dejarla para quien lea el código.

## Vista previa de tarjeta social (`social`)

Cómo queda un registro al compartirlo. Es un mapeo sobre campos que la colección **ya tiene**, no campos nuevos: qué campo es el título social, cuál la descripción y cuál la imagen, más una plantilla de URL opcional.

```json
{
	"collections": {
		"entradas": {
			"social": {
				"titleField": "title",
				"descriptionField": "excerpt",
				"imageField": "cover",
				"urlTemplate": "https://ejemplo.net/blog/{slug}"
			}
		}
	}
}
```

Presente —aunque sea `{}`— enciende la tarjeta en la columna lateral del editor; sin la clave, no se pinta nada. Cada pieza degrada por separado y con su propio aviso: el título cae al `titleField` del tipo, la URL al `previewUrl`, y la descripción y la imagen simplemente no se pintan. La tarjeta lee el valor **vivo** del formulario, así que responde mientras escribes, y sin imagen enseña un hueco, no una imagen rota.

`urlTemplate` admite los mismos marcadores `{campo}`/`{id}` que `previewUrl` y debe empezar por `http://` o `https://`.

`social` solo pinta una vista previa: no crea campos ni cambia lo que publica el sitio. Los datos de SEO que el sitio sí publica viven en columnas reales de la colección. El sembrado de sitio crea tres en `pages` —`description`, `socialImage` (relación a `vega_media`) y `noindex`— y `@vega/astro` los convierte en `<meta>`, Open Graph y el filtro del sitemap. Detalle en [SEO por página y redirecciones](POCKETBASE-INTEGRATION.md#seo-por-página-y-redirecciones). `social.imageField` sigue aceptando solo un campo `file`, así que no puede apuntar a `socialImage`.

## Publicación programada (`publishAtField`)

Un tipo publicable puede ofrecer «Publicar el»: una fecha a partir de la cual un borrador pasa solo
a publicado. La clave va junto a `statusField` y nombra una columna **real** de la colección, porque
es el servidor quien la consulta:

```json
{
	"collections": {
		"pages": {
			"statusField": "status",
			"publishAtField": "publishAt",
			"fields": {
				"publishAt": {
					"label": "Publicar el",
					"help": "Si la página está en borrador, se publica sola a esta hora. Requiere la extensión vegaschedule en el servidor.",
					"group": "Publicación"
				}
			}
		}
	}
}
```

- **El campo** es un `date` de PocketBase, editable (no `autodate`) y **opcional**: con una fecha
  obligatoria todo borrador acabaría publicándose. El tipo tiene que tener campo de publicación
  (`statusField` resuelto, `draft`/`published`). Si algo de esto falla, Vega avisa con
  `publish-at-field-invalid` y el tipo se queda sin programación. No hay autodetección: una columna
  llamada `publishAt` sin la clave no programa nada.
- **Quien publica es el servidor**: la extensión
  [`vegaschedule`](../extensions/vegaschedule/README.md), un cron de PocketBase que cada minuto pasa
  a `published` los borradores cuya fecha ya pasó y **vacía la fecha**, para que devolver luego la
  página a borrador no la republique. La imagen de Vega usa el PocketBase oficial, que NO la trae.
- **Vega comprueba si el servidor la tiene.** Un superusuario lo pregunta a `GET /api/crons`
  (reservada a superusuarios) buscando el job `vegaschedule`, y lo deja escrito en
  `vega.schemaSnapshot` para los editores, que no pueden llamar a esa ruta. Hay tres estados:
  - **activa**: un borrador con fecha futura se ve «Programada · 12 oct 10:00» en listados, raíl,
    búsqueda global y cabecera del formulario (texto, no solo color);
  - **inactiva** (comprobado que no está): se ve «Borrador · fecha sin efecto», y el campo lleva
    un aviso visible de que la fecha no publicará nada;
  - **sin confirmar** (un editor antes de que un superusuario haya entrado tras esta versión, o un
    fallo al comprobarlo): «Borrador · 12 oct 10:00 sin confirmar», con su propio aviso.
    Con la fecha ya pasada, el registro se ve «Borrador» en los tres casos.
- **En el formulario** sale como cualquier fecha, con la etiqueta y la ayuda que declare `fields`.
  Si el manifiesto no le da ayuda, Vega pone una que dice que hace falta `vegaschedule`.

El sembrado de sitio crea `pages.publishAt` y declara la clave en su manifiesto inicial, también en
proyectos ya sembrados (ver [SEO por página y redirecciones](POCKETBASE-INTEGRATION.md#seo-por-página-y-redirecciones)).

## Vistas fusionadas (`mergedViews`)

Además de `backendUrl`, el **manifiesto de contenidos** (colección `vega`, campo `manifest`, editable desde `/settings` con `ManifestEditor`) admite una sección `mergedViews`: vistas de solo lectura que **unen registros de varias colecciones** en un único listado, reordenable a mano por arrastre. Útiles para tableros tipo "destacados de portada" que mezclan, por ejemplo, `posts` y `pages` en un mismo orden manual sin fusionar sus colecciones reales.

Cada vista aparece en la navegación (`/v/<id>`) junto a las colecciones, con el mismo `group`/`order` que estas — se intercalan por `order` real, no van "las colecciones primero".

### Esquema

```json
{
	"mergedViews": {
		"<id>": {
			"label": "Texto (opcional; default = humanización del id)",
			"icon": "id del set de iconos (opcional)",
			"group": "Nombre de grupo de nav (opcional)",
			"order": 0,
			"orderField": "Campo NUMÉRICO por defecto para las sources que no declaren el suyo (opcional)",
			"sources": [
				{
					"collection": "Nombre de la colección (obligatorio)",
					"where": { "campo": "valor" },
					"orderField": "Campo NUMÉRICO de orden manual de ESTA source (opcional; hereda el de la vista)",
					"titleField": "Override del campo-título para esta source (opcional)",
					"label": "Rótulo de la insignia de tipo para sus registros (opcional)"
				}
			]
		}
	}
}
```

- **`label`/`icon`/`group`/`order`** (opcionales): misma mecánica que `collections.<c>` (§4.8) — `label` por defecto humaniza el `id`; `order` por defecto `0`.
- **`orderField`** a nivel de vista es el _default_ que heredan las sources que no declaren el suyo propio; no se valida contra ninguna colección concreta, cada source lo resuelve contra SU esquema.
- **`sources[]`**: la contribución de cada colección a la vista, mínimo una.
  - **`collection`** (obligatorio): nombre de una colección real y no reservada (`vega`/`vega_*` nunca pueden ser source).
  - **`where`** (opcional): predicado de membresía — cada par `campo: valor` es una condición de igualdad (`eq`); varios pares se combinan en AND. Ausente o `{}` = toda la colección. Una condición con un campo inexistente o que no admite `eq` se ignora SOLA (el resto de `where` sigue en pie).
  - **`orderField`** (opcional, por source): tiene prioridad sobre el `orderField` de la vista.
  - **`titleField`**/**`label`** (opcionales): overrides de proyección por source; por defecto usan el `titleField`/`labelSingular` ya resueltos del tipo.

### Requisito clave: `orderField` numérico por colección

Cada colección participante en una vista fusionada **debe tener declarado un campo numérico de orden** (`orderField`, per-source o heredado de la vista) que exista en su esquema y sea de tipo `number`. Sin eso no hay forma de intercalar sus registros con los de las demás sources en un único orden manual: la source se **descarta** (aviso `merged-source-order-invalid`) y, si ninguna source de la vista sobrevive, la vista entera se descarta (`merged-view-invalid`).

### El `id` de la vista no puede coincidir con el nombre de una colección

El `id` de una `mergedViews.<id>` comparte namespace con `ContentType.name` (rutas `/c/<name>` vs `/v/<id>`). Si coincide con el nombre de una colección del esquema (esté oculta o no), **gana la colección**: la vista en colisión se descarta entera (aviso `merged-view-name-collision`) y no aparece ni en `mergedViews` ni en la navegación. Si te encuentras este aviso, renombra el `id` de la vista.

### Orden manual

Las filas de una vista fusionada se pueden reordenar por arrastre (o teclado) igual que un listado normal. Al soltar, Vega recalcula el `orderField` de **cada** registro afectado y escribe cada actualización en **su propia colección** (`row.source.orderField`, ya resuelto por source) — el reorden es sobre el conjunto mezclado, pero la persistencia sigue siendo por colección de origen.

### Ejemplo: tablero "Destacados Home" con `posts` y `pages`

```json
{
	"schemaVersion": 1,
	"mergedViews": {
		"destacados_home": {
			"label": "Destacados Home",
			"icon": "star",
			"group": "Portada",
			"order": 0,
			"orderField": "rating",
			"sources": [
				{ "collection": "post", "where": { "featured": true } },
				{ "collection": "page", "where": { "status": "published" }, "label": "Página destacada" }
			]
		}
	}
}
```

Aquí `post` y `page` deben tener ambas un campo `rating` numérico (heredado como `orderField` por defecto de la vista); solo se listan los `post` con `featured: true` y las `page` con `status: "published"`, mezclados en un único orden manual reordenable desde `/v/destacados_home`.

## Comprobación de actualizaciones (opt-in)

`/settings` → "Acerca de" incluye un botón **"Comprobar actualizaciones"** que compara la versión instalada contra la última release publicada en `https://api.github.com/repos/fodaveg/vegacms/releases/latest`. Es la **única** petición de red que Vega hace a un origen externo — todo lo demás habla exclusivamente con SU PocketBase (same-origin o el override de arriba) — y por eso es estrictamente **opt-in**:

- Sin acción del usuario, Vega **nunca** contacta con GitHub.
- El botón dispara una comprobación puntual.
- El toggle **"Comprobar actualizaciones automáticamente al iniciar"** (mismo panel, **desactivado por defecto**) hace que el layout dispare esa misma comprobación una vez al cargar la app. Actívalo solo si quieres que Vega avise sola de una versión nueva.
- Si hay una versión más nueva, aparece también un banner descartable en la parte superior del admin (se recuerda por versión: descartarlo no oculta una release posterior).
- No hay autoupdate: Vega es una SPA estática y no puede reescribir sus propios ficheros. El enlace del aviso lleva a la página del release en GitHub para que actualices el despliegue a mano.

**Nota para operadores con CSP estricta**: si defines `Content-Security-Policy` con `connect-src` restringido, añade `https://api.github.com` a esa directiva o la comprobación de actualizaciones fallará silenciosamente (se degrada a "No se pudo comprobar", nunca rompe el resto de la app).

## Aviso por correo de los mensajes de contacto

La imagen de producción (`infra/production/Dockerfile`) incluye un hook de PocketBase,
`infra/production/pb_hooks/vega-contact-notify.pb.js`, copiado a `/pb/pb_hooks/`. Avisa por correo de
los mensajes que llegan a la colección `messages` con el nombre, el correo y el mensaje del
visitante (escapados: el correo es HTML y el visitante puede mandar marcado) y su correo como
`Reply-To`. El asunto lleva el nombre del sitio (`Application name` en los ajustes de PocketBase).

**Cómo funciona.** El envío NO ocurre en la petición del visitante. Al crearse el mensaje, el hook
solo lo marca como pendiente (campo `notifyState`) y devuelve la respuesta normal sin tocar el SMTP;
un cron de PocketBase (`vega-contact-notify`, cada minuto) avisa de los pendientes. **El aviso llega
hasta un minuto después del mensaje.** Un SMTP lento, caído o que no contesta no retrasa ni rompe el
formulario del visitante.

Se configura con variables de entorno del proceso de PocketBase (en el `compose.yml`, por ejemplo):

| Variable                             | Efecto                                                               | Por defecto |
| ------------------------------------ | -------------------------------------------------------------------- | ----------- |
| `VEGA_CONTACT_NOTIFY_TO`             | Destinatarios, separados por comas. Sin ella no se avisa a nadie.    | (sin valor) |
| `VEGA_CONTACT_NOTIFY_MAX`            | Máximo de avisos por ventana. Un valor no entero o `0` se ignora.    | `5`         |
| `VEGA_CONTACT_NOTIFY_WINDOW_MINUTES` | Tamaño de la ventana en minutos. Un valor no entero o `0` se ignora. | `60`        |

- **Sin `VEGA_CONTACT_NOTIFY_TO` los mensajes se guardan y NO se avisa por correo.** El hook no
  falla ni escribe errores en ese caso. La interfaz de Vega no puede saber si el aviso está
  configurado (la variable vive en el entorno del servidor, no en PocketBase), así que no puede
  mostrarlo. Un mensaje que llega sin destinatarios configurados no se avisa después, aunque se
  configure más tarde.
- **Hace falta SMTP configurado en PocketBase** (ajustes de correo), con remitente. El hook usa ese
  remitente y ese cliente de correo.
- **Solo se avisa de los mensajes creados SIN sesión**, que son los del formulario del sitio. Los que
  da de alta un editor con «Nuevo», una importación o una migración no avisan. El hook lo decide al
  crear el mensaje y lo guarda en `notifyState`, un campo **oculto** de `messages`: la API no lo
  devuelve (solo a un superusuario) y un cuerpo de petición que lo traiga se descarta, así que ni un
  visitante ni un editor lo fijan por accidente desde un formulario. Los estados son `pending`
  (pendiente), `sending`, `sent`, `more`, `capped` y `failed`; vacío = no se avisa. La colección la
  crea el módulo `contacto` de «Base del sitio», que ya incluye el campo; una `messages` anterior lo
  recibe al actualizar el sitio, y mientras no lo tenga el hook no marca ni avisa de nada.
- **Límite**: se cuentan los avisos de la última ventana. Al llegar a `VEGA_CONTACT_NOTIFY_MAX`, el
  siguiente mensaje manda UN último correo de «hay más mensajes» (sin datos de ningún visitante) y
  los siguientes se guardan sin avisar hasta que la ventana corra. Se calcula por la fecha de alta
  del mensaje (campo `created`, autodate, de `messages`); no usa ninguna colección auxiliar.
- **Si el envío falla** (SMTP caído o que rechaza), el mensaje ya está guardado y el visitante no se
  entera. El mensaje NO se marca como avisado: vuelve a la cola y se reintenta cada minuto, **hasta
  una hora** después de haber llegado; pasada esa hora pasa a `failed` y no se reintenta más (así un
  destinatario o un SMTP que nunca funcionan no producen reintentos eternos). El fallo queda en los
  logs de PocketBase con el id del registro y el error recortado a 200 caracteres, sin el nombre, el
  correo ni el texto del visitante.
- **Si el SMTP acepta la conexión y no contesta**, el formulario sigue respondiendo con normalidad.
  Dos ejecuciones del cron no se solapan (la segunda sale sin hacer nada) y el cerrojo caduca a los
  5 minutos. Un envío que se queda a medias deja el mensaje en `sending`; la siguiente ejecución que
  recupere el cerrojo no sabe si el correo salió y lo pasa a `failed` sin reenviarlo: se prefiere
  perder un aviso a mandarlo dos veces. La conexión colgada sigue ocupando su hilo en PocketBase
  hasta que el sistema operativo la cierre.
- **Hueco conocido**: el cerrojo vive en la memoria de cada proceso de PocketBase. Con varios
  procesos sobre la misma base de datos, dos ejecuciones podrían solaparse y mandar un aviso de más.
- **El hook solo corre si la imagen lo incluye**: una instancia cuya imagen no se construye desde
  `infra/production/Dockerfile` de este repo, o que usa otro `--hooksDir`, **no tiene el hook** y no
  avisa aunque las variables estén puestas ni aunque `messages` tenga el campo. En concreto,
  **admin.lumbre.pro nunca lo tendrá**: su imagen solo copia `pb_public` de la de Vega. Sobre una
  colección `messages` inexistente no hace nada.
- Los tests de contrato usan un SMTP sumidero sin TLS. **Antes de desplegar hay que probarlo con un
  SMTP real con TLS**: no está probado.

## Ocultar una entrada sin borrarla

«Actualizar el sitio» añade al manifiesto las entradas de la base y de los módulos que falten y no
toca las que ya hay; por eso una entrada borrada a mano vuelve en la siguiente actualización. Para
que no aparezca, hay que marcarla como oculta en vez de borrarla: `collections.<nombre>.hidden`
(booleano) para una colección y `collections.<nombre>.fields.<campo>.hidden` para un campo. Las
colecciones reservadas de Vega (`vega`, `vega_*`) siempre están ocultas y no se pueden anular.

```json
{
	"collections": {
		"messages": { "hidden": true }
	}
}
```
