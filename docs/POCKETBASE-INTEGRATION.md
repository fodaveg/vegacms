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

## Miniaturas (thumbnails)

PocketBase genera y sirve miniaturas **solo para los tamaños declarados explícitamente** en la opción **Thumb sizes** (`thumbs`) de cada campo `file`. Si Vega pide un tamaño no declarado, PB responde **200 con el fichero original a tamaño completo** (sin error, sin imagen rota) — un coste silencioso de ancho de banda y memoria que no se detecta a simple vista.

Vega solicita estos tamaños (todos recorte/crop):

- `300x300` — galería `/media`.
- `120x120` — widget de subida del editor.
- `28x28` — miniatura de la celda de listado.

La colección `vega_media` que Vega bootstrapea **ya declara estos tres tamaños automáticamente** (vía el JSON de importación de `/media`), así que su galería funciona sin configuración adicional.

**Para tus colecciones de contenido propias** con campos `file` de imagen que edites o listes en Vega: declara en PB (Collections → tu colección → campo `file` → Thumb sizes) al menos `300x300` y `28x28` (y `120x120` si editas ese campo con el widget file), o Vega mostrará el original completo en cada miniatura. Vega **no** añade thumbs retroactivamente a colecciones que no creó.

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

### Los cambios en PocketBase no se ven en Vega

**Causa**: Vega no sincroniza en tiempo real.

**Solución**: recarga la página en el navegador o navega a otra sección y vuelve.

### La app funciona en desarrollo pero falla en producción

**Causa**: probablemente PocketBase está en otro origen y CORS no está configurado, o `vega.config.json` no se copió al servidor.

**Solución**:

1. Verifica que `static/vega.config.json` existe en el servidor.
2. Verifica que CORS está habilitado en PocketBase para el origen de Vega.
3. Abre DevTools (F12 → Console) y busca errores CORS.
