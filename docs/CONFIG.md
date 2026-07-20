# Configuración de Vega

Vega resuelve la URL de su backend PocketBase en runtime, con **tres niveles de precedencia** (de mayor a menor):

1. **Override runtime** (`localStorage`, clave `vega.backendUrl.v1`): lo que el usuario guarda desde la pantalla de conexión (ver [Pantalla de conexión](#pantalla-de-conexión-primer-arranque) más abajo). Gana a todo lo demás.
2. **`static/vega.config.json`**: fichero JSON opcional, leído en runtime (sin build) al iniciar la app.
3. **Same-origin**: si ninguno de los dos anteriores aplica, Vega busca PocketBase en `window.location.origin`.

Un valor inválido en cualquiera de los dos primeros niveles (string vacío, URL malformada, sin `http(s)://`) se ignora y cae al siguiente nivel — nunca bloquea el arranque (P3-L3).

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
