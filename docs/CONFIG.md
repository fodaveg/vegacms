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
completa (`/c/<colección>/<id>/visual`) con el árbol de secciones a un lado, la página dentro de un
`<iframe>` en el centro y la ficha del bloque seleccionado al otro lado. Un clic sobre una sección de
la página abre sus campos al lado; el texto se escribe siempre en los controles de Vega, nunca encima
de la página.

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
