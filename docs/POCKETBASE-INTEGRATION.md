# Integración con PocketBase

Cómo configurar PocketBase para funcionar con Vega, incluyendo CORS, orígenes y el patrón de múltiples consumidores.

## Requisitos de PocketBase

Vega soporta **PocketBase 0.26.0 o superior**. Versiones anteriores no están soportadas.

Para verificar la versión instalada:

```sh
./pocketbase --version
```

Si necesitas actualizar, descarga desde [pocketbase.io](https://pocketbase.io/).

## CORS (Cross-Origin Resource Sharing)

Si Vega y PocketBase están en **orígenes distintos** (dominios, subdomios o puertos diferentes), debes habilitar CORS en PocketBase.

### ¿Cuándo es obligatorio?

- Vega en `https://admin.example.com`, PocketBase en `https://api.example.com` → CORS requerido.
- Vega en `https://example.com/admin/`, PocketBase en `https://example.com:8090` → CORS requerido (puertos distintos).
- Vega en `https://example.com/`, PocketBase en `https://example.com/` (same-origin) → CORS no necesario.

### Configurar CORS en PocketBase

1. Abre el admin de PocketBase (`http://localhost:8090/_/`).
2. Ve a **Settings** → **CORS origins allowed**.
3. Añade el origen de Vega. Ejemplo:
   - `https://admin.example.com` (con protocolo y dominio exacto).
   - Para desarrollo local: `http://localhost:5173` (puerto exacto).

4. Guarda cambios.

**Múltiples orígenes**: si Vega (o tus usuarios) acceden desde distintos dominios, lista todos separados por coma o línea nueva.

Ejemplo para desarrollo local (Vega en puerto 5173, PocketBase en 8090):

```
http://localhost:5173
```

Ejemplo para producción (Vega en admin.example.com, PocketBase en api.example.com):

```
https://admin.example.com
https://www.example.com
```

(añade `https://www.example.com` si tu sitio público también consume PocketBase).

### Validación

Abre DevTools del navegador (F12) → Consola. Si CORS está mal configurado, verás errores como:

```
Access to XMLHttpRequest at 'https://api.example.com/api/...' from origin 'https://admin.example.com' has been blocked by CORS policy.
```

Si lo ves, vuelve a Settings → CORS origins en PocketBase y asegúrate de que el origen está en la lista.

## Configuración de origen en Vega

Antes de configurar metadatos del proyecto en la SPA, comprueba si tu backend
puede exponer el [contrato de proyecto v1](PROJECT-CONTRACT-v1.md). Con ese
endpoint, Vega solo necesita localizar PocketBase; la auth, el manifiesto y el
singleton de ajustes se descubren desde la base de datos conectada.

Vega detecta automáticamente el origen de PocketBase de dos formas:

### 1. Same-origin (default)

Si Vega y PocketBase están en el mismo origen, no hay que hacer nada. Vega busca PocketBase en `window.location.origin` (el mismo host/puerto).

```
Vega: https://example.com/
PocketBase: https://example.com/ (API en /api)
→ Automático, sin configuración.
```

### 2. Origen distinto (vega.config.json)

Si están en orígenes distintos, crea `static/vega.config.json` **antes de hacer build**:

```json
{
	"backendUrl": "https://api.example.com"
}
```

Luego:

```sh
pnpm build
```

Vega ahora apuntará a `https://api.example.com` en lugar de same-origin.

### 3. Override runtime (pantalla de conexión)

Sin recompilar, cada persona puede apuntar SU Vega a cualquier PocketBase desde la propia app: en `/login` (antes de sesión) o `/settings` (ya autenticada), introduce la URL y guarda. Gana a `vega.config.json` y a same-origin (es el nivel de mayor precedencia). Útil para distribuir un build genérico (un mismo zip, ver [Despliegue](DEPLOYMENT.md#artefacto-de-distribución-zip)) sin hornear una URL fija por cliente.

En CUALQUIERA de las dos opciones (2 y 3), si Vega y PocketBase quedan en orígenes distintos, sigue haciendo falta habilitar CORS (sección anterior) — la URL correcta no basta si el navegador bloquea la petición.

Ver [Configuración de Vega](CONFIG.md) para más detalles (incluida la precedencia completa de los 3 niveles).

## Patrón: múltiples consumidores del mismo PocketBase

Vega es una **SPA cliente puro**: la lógica de autenticación y control de acceso vive en el navegador. Puedes usar el **mismo PocketBase** como backend para múltiples aplicaciones sin conflictos.

### Escenario típico: Astro + Vega

```
PocketBase (datos compartidos)
  ↑            ↑
  │            │
Astro         Vega
(sitio         (admin
 público)      CMS)
```

- **Astro**: sitio público en `https://example.com/`, lee datos de PocketBase (sin edición, solo consumo).
- **Vega**: admin en `https://admin.example.com/`, administra los mismos datos en PocketBase (lectura + escritura).
- **PocketBase**: único origen de verdad, ambas apps hablan con él.

### Configuración

1. **PocketBase**: habilita CORS para ambos orígenes:

   ```
   https://example.com
   https://admin.example.com
   ```

2. **Astro** (`fetch` desde el sitio público):

   ```javascript
   // Consumir datos (lectura)
   const res = await fetch('https://pb.example.com/api/collections/posts/records');
   const posts = await res.json();
   ```

3. **Vega** (editar datos):
   - Configura `static/vega.config.json`:
     ```json
     {
     	"backendUrl": "https://pb.example.com"
     }
     ```
   - Haz build: `pnpm build`.
   - Despliega en `https://admin.example.com/`.

### Autenticación independiente

Cada app (Astro y Vega) tiene su propia sesión:

- **Astro**: puede hacer requests públicos (sin auth) o con credenciales del servidor.
- **Vega**: requiere login (usuario + contraseña) para editar, y almacena el token en `localStorage`.

No hay conflicto: cada una maneja su token de forma independiente.

### Colecciones y reglas de acceso

Define las reglas de acceso (**Read** y **Write** rules) en PocketBase:

- **Colección `posts`**: Read rules = público (vacío), Write rules = requiere `admin=true`.
  - Astro puede leer sin login.
  - Vega solo permite editar a usuarios con rol `admin`.

- **Colección `settings`** (configuración privada): Read rules = requiere auth, Write rules = requiere `admin=true`.
  - Ni Astro ni usuarios anónimos ven la configuración.
  - Solo admins (via Vega) pueden editarla.

Ver la documentación de PocketBase sobre [rules](https://pocketbase.io/docs/api-rules-and-filters/) para más detalles.

#### Vega refleja esas reglas en su interfaz

Vega **lee** las cinco reglas de cada colección (`listRule`, `viewRule`, `createRule`,
`updateRule`, `deleteRule`) y deja de ofrecer lo que sabe que va a dar 403:

| Regla en PocketBase                        | Qué hace Vega                                                                           |
| ------------------------------------------ | --------------------------------------------------------------------------------------- |
| `null` («solo superuser»)                  | No ofrece esa operación                                                                 |
| vacía (`""`, abierta a todos)              | La ofrece                                                                               |
| una expresión (`autor = @request.auth.id`) | La ofrece igual: depende del registro y del usuario, y solo el servidor puede decidirlo |

En concreto: una colección que esta sesión no puede **listar** no aparece en la navegación (su ruta
sigue existiendo y explica el motivo); sin permiso de **creación** no se pinta el botón «Crear» ni
su atajo `N`; sin permiso de **actualización** el editor se abre en solo lectura, diciendo por qué;
sin permiso de **borrado** no aparece la acción «Borrar» ni en la fila del listado ni en el editor.
Lo mismo se aplica a la biblioteca de medios sobre `vega_media` (subir, editar y borrar assets).

Dos aclaraciones que conviene tener presentes:

- **Esto no es control de acceso.** La regla la sigue aplicando PocketBase, siempre. Vega solo evita
  que un editor rellene un formulario entero para que el guardado muera en un 403.
- **Un superuser lo ve todo.** PocketBase ignora las API rules para los superusers, así que
  conectando Vega con la colección de auth por defecto (`_superusers`) la interfaz no oculta nada.
  Las restricciones se notan al entrar con una colección de editores (`authCollection`, ver
  «Modo editor» más abajo), que es justo el escenario para el que existen.

## Publicación: disparador de build

Para sitios `output: 'static'` (Astro y similares), guardar un registro en PocketBase no cambia
nada en el sitio público hasta que alguien corre el build. Vega puede disparar y vigilar ese build
desde la topbar (botón "Publicar") si — y solo si — el discovery del proyecto declara `build`
(§["Build trigger endpoint"](PROJECT-CONTRACT-v1.md#build-trigger-endpoint-optional) del contrato
de proyecto). Sin ese campo, Vega no pinta nada relacionado: no hay que "desactivar" la
funcionalidad en ningún sitio, basta con no declararla.

### Por qué no hay un campo `deployWebhookUrl` en la config de Vega

El discovery es un endpoint **público** (lo consulta `/login`, antes de autenticar) y el propio
contrato prohíbe que contenga secretos. La URL real de un webhook de despliegue (un dispatch de
GitHub Actions, un deploy hook de Netlify/Vercel…) **es** un secreto: quien la tiene puede disparar
builds ajenos sin autenticarse contra tu PocketBase. Por eso Vega nunca la conoce: solo conoce
`apiBasePath`, una ruta PROPIA de tu backend, protegida con el mismo token de editor que ya usa
para leer/escribir contenido. El secreto real vive detrás de esa ruta, en tu servidor.

### Qué implementar

Dos rutas, bajo el `apiBasePath` que declares en el discovery (recomendado: `/api/vega-build`),
autenticadas con `Authorization: <token>` (el token de PocketBase, SIN prefijo `Bearer` — la
convención del propio SDK):

- `POST {apiBasePath}/trigger` → dispara el webhook real (server-to-server, con SU credencial
  propia, nunca expuesta a Vega) y responde `202` con `{ "id": "<algo que identifique la corrida>" }`.
- `GET {apiBasePath}/status` → devuelve el estado actual (`state`, `startedAt`, `finishedAt`,
  `lastPublishedAt`, `logUrl`; forma completa en el contrato de proyecto). `state` es uno de
  `"idle"`, `"running"`, `"ok"`, `"failed"`. Vega sondea esta ruta mientras `state` sea `"running"`.

Quién puede llamar a `/trigger` lo decide tu backend: lo más simple es exigir el MISMO rol que ya
usa Vega para editar contenido (`_superusers`, o tu colección `vega_editors` si usas el modo
editor de más abajo) — así no hay una superficie de permisos nueva que mantener.

### Opción A: extensión Go de PocketBase (recomendada si ya ejecutas PocketBase como app Go)

**No hay que escribirla: es [`extensions/vegabuild`](../extensions/vegabuild/README.md)**, un módulo
Go de este mismo repositorio, con las dos rutas del contrato ya implementadas y probadas. Se importa
y se configura, mismo patrón que [`extensions/vegaauth`](../extensions/vegaauth/README.md):

```go
runner, err := vegabuild.NewCommandRunner(vegabuild.CommandConfig{
	Command:        "/opt/ejemplo/deploy.sh", // lo fija el operador, nunca la petición HTTP
	Dir:            "/opt/ejemplo/sitio",
	LogDir:         "/var/log/vega-build",
	LogURLTemplate: "https://admin.ejemplo.com/build-logs/{id}.log",
})
if err != nil {
	log.Fatal(err)
}

build, err := vegabuild.New(vegabuild.Config{
	RoutePrefix:     "/api/vega-build",
	Runner:          runner,
	AuthCollections: []string{"vega_editors"},
})
if err != nil {
	log.Fatal(err)
}

app.OnServe().BindFunc(func(event *core.ServeEvent) error {
	if err := build.EnsureCollections(event.App); err != nil {
		return err
	}
	build.RegisterRoutes(event)
	return event.Next()
})
```

Lo que cambia de un proyecto a otro no son las rutas ni el estado: es **cómo se dispara el build**.
Eso es la interfaz `Runner`, y el módulo trae las dos implementaciones que cubren los dos
despliegues reales:

- **`CommandRunner`** (el de arriba) ejecuta un comando local: PocketBase y el sitio estático en la
  misma máquina, que es el caso arquetípico del contrato. El estado que reporta es el REAL, el
  código de salida del proceso, y el log de cada corrida queda en un fichero propio.
- **`WebhookRunner`** dispara un webhook secreto (un `workflow_dispatch` de GitHub Actions, un
  deploy hook de Netlify…) server-to-server. Como el CI corre en otro sitio, PocketBase no puede
  saber cuándo termina: el módulo añade `POST {apiBasePath}/callback` para que el pipeline avise al
  acabar, autenticado con un secreto compartido propio. Esa ruta es una extensión de `vegabuild`,
  **no** parte del contrato Vega↔proyecto: Vega no la conoce ni la llama.

El fichero `main.go` completo de cada variante, y la llamada exacta que tu CI tiene que hacer al
`callback`, están en el [README del módulo](../extensions/vegabuild/README.md).

Una propiedad que conviene conocer antes de escribir la tuya, porque es el fallo que de verdad
muerde: si algo se lleva por delante a quien tenía que reportar el final de una corrida (el proceso
de PocketBase se reinicia a mitad del despliegue, o el CI nunca llama al `callback`), esa corrida se
queda en `running` y **`/trigger` responde `409` para siempre** — publicar deja de funcionar hasta
que alguien entre a la base de datos a mano. `vegabuild` lo cierra solo: `Config.StaleRunAfter`
(1 hora por defecto) da por abandonada la corrida que lleve demasiado tiempo en curso y la marca
como fallida, así que el botón vuelve a estar disponible.

Si tu forma de publicar no es ninguna de las dos, implementa `Runner` (dos métodos) y reutiliza todo
lo demás; si no ejecutas PocketBase como app Go, ve a la Opción B.

### Opción B: proxy delgado delante de tu webhook real

Si no ejecutas PocketBase como aplicación Go (usas el binario prebuilt sin extensiones), monta un
servicio pequeño aparte (una función serverless, un Worker de Cloudflare, un endpoint de tu propio
backend si ya tienes uno) que:

1. Valide el token de PocketBase que llega en `Authorization` contra tu instancia
   (`POST {backendUrl}/api/collections/{authCollection}/auth-refresh` con ese mismo header — un
   `200` confirma que el token es válido y de quién es).
2. Si es válido, dispare el webhook real (con SU propio secreto, guardado en el proxy, nunca en
   Vega ni en PocketBase) y lleve la cuenta del estado (en su propia base de datos, o consultando
   la API del proveedor de CI/deploy si esta expone el estado de la corrida).
3. Sirva `/trigger` y `/status` con la misma forma que la Opción A.

El `apiBasePath` del discovery puede apuntar a un origen DISTINTO del propio PocketBase si hace
falta (es una URL relativa resuelta contra `backendUrl`, así que si el proxy vive en otro dominio,
usa la variante same-origin poniendo el proxy detrás del mismo reverse proxy que sirve PocketBase,
o documenta CORS igual que en la sección de arriba).

### Verificación

- `GET {apiBasePath}/status` sin build previo responde `{"state":"idle", ...}` con el resto de
  campos a `null`.
- Un `POST {apiBasePath}/trigger` sin `Authorization` (o con un token de otra colección sin
  permiso) responde `401`/`403`, nunca dispara el webhook real.
- Tras un `trigger()`, el botón "Publicar" de la topbar pasa a "Publicando…" y deja de poder
  pulsarse hasta que `/status` reporte un estado distinto de `"running"`.

Con `vegabuild` las tres comprobaciones ya están cubiertas por su suite (`cd extensions/vegabuild
&& go test ./...`, que corre dentro de `pnpm gate`); vuelve a hacerlas a mano contra tu instalación
si escribes tu propio `Runner` o si vas por la Opción B.

## Autoría de esquema desde Vega (crear colecciones, añadir campos)

Vega es el CMS **de** PocketBase: quien tiene superuser puede crear colecciones nuevas y añadir
campos a las que ya existen directamente desde **Ajustes → Esquema** (`/settings`), sin abrir el
Admin de PocketBase. Es la misma operación que hace `ensureCollections`/`addCollectionFields` del
puerto (capabilities `schemaBootstrap`/`schemaFieldBootstrap`) — estrictamente **aditiva**: crea
lo que falta o añade campos ausentes, pero **nunca renombra ni borra nada**. En PocketBase,
renombrar/borrar una columna destruye sus datos sin posibilidad de deshacer; por eso esa
operación sigue sin existir en Vega.

Sin superuser (modo editor, colección de auth distinta de `_superusers`), esta sección no se
ofrece — mismo gate que el editor del manifiesto (ver [Modo editor](#modo-editor-l6) más abajo).

El tipo **Relación** solo permite elegir una colección presente en el esquema descubierto; no
acepta un nombre libre. La persona que crea el campo decide además si admite uno o varios
registros y qué ocurre al borrar el destino:

- **Conservar este registro**: PocketBase elimina el enlace y mantiene el registro propietario.
- **Borrar este registro**: activa
  [`cascadeDelete`](https://pocketbase.io/jsvm/interfaces/core.RelationField.html#cascadedelete);
  PocketBase borra el registro propietario cuando desaparece su última relación. Vega lo presenta
  como una decisión destructiva explícita.

El payload aplicado por red usa el `collectionId` real del entorno. La migración generada no
incrusta ese id —resuelve `app.findCollectionByNameOrId("<nombre>").id` al ejecutarse—, por lo que
el mismo fichero sirve en local, staging y producción aunque cada PocketBase asigne ids distintos.

### Migraciones (`pb_migrations/`)

Cada vez que "Crear colección" o "Añadir campos" tiene éxito, Vega genera al vuelo un fichero de
[migración JS de PocketBase](https://pocketbase.io/docs/js-migrations/) con el mismo cambio que
acaba de aplicar por red, listo para copiar. **Guárdalo en `pb_migrations/` del repositorio de tu
proyecto y commítealo** — es el mismo patrón que ya usan proyectos reales sobre PocketBase (p. ej.
`lumbre.pro`) para mantener el esquema versionado.

Por qué importa: sin esa migración, cada colección/campo creado desde Vega solo existe en el
PocketBase que tocaste — production, staging o tu portátil, lo que fuera — y **en ningún sitio
más**. Si reconstruyes esa instancia desde cero (un nuevo entorno, un desastre, un fork del
proyecto), el esquema real diverge en silencio de lo que el repositorio documenta. Nada te avisa
de eso: Vega no vuelve a comprobar si la migración se guardó.

### Landmine: un `number` `required` rechaza el valor 0

Verificada en producción: PocketBase trata "campo obligatorio" como "distinto del cero-valor del
tipo", y el cero-valor de `number` es `0`. Un campo numérico marcado `required` rechaza cualquier
intento de guardar `0`, aunque sea un valor perfectamente legítimo (p. ej. una valoración de 0 a
5, o un contador que empieza en cero). Vega no bloquea la combinación en la UI de creación de
campos —hay rangos que necesitan 0 como mínimo válido—, pero avisa inline en cuanto marcas
"Obligatorio" sobre un campo numérico. Si tu campo necesita permitir 0, no lo marques obligatorio.

## Miniaturas (thumbnails)

PocketBase genera y sirve miniaturas **solo para los tamaños declarados explícitamente** en la opción **Thumb sizes** (`thumbs`) de cada campo `file`. Si Vega pide un tamaño no declarado, PB responde **200 con el fichero original a tamaño completo** (sin error, sin imagen rota) — un coste silencioso de ancho de banda y memoria que no se detecta a simple vista.

Vega solicita estos tamaños (todos recorte/crop):

- `300x300` — galería `/media`.
- `120x120` — widget de subida del editor.
- `28x28` — miniatura de la celda de listado.

La colección `vega_media` que Vega bootstrapea **ya declara estos tres tamaños automáticamente** (vía el JSON de importación de `/media`), así que su galería funciona sin configuración adicional.

**Para tus colecciones de contenido propias** con campos `file` de imagen que edites o listes en Vega: declara en PB (Collections → tu colección → campo `file` → Thumb sizes) al menos `300x300` y `28x28` (y `120x120` si editas ese campo con el widget file), o Vega mostrará el original completo en cada miniatura. Vega **no** añade thumbs retroactivamente a colecciones que no creó.

## Historial de versiones

Vega puede guardar una copia del estado de un registro justo ANTES de cada guardado, para poder
compararla con la versión actual o recuperar los valores en el formulario. Vive en una colección
propia, `vega_revisions`, con el mismo mecanismo de bootstrap que `vega_media`: **Ajustes → Historial
y papelera → Crear colección de historial** (requiere sesión de superuser; un rol editor no puede
crearla, solo usarla si ya existe).

Cómo funciona:

- Cada vez que guardas cambios sobre un registro ya existente, Vega lee su estado ANTERIOR y lo
  guarda en `vega_revisions` antes de aplicar el cambio nuevo. Crear un registro nuevo **no** genera
  ninguna revisión (no hay "antes" que guardar).
- El panel **«Historial»** del editor (aside, junto a «Se usa en») lista las revisiones guardadas de
  ese registro. Al abrir una, se compara contra la versión ACTUAL (nunca revisión contra revisión).
- **«Restaurar en el formulario»** carga los valores de esa revisión como cambios SIN GUARDAR — nunca
  escribe directo al backend. Revisas y pulsas «Guardar» tú mismo, como cualquier otro cambio.
- Si el guardado de una revisión falla (red, colección todavía sin bootstrapear, etc.), el guardado
  del registro en sí **nunca se ve afectado**: seguirá completándose con normalidad, simplemente sin
  dejar rastro en el historial esa vez.
- Retención: por defecto se conservan 20 versiones por registro (las más antiguas se podan solas,
  en segundo plano, sin bloquear ningún guardado). Ajustable desde **Ajustes → Historial y
  papelera**, o directamente en el manifiesto (`revisions.keepPerRecord`).
- **Coste**: cada guardado de un registro ya existente hace una lectura y una escritura extra contra
  `vega_revisions`. Ningún otro camino de la app (listados, navegación) paga ningún coste adicional.

## Papelera

Además del historial de versiones (arriba), Vega guarda una copia de cada registro justo ANTES de
**borrarlo** (`kind:'delete'` en la misma colección `vega_revisions`), accesible desde **Papelera**
en la barra lateral. Retención por defecto: 30 días (ajustable en **Ajustes → Historial y
papelera**, o `revisions.trashDays` en el manifiesto), con poda automática en segundo plano.

Restaurar un registro borrado (**Papelera → Restaurar**) lo recrea con **su id original** —
imprescindible para no romper en silencio lo que apuntaba a él— vía `create` con un id explícito
(requiere que el backend lo soporte; PocketBase lo hace desde siempre, verificado contra 0.39.6).
Dos cosas que **no** se restauran, y que Vega avisa con todas las letras antes de confirmar el
borrado:

- **Los ficheros adjuntos.** PocketBase destruye el binario al instante al borrar el registro, y
  recrearlo con el mismo id no lo resucita — se restauran los VALORES y el id, nunca el fichero.
- **Las relaciones (`relation`) que apuntaban al registro.** Esto sorprende: **PocketBase limpia
  esas relaciones en el mismo instante del borrado** (single → `null`; múltiple → el id se quita
  del array — así lo ve Vega, ya normalizado; en la respuesta CRUDA de PB el single es `''`, y
  `normalizeFieldValue` lo convierte a `null` antes de que llegue a ningún sitio, ver su cabecera),
  no cuando alguien intenta restaurar. Cuando restauras, el id vuelve a estar vivo,
  pero el registro que antes apuntaba a él ya perdió esa referencia — restaurar no la repara,
  porque ya no hay nada que reparar del lado de PocketBase. Lo que SÍ sigue funcionando: cualquier
  referencia que PocketBase no reconozca como `relation` (p. ej. un id pegado a mano en un campo de
  texto/URL, el mismo caso que cubre el panel "¿Dónde se usa esto?") nunca se toca al borrar, así
  que vuelve a resolver en cuanto el id está vivo otra vez.
- Si el registro sigue existiendo con ese id (alguien lo recreó a mano mientras tanto), restaurar
  falla con un mensaje claro — nunca pisa un registro vivo.

Si tu backend no soporta id explícito en `create` (fuera de PocketBase, un adaptador propio), la
papelera **oculta el botón "Restaurar"** en vez de intentar algo que sabe que va a fallar.

Mismo criterio para una colección con un campo `file` **obligatorio**: como los ficheros nunca se
restauran (punto de arriba), un registro de esa colección no se puede recrear completo — `vega_media
.file` es el caso real (un asset ES su fichero), pero la papelera lo detecta por esquema, no como un
caso especial de `vega_media`. La entrada sigue viéndose en la papelera (sus metadatos —alt, título,
etiquetas— siguen teniendo valor), pero con "Restaurar" **deshabilitado** y el motivo explicado.

## Autenticación en Vega

Vega autentica contra usuarios de PocketBase. Hay **dos modos** de autenticación: **superuser** (default, para operadores/administradores) y **editor** (para clientes no técnicos).

### Autenticación reforzada opcional

PocketBase vanilla ofrece contraseña, pero no el flujo combinado que Vega puede activar con
TOTP, códigos de recuperación y passkeys. Para esa variante hace falta ejecutar PocketBase como
aplicación Go e instalar el módulo reutilizable
[`extensions/vegaauth`](../extensions/vegaauth/README.md). La SPA sigue siendo estática y esta
extensión es completamente opt-in.

La extensión Go requiere PocketBase 0.39.7 o superior; el modo estándar de la SPA, sin extensión,
mantiene el rango general de servidores PocketBase 0.26 o superior.

Cuando el servidor expone `/api/vega-auth`, añade al `vega.config.json`:

```json
{
	"authCollection": "vega_editors",
	"authApiBasePath": "/api/vega-auth"
}
```

El login entonces admite contraseña (con reto TOTP o recuperación cuando esté activado) y passkey
descubrible. En **Ajustes → Seguridad de la cuenta** se puede configurar/desactivar TOTP, generar
códigos de recuperación y registrar/eliminar passkeys. Si `authApiBasePath` no existe, la UI de
seguridad no aparece y Vega usa exactamente el login estándar anterior.

El backend bespoke de fodaveg ya implementa ese mismo protocolo de cliente: para reutilizarlo se
configura `"authApiBasePath": "/api/fodaveg"`, sin duplicar sus handlers. Antes de considerar
TOTP realmente obligatorio hay que desactivar también sus emisores nativos de token; el módulo
genérico lo hace automáticamente, pero el backend legacy es anterior a ese endurecimiento.

Usa una colección dedicada como `vega_editors`: al instalarse, la extensión desactiva para ESA
colección los emisores nativos de token por contraseña, OTP, OAuth y MFA de PocketBase. Es un
gate de seguridad necesario para que nadie pueda saltarse el TOTP llamando directamente a
`/auth-with-password`; por eso no debes apuntarla a una colección compartida con otras apps.

### Modo superuser (default)

Sin configurar nada, Vega autentica contra la colección `_superusers` de PocketBase (superuser real, todo el poder):

1. Abre el admin de PocketBase (`http://localhost:8090/_/`).
2. Ve a **Settings** → **Auth collections** o usa la colección `_pb_users_auth_` (el alias built-in).
3. Crea un usuario superuser con email y contraseña.
4. En Vega, inicia sesión con esas credenciales.

**Permisos**: un superuser tiene acceso total a todo:

- Introspecciona el schema en vivo (`GET /api/collections`).
- Crea/modifica colecciones (bootstrap, schema).
- Edita el manifiesto de Vega en `/settings`.
- CRUD completo de contenido (subordinado a las reglas de PocketBase).

Es el modo para desarrollo, dogfood interno y administradores técnicos. No hay configuración extra necesaria.

### Modo editor (L6)

Para dar acceso a un cliente NO técnico, crea una colección de autenticación dedicada (`vega_editors` recomendado, NO reusar `users` para no mezclar con cuentas públicas) y configura Vega para autenticar contra ella. Un editor:

- **NO puede** introspeccionar el schema en vivo (PocketBase rechaza `GET /api/collections` a no-superusers).
- **NO puede** crear ni modificar colecciones en el schema.
- **NO puede** editar el manifiesto desde `/settings` (la UI se degrada: solo lectura).
- **Puede** crear, leer, actualizar, borrar registros de contenido (según reglas de PocketBase).
- **Puede** reordenar registros manualmente en los listados.

#### Setup del modo editor en PocketBase

**1. Crear la colección de auth del editor:**

1. En admin de PocketBase, ve a **Collections** → **Create new**.
2. Tipo: **Auth collection**.
3. Nombre: `vega_editors` (o el que prefieras, mientras sea `vega_*` para claridad).
4. Opcionales: ajusta contraseña y otros campos según necesites.
5. Guarda.

**2. Crear usuarios editor:**

1. Abre la colección `vega_editors`.
2. **New record** → introduce email y contraseña.
3. Guarda.

**3. ⚠ LANDMINE CRÍTICA — Reglas de acceso a la colección `vega`:**

La colección `vega` (donde Vega guarda el manifiesto y el schema snapshot) se crea con reglas de acceso `null` ⇒ **solo superuser puede leerla**. Un editor por defecto la verá PROHIBIDA (403) → la app mostrará VACÍA (sin colecciones ni manifiesto).

**Solución**: en admin de PocketBase, abre **Collections** → **vega** → **Settings** → **Permissions** (tab de lectura):

- **List rule**: `@request.auth.id != null` (cualquier usuario autenticado).
- **View rule**: `@request.auth.id != null` (cualquier usuario autenticado).

Alterna más restringido si necesitas:

- `@request.auth.collectionName == 'vega_editors'` (solo editores de esa colección concreta).

Guarda. Ahora un editor puede leer el manifiesto y el schema snapshot.

**4. Reglas de acceso al contenido:**

Define qué colecciones puede editar un editor (y cuáles no). Para cada colección de contenido, abre **Settings** → **Permissions** y configura:

- **Create rule**: p. ej. `@request.auth.collectionName == 'vega_editors'` (solo editores pueden crear).
- **Update rule**: p. ej. `@request.auth.collectionName == 'vega_editors'` (solo editores pueden actualizar).
- **Delete rule**: p. ej. `@request.auth.collectionName == 'vega_editors'` (solo editores pueden borrar).
- **List rule**: `@request.auth.id != null` o `true` (depende si quieres que lean anónimos).

Alternativamente, `@request.auth.id != null` permite cualquier usuario autenticado; el editor en Vega vería todas las colecciones y podría editar todas. Ajusta según el control de acceso que quieras.

#### Configurar Vega para usar la colección de auth del editor

**Opción A: Horneado en build** (si distribuyes un zip por cliente):

Antes de hacer `pnpm build`, crea `static/vega.config.json`:

```json
{
	"backendUrl": "https://pb.tudominio.com",
	"authCollection": "vega_editors"
}
```

Así todos los que abran ese build autentica contra `vega_editors` sin depender de que lo introduzcan a mano.

**Opción B: Override en runtime** (pantalla de conexión):

Sin tocar ficheros:

1. Abre Vega en `/login` o `/settings`.
2. En el formulario de conexión, introduce:
   - **PocketBase**: `https://pb.tudominio.com`
   - **Colección de autenticación**: `vega_editors`
3. Guarda.

Queda persistido en `localStorage` (clave `vega.authCollection.v1`) para ese navegador.

#### Mecanismo del schema snapshot

Un editor no puede hacer `GET /api/collections` (PocketBase lo rechaza). ¿Cómo sabe Vega qué colecciones existen y qué campos tienen?

Respuesta: **snapshot de schema cacheado**. Cuando un **superuser** edita el manifiesto desde `/settings` y guarda, Vega persiste el `ContentType[]` (estructura completa del schema en ese momento) en el campo `schemaSnapshot` de la colección `vega`. Un editor luego lee ese snapshot en lugar de introspeccionar en vivo.

**Consecuencia operacional clave**: si el administrador cambia el schema de una colección en PocketBase (añade/quita campos, cambia tipos), DEBE volver a abrir `/settings` en Vega (como superuser) y guardar el manifiesto para refrescar el snapshot — aunque no toque el manifiesto, el guardado actualiza el snapshot. Si no lo hace, los editores verán un schema desactualizado.

**Ejemplo**:

1. Superuser abre `/settings`, edita el manifiesto y guarda → snapshot se actualiza.
2. Editor abre Vega, ve el schema actualizado (desde el snapshot).
3. Administrador añade un campo a una colección en PocketBase admin.
4. Editor abre Vega → sigue viendo el schema antiguo (sin el nuevo campo) hasta que...
5. Superuser vuelva a guardar desde `/settings` (refrescar el snapshot).

### Roles y permisos generales

Vega **NO tiene un sistema de roles propios**. El control de acceso es enteramente delegado a PocketBase:

- **Superuser**: usa `_superusers` (built-in de PB, acceso total).
- **Editor**: usa una colección auth propia + reglas de PocketBase (List/View/Create/Update/Delete rules).

Las reglas de PocketBase pueden referir a `@request.auth.id`, `@request.auth.collectionName`, campos del usuario, etc. — tienes toda la expresividad del motor de reglas de PB.

Ejemplo para editores: solo pueden crear/actualizar/borrar, no ver borrados lógicos ni estadísticas:

```
// En colección 'posts', Create rule:
@request.auth.collectionName == 'vega_editors'

// Update rule:
@request.auth.collectionName == 'vega_editors'

// Delete rule:
@request.auth.collectionName == 'vega_editors'

// List rule (qué ven al listar):
@request.auth.collectionName == 'vega_editors'
```

Ver la documentación de PocketBase sobre [rules](https://pocketbase.io/docs/api-rules-and-filters/) para toda la capacidad disponible.

## Sincronización en tiempo real

Vega NO suscribe a cambios en tiempo real de PocketBase (no usa WebSockets). Cada operación es un request HTTP explícito:

- **Crear/actualizar/borrar**: fetch POST/PATCH/DELETE.
- **Listar**: fetch GET.

Si PocketBase cambia datos mientras Vega está abierto, **la app no lo verá automáticamente**. El usuario debe recargar la página o navegar a otra sección y volver.

Esta es una **decisión de diseño**: simplifica la arquitectura y evita conflictos de sincronización complejos. Si necesitas tiempo real, puedes:

- Agregar suscripción WebSocket a PocketBase (cambio de arquitectura).
- Implementar polling periódico en Vega (refetch cada N segundos).

Ver [Arquitectura](../README.md#estructura-de-la-app) para más contexto.

## Checklist de integración

- [ ] PocketBase 0.26.0 o superior instalado y en marcha.
- [ ] `static/vega.config.json` creado si PocketBase está en otro origen.
- [ ] CORS habilitado en PocketBase para los orígenes de Vega (y otras apps, si las hay).
- [ ] Usuario de prueba creado en PocketBase.
- [ ] Vega puede hacer login con ese usuario.
- [ ] Prueba de lectura: lista colecciones → debe estar vacía o mostrar datos existentes.
- [ ] Prueba de escritura: crea un registro → debe aparecer en PocketBase admin.
- [ ] Si hay múltiples consumidores (Astro + Vega): verifica que ambos ven los mismos datos.
- [ ] Los campos `file` de imagen declaran los tamaños de thumb (`300x300`/`120x120`/`28x28`) que Vega pide (ver [Miniaturas](#miniaturas-thumbnails)).

## Troubleshooting

### Error 401 (Unauthorized) al iniciar sesión

**Causa**: credenciales incorrectas o usuario no existe.

**Solución**: en el admin de PocketBase, verifica que el usuario existe y la contraseña es correcta.

### Error 403 (Forbidden) al crear/editar

**Causa**: las Write rules de PocketBase no permiten la acción.

**Solución**: abre PocketBase admin → colección → Settings → Write rules. Asegúrate de que permiten la acción (p. ej. `@request.auth.id != null` para cualquier usuario autenticado).

### CORS error

**Causa**: PocketBase no permite el origen de Vega.

**Solución**: en PocketBase admin → Settings → CORS origins allowed, añade `https://admin.example.com` (o el origen real).

### La comprobación de actualizaciones falla ("No se pudo comprobar")

**Causa**: esto es aparte de PocketBase — la comprobación opt-in de `/settings` → "Acerca de" contacta `https://api.github.com`, no tu PocketBase. Si aplicas una `Content-Security-Policy` con `connect-src` restringido en el servidor que sirve la SPA, ese origen externo también necesita permiso explícito.

**Solución**: añade `https://api.github.com` a `connect-src` en tu CSP, o ignora el aviso — es opt-in y degrada con elegancia, el resto de la app (que sí depende de PocketBase) sigue funcionando igual. Ver [Comprobación de actualizaciones](CONFIG.md#comprobación-de-actualizaciones-opt-in) en `CONFIG.md`.

### Los cambios en PocketBase no se ven en Vega

**Causa**: Vega no sincroniza en tiempo real.

**Solución**: recarga la página en el navegador o navega a otra sección y vuelve.

### La app funciona en desarrollo pero falla en producción

**Causa**: probablemente PocketBase está en otro origen y CORS no está configurado, o `vega.config.json` no se copió al servidor.

**Solución**:

1. Verifica que `static/vega.config.json` existe en el servidor.
2. Verifica que CORS está habilitado en PocketBase para el origen de Vega.
3. Abre DevTools (F12 → Console) y busca errores CORS.
