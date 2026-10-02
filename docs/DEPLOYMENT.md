# Despliegue y montaje

Cómo desplegar Vega en distintas configuraciones y bajo subrutas.

## Artefacto de distribución (zip)

Vega se distribuye como un zip de `build/` (lote L5, distribución/onboarding genérico). Hay dos fuentes:

- **Release oficial por tag** (`v*`): `.github/workflows/release.yml` publica `vega-<version>.zip` como asset de un [GitHub Release](https://github.com/fodaveg/vegacms/releases), determinista y verificado en CI (ver [Actualizar a una versión nueva](INSTALL.md#actualizar-a-una-versión-nueva)).
- **Empaquetado local/ad hoc** (`pnpm package`): genera `dist/vega-<version>.zip` a partir de un `build/` que ya tengas en tu máquina.

  ```sh
  pnpm build
  pnpm package
  ```

  El zip contiene el CONTENIDO de `build/` en su raíz (sin carpeta contenedora), listo para descomprimir directamente sobre un destino. `dist/` no se commitea (ver `.gitignore`).

### Las dos vías de despliegue con el zip

1. **Same-origin, dentro de `pb_public/`**: descomprime el zip directamente sobre `pb_public/` de tu PocketBase.

   ```sh
   unzip -o dist/vega-<version>.zip -d /ruta/a/pocketbase/pb_public/
   ```

   Vega usa same-origin sin configuración adicional (nivel 3 de precedencia, ver [Configuración de Vega](CONFIG.md)).

2. **Servidor aparte, apuntando a un PocketBase remoto**: descomprime el zip en tu webroot (Nginx, Apache, un bucket estático…) y apunta a PocketBase con `static/vega.config.json` (antes del build) o, sin recompilar, desde la [pantalla de conexión](CONFIG.md#pantalla-de-conexión-primer-arranque) al abrir la app. En ambos casos, habilita CORS en PocketBase para el origen donde sirvas el zip (ver [Integración con PocketBase](POCKETBASE-INTEGRATION.md#cors-cross-origin-resource-sharing)).

## Despliegue simple (raíz)

La forma más sencilla: copiar la SPA a `pb_public/` de PocketBase.

```sh
pnpm install
pnpm build
cp -r build/* /ruta/a/pocketbase/pb_public/
```

Vega ahora está disponible en `http://pocketbase.example.com/` (raíz).

## Despliegue bajo una subruta

Si necesitas servir Vega bajo una subruta (p. ej. `/admin`), debes:

1. Configurar el **base path** en la app.
2. Asegurar que el servidor web maneja el fallback SPA correctamente.

### Configurar el base path

El base path se controla en tiempo de build con la variable de entorno `VEGA_BASE_PATH` (la lee `vite.config.ts`). **No requiere editar código**: basta definirla al compilar.

```sh
VEGA_BASE_PATH=/admin pnpm build
```

Esto hornea `/admin` en todos los enlaces a assets de la SPA. Copia `build/` a tu servidor web bajo `/admin`.

`VEGA_BASE_PATH` debe empezar por `/` y no terminar en `/` (o quedar vacía para servir en la raíz); un valor inválido aborta el build con un error explícito. El build normal (sin la variable) queda root-relative, idéntico al comportamiento por defecto.

### Fallback SPA (404.html)

Vega es una SPA: el navegador carga `index.html` una sola vez, y toda la navegación sucede en el cliente. Si el usuario intenta acceder a una ruta "profunda" (p. ej. `/admin/login` como URL directa), el servidor web intentará servir un fichero `login` que no existe.

**Solución**: configurar un fallback 404 que sirva `index.html` para rutas inexistentes.

#### Con PocketBase

PocketBase usa automáticamente `index.html` como fallback SPA (está configurado en la app). No requiere cambios.

#### Con Nginx

```nginx
location /admin {
    try_files $uri $uri/ /admin/index.html;
    # Los ficheros estáticos (.js, .css, etc.) se sirven normalmente; el resto cae a index.html.
}
```

#### Con Apache

En `.htaccess` (en el directorio `/admin`):

```apache
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /admin/
  RewriteRule ^index\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . index.html [L]
</IfModule>
```

#### Con servidores estáticos (Vercel, Netlify, etc.)

Estos servicios tienen opciones built-in para configurar el fallback SPA. Consúltalo con la documentación del proveedor.

### Cabeceras de caché

Ni PocketBase (`apis.Static`) ni un proxy delante de él ponen `Cache-Control` por defecto: el navegador decide por su cuenta (heurística HTTP normal) para TODO lo que sirve la SPA. Es el peor reparto posible — el HTML puede quedar cacheado de más (un despliegue nuevo tarda en verse) y los assets con hash en el nombre no se aprovechan del todo (podrían cachearse para siempre, nunca cambian de contenido bajo el mismo nombre). Dos reglas, para cualquier instancia:

1. **`/_app/immutable/*`** (nombre de fichero = hash de su contenido, Vite/SvelteKit): `public, max-age=31536000, immutable`. Un año, sin revalidar nunca — si el contenido cambia, cambia el nombre del fichero.
2. **Todo lo demás que sirve la SPA** (`index.html`, el fallback SPA de cualquier ruta de cliente y `vega.config.json` si existe): `no-cache`. Es contenido sin hash en el nombre — nunca debe quedar cacheado sin revalidar.

**Ojo con el alcance de la regla 2** si tu servidor reenvía también `/api/*` (las extensiones Go de Vega fijan su propio `Cache-Control` en algunas rutas — p. ej. `no-store` en las credenciales de preview de `vegapreview.go` — y una regla demasiado ancha se lo pisaría): excluye explícitamente `/api/*`, y `/_/*` si expones el panel de superusuario de PocketBase por el mismo host.

#### Con Caddy

Ejemplo real en `infra/production/admin.vegacms.com.caddy` (instancia de referencia):

```caddyfile
@vegaImmutable path /_app/immutable/*
header @vegaImmutable Cache-Control "public, max-age=31536000, immutable"

@vegaContent {
	not path /_app/immutable/* /api/* /_/*
}
header @vegaContent Cache-Control "no-cache"
```

#### Con Nginx

```nginx
location /_app/immutable/ {
    add_header Cache-Control "public, max-age=31536000, immutable";
}

location / {
    add_header Cache-Control "no-cache";
    try_files $uri $uri/ /index.html; # fallback SPA, ver arriba
}
```

### Cabeceras de seguridad

Además de HSTS, la instancia de referencia (`infra/production/admin.vegacms.com.caddy`) envía `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` y una `Content-Security-Policy` para lo que sirve la SPA:

```caddyfile
@vegaSpa {
	not path /api/* /_/*
}
header @vegaSpa Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; script-src-attr 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self' https:; frame-src 'self' https:; frame-ancestors 'none'; object-src 'none'; base-uri 'self'"
```

Un `default-src 'self'` a secas **rompe la app**. Lo que necesita, y por qué:

| Directiva                              | Motivo                                                                                                                                                                                                                                                   |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `script-src 'self' 'unsafe-inline'`    | El `index.html` arranca la app con un `<script>` en línea cuyo texto cambia en cada build (nombres con hash de los chunks): no cabe un hash fijo en el servidor. Sigue bloqueando scripts de otros orígenes y `eval`.                                    |
| `script-src-attr 'none'`               | Ningún manejador en línea (`onclick=`, `onerror=`): la app no usa ninguno y, sin esta directiva, el `'unsafe-inline'` de arriba dejaría ejecutar uno inyectado.                                                                                          |
| `style-src 'self' 'unsafe-inline'`     | Atributos `style` de la app y la hoja `<style>` que inyecta el editor de texto enriquecido.                                                                                                                                                              |
| `img-src 'self' data: blob: https:`    | Medios de PocketBase, vistas previas locales antes de subir e imágenes externas que referencia el contenido.                                                                                                                                             |
| `connect-src 'self' https:`            | API y realtime de PocketBase (mismo origen), el aviso de versión opt-in (`https://api.github.com`) y la importación de una colección exportada, que descarga los medios del servidor de origen. Sin importaciones, vale `'self' https://api.github.com`. |
| `frame-src 'self' https:`              | La vista previa y el editor visual cargan el **sitio** del proyecto en un `<iframe>`. Con un sitio fijo, sustituye `https:` por su origen exacto.                                                                                                        |
| `frame-ancestors 'none'`               | Nadie puede enmarcar el admin.                                                                                                                                                                                                                           |
| `object-src 'none'`, `base-uri 'self'` | Sin plugins y sin `<base>` que redirija las rutas.                                                                                                                                                                                                       |

Tres cosas que no son evidentes:

- **No añadas `form-action`** sin incluir el origen del sitio: la vista previa envía su token con un `<form>` POST a ese origen, y `form-action` no hereda de `default-src`.
- **Excluye `/api/*`**: PocketBase pone su propia política a los ficheros subidos, y una regla que la sustituya dejaría ejecutar un HTML o SVG subido como medio. Excluye también `/_/*` si expones el panel de superusuario, que tiene otras necesidades.
- **PocketBase en otro origen que la SPA**: añade ese origen a `connect-src` e `img-src` si no es https, y recuerda que el sitio debe permitir a Vega en su propio `frame-ancestors` (ver [POCKETBASE-INTEGRATION.md](POCKETBASE-INTEGRATION.md)).

Antes de darla por buena en una instancia, compruébala en el navegador con la consola abierta: login, edición con texto enriquecido, subida de un medio, vista previa y editor visual. Un bloqueo aparece como `Refused to … because it violates the following Content Security Policy directive`. Para ensayar sin riesgo, sirve primero la misma política como `Content-Security-Policy-Report-Only`.

### GitHub Pages (proyecto)

La demo pública de Vega usa `VEGA_BASE_PATH=/vegacms` para la demo del proyecto (en `https://fodaveg.github.io/vegacms/`). El workflow `.github/workflows/pages.yml` hace esto automáticamente:

1. Build con `VEGA_BASE_PATH=/vegacms`.
2. Copia `index.html` a `404.html` (GitHub Pages fallback).
3. Sube a Pages.

Para replicar en tu propio repo de GitHub:

```sh
# En tu máquina local o en CI
VEGA_BASE_PATH=/tu-subruta VITE_VEGA_ADAPTER=memory pnpm build
cp build/index.html build/404.html
# Luego sube build/ a GitHub Pages
```

## Convivencia con un sitio anfitrión

Vega es una **SPA cliente puro**: toda la lógica vive en el navegador, no en el servidor. Puedes embeberla bajo cualquier sitio web sin conflictos.

### Patrón: Astro + Vega en el mismo servidor

Ejemplo: tienes un sitio público en Astro en `https://example.com/` y quieres agregar Vega bajo `/admin`.

1. **Astro** genera sitio público en raíz.
2. **Vega** SPA se despliega bajo `/admin/`.
3. **PocketBase** sirve datos a ambos.

Estructura del servidor:

```
/
├── index.html              (Astro)
├── /blog/
│   └── post.html           (Astro)
├── /admin/                 (Vega)
│   ├── index.html          (SPA shell)
│   ├── _app/...            (assets Vega)
│   └── 404.html            (fallback SPA)
└── (archivos estáticos)
```

**Configuración**:

1. **Vega**: compila con `VEGA_BASE_PATH=/admin` (ver sección anterior).

2. **Astro**: no requiere cambios; `fetch('/api/...')` seguirá apuntando a PocketBase mismo origen.

3. **PocketBase**: habilita CORS (ver [Integración con PocketBase](POCKETBASE-INTEGRATION.md)).

### Landmine: prefijo de base en `goto()`

En SvelteKit, `goto('/ruta')` es **root-relative** (ignora el base path). Si Vega está bajo `/admin` y haces `goto('/login')`, te sacará del sitio `/admin` a la raíz `/login`.

Vega soluciona esto en `src/lib/nav/routes.ts`: todos los helpers de navegación prefijan explícitamente `${base}`:

```typescript
// Dentro de componentes Svelte:
goto(`${base}/login`); // Resulta en `/admin/login`, no `/login`.
```

Si añades nuevas rutas, **siempre prefija con `${base}`**:

```typescript
// ✓ Correcto
import { base } from '$app/paths';
goto(`${base}/nueva-ruta`);

// ✗ Incorrecto
goto('/nueva-ruta');
```

## Checklist de despliegue

- [ ] `pnpm gate` (compila, verifica y testea todo).
- [ ] `pnpm build` (genera `build/`).
- [ ] `static/vega.config.json` existe y es válido si PocketBase está en otro origen.
- [ ] Base path configurado si Vega va bajo una subruta.
- [ ] Fallback 404 configurado en el servidor web (si no es PocketBase/Pages).
- [ ] CORS habilitado en PocketBase (si Vega está en otro origen).
- [ ] Copia de `build/` verificada en el servidor (diff, checksums, etc.).
- [ ] App testeda en el navegador: login, navegación, creación de contenido.

## Troubleshooting

### "Not Found" al navegar por rutas profundas

**Causa**: fallback 404 no configurado.

**Solución**: asegúrate de que tu servidor web sirve `index.html` para rutas inexistentes (ver sección "Fallback SPA").

### "Acceso denegado" en CORS

**Causa**: PocketBase no permite el origen de Vega.

**Solución**: habilita CORS en PocketBase (ver [Integración con PocketBase](POCKETBASE-INTEGRATION.md)).

### Assets no cargan

**Causa**: base path no horneado correctamente.

**Solución**: verifica que `VEGA_BASE_PATH` coincida con la subruta real de despliegue. En el build, abre DevTools (F12) → Network y verifica que los assets (`.js`, `.css`) se cargan de URLs correctas.

### La app carga en blanco después del login

**Causa**: probablemente un fallo de red al listar las colecciones de PocketBase.

**Solución**: abre la consola (F12 → Console) y busca errores. Verifica que PocketBase está en marcha y que CORS es correcto.
