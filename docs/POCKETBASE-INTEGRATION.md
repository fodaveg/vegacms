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

Vega autentica contra usuarios de PocketBase:

1. Abre el admin de PocketBase (`http://localhost:8090/_/`).
2. Ve a la colección `_pb_users_auth_` o **Auth collections** en Settings.
3. Crea un usuario con email y contraseña.
4. En Vega, inicia sesión con esas credenciales.

**Roles y permisos**: Vega NO tiene un sistema de roles propios. Usa los permisos de **lectura/escritura de PocketBase** (Read/Write rules) para controlar quién puede editar qué.

Ejemplo:

- Usuario `admin@example.com`: todos los permisos (Write rules = `@request.auth.id != null`).
- Usuario `editor@example.com`: solo edita `posts` (Write rule en `posts` = `@request.auth.id != null && @request.auth.id == "..."`, si es necesario restringir por usuario específico).

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
