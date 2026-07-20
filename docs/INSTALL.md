# Guía de instalación

Cómo instalar y ejecutar Vega desde cero, en desarrollo o producción.

## Requisitos previos

- Node.js 22 o superior
- pnpm 11.11.0 o superior
- PocketBase 0.26.0 o superior (solo para producción; no necesario en desarrollo)

## Desarrollo con backend en memoria

El adaptador **memory** permite desarrollar sin instancia de PocketBase, usando datos en memoria que se resetean con cada recarga.

### 1. Instalar dependencias

```sh
pnpm install
```

### 2. Iniciar el servidor de desarrollo

```sh
VITE_VEGA_ADAPTER=memory pnpm dev
```

### 3. Abrir la app

- URL: [http://localhost:5173/](http://localhost:5173/)
- Email de prueba: **demo@vega.dev**
- Contraseña de prueba: **vega-demo**

### 4. Verificar la instalación

Deberías ver:

- Un login exitoso.
- La pantalla de inicio del admin (lista de contenidos vacía al principio).
- Capacidad de crear colecciones, registros y medios sin backend real.

**Nota**: los datos NO persisten entre recargas. Cada actualización de la página resetea el estado.

## Desarrollo contra PocketBase local

Para probar contra una instancia real de PocketBase en tu máquina:

### 1. Descargar PocketBase

Descarga la versión ≥ 0.26.0 desde [pocketbase.io](https://pocketbase.io/):

```sh
# Ejemplo en macOS (ajusta según tu SO)
./pocketbase serve
```

Abre [http://localhost:8090/](http://localhost:8090/) para acceder al admin de PocketBase.

### 2. Instalar y ejecutar Vega

```sh
pnpm install
pnpm dev
```

Abre [http://localhost:5173/](http://localhost:5173/).

### 3. Configurar el origen de PocketBase

Por defecto, Vega busca PocketBase en `http://localhost:8090` (same-origin). Si PocketBase está en otro host/puerto (p. ej. `https://pb.example.com`), tienes dos opciones:

- **Sin recompilar, desde la propia app**: abre Vega, en `/login` despliega "¿PocketBase en otro servidor? Configúralo", introduce la URL y guarda (recarga sola). Es la vía más rápida para probar contra un PocketBase remoto sin tocar ficheros — ver [Configuración de Vega](CONFIG.md#pantalla-de-conexión-primer-arranque).
- **Horneado en el build**, para que apunte ahí SIEMPRE (sin depender de que cada usuario lo configure a mano): crea un fichero `static/vega.config.json`:

  ```json
  {
  	"backendUrl": "https://pb.example.com"
  }
  ```

  Reinicia el servidor de desarrollo — Vega ahora apuntará a ese origen.

### 4. Acceder a Vega

- Si es la primera vez, crea un usuario en el admin de PocketBase ([http://localhost:8090/](http://localhost:8090/)).
- Inicia sesión en Vega con esas credenciales.

## Producción contra PocketBase

### 1. Build de la app

```sh
pnpm install
pnpm build
```

Esto genera una SPA estática en el directorio `build/`.

### 2. Servir la app

#### Opción A: copiar a `pb_public/` de PocketBase (mismo origen)

PocketBase sirve archivos estáticos desde la carpeta `pb_public/`. Copia todo el contenido de `build/` ahí:

```sh
cp -r build/* /ruta/a/pocketbase/pb_public/
```

Ahora la app está disponible en `http://localhost:8090/` (o tu dominio PocketBase).

#### Opción B: servir desde un origen distinto (CORS)

Si prefieres servir la SPA desde un servidor aparte (Nginx, Apache, etc.), copia `build/` a tu servidor web:

```sh
cp -r build/* /var/www/vega/
```

Luego, crea un fichero `static/vega.config.json` antes de hacer el build:

```json
{
	"backendUrl": "https://pb.example.com"
}
```

Y vuelve a hacer el build:

```sh
pnpm build
```

Después copia `build/` a tu servidor web. Asegúrate de que PocketBase permite CORS desde tu dominio (ver [Integración con PocketBase](POCKETBASE-INTEGRATION.md)).

**Alternativa sin `vega.config.json`**: si prefieres distribuir un build genérico (el mismo zip para cualquier cliente/PocketBase, sin hornear una URL fija), omite este paso y deja que cada persona apunte su Vega al PocketBase que le corresponda desde la propia app, en el primer arranque — ver [Pantalla de conexión](CONFIG.md#pantalla-de-conexión-primer-arranque). Es el escenario típico al distribuir Vega como zip (ver [Despliegue](DEPLOYMENT.md#artefacto-de-distribución-zip)).

**Nota de CORS**: en cualquiera de las dos vías (fichero horneado u override en runtime), si Vega se sirve en un origen DISTINTO del de PocketBase, PocketBase debe permitir explícitamente el origen de Vega en **Settings → CORS origins allowed** — de lo contrario el navegador bloquea las peticiones aunque la URL sea correcta (ver [CORS](POCKETBASE-INTEGRATION.md#cors-cross-origin-resource-sharing)).

### 3. Verificar

Abre la URL donde hayas desplegado `build/`, inicia sesión con tus credenciales de PocketBase, y verifica que puedas navegar por el admin y crear/editar contenido.

## Actualizar a una versión nueva

Vega se distribuye como un **artefacto versionado independiente**, no como código que se copie dentro de tu proyecto. Cada tag `v*` del repo dispara el workflow de release (`release.yml`), que publica un **zip determinista** con la SPA ya construida (la versión va horneada en el build). Actualizar Vega es **reemplazar esa SPA** por la del zip nuevo — nunca se tocan tus datos.

### Principio clave: SPA y datos están separados

- La **SPA de Vega** son ficheros estáticos (`index.html`, `_app/`, …). Es lo único que cambia entre versiones.
- Tus **datos** viven en el directorio `pb_data/` de PocketBase, que es **distinto** del directorio público (`pb_public/` / `--publicDir`). Reemplazar la SPA **no** toca `pb_data/`.
- Como Vega es una SPA cliente puro (no corre migraciones ni lógica de servidor), actualizarla **no migra ni altera datos**. Si una versión nueva exige un cambio de esquema en PocketBase, se indicará en sus notas de release.

### Same-origin (SPA dentro de `pb_public/`)

1. Descarga el zip de la versión deseada desde la [página de releases](https://github.com/fodaveg/vegacms/releases) (verifica el sha256 si lo necesitas).
2. **Conserva** cualquier fichero propio que tengas en `pb_public/` y que NO venga de Vega — en particular un `vega.config.json` real (el que apunta a otro backend): el zip no lo incluye y se perdería si borras a ciegas.
3. Sustituye los ficheros de la SPA (`index.html`, `_app/`, `robots.txt`, `vega.config.example.json`) por los del zip. `pb_data/` no se toca en ningún momento.
4. No hace falta reiniciar PocketBase (solo sirve ficheros estáticos); si acaso, un reinicio es inocuo.

### Origen aparte (servidor web propio)

1. Descarga el zip de la versión nueva.
2. Reemplaza los ficheros del webroot (p. ej. `/var/www/vega/`) por los del zip.
3. Si servías con un `vega.config.json` (para `backendUrl`/CORS), vuelve a colocarlo (o re-genéralo antes del build si compilas desde fuentes).

### Verificar la actualización

1. Abre Vega y haz un **recargado duro** (Cmd/Ctrl+Shift+R): los assets bajo `_app/` llevan hash y se refrescan solos, pero `index.html` puede quedar cacheado por el navegador.
2. Ve a **/settings → «Acerca de»**: debe mostrar la **versión nueva** y el rango de servidor PocketBase soportado. Si sigues viendo la versión anterior, es caché del navegador — repite el recargado duro.

## Build local para pruebas

Si quieres probar la build de producción en tu máquina antes de desplegar:

```sh
pnpm build
pnpm preview
```

Abre [http://localhost:4173/](http://localhost:4173/). **Nota**: `pnpm preview` sirve la build estática tal cual, sin hot-reload.

## Resolución de problemas

### La app da blanco después de abrir

- Verifica que no hay errores en la consola del navegador (F12 → Consola).
- Si usas PocketBase remoto, comprueba que `static/vega.config.json` existe y es válido JSON.
- Asegúrate de que CORS está habilitado en PocketBase (ver [Integración con PocketBase](POCKETBASE-INTEGRATION.md)).

### Error "Sin conexión" después de login

- Verifica que PocketBase está en marcha.
- Si PocketBase está en otro host/puerto, crea/actualiza `static/vega.config.json`.
- Verifica que el navegador puede alcanzar el origen de PocketBase (sin firewall, CORS correcto).

### "Credenciales inválidas" en login

- Verifica que el usuario existe en PocketBase.
- En desarrollo con `VITE_VEGA_ADAPTER=memory`, usa **demo@vega.dev** / **vega-demo**.

### El bundle es muy grande

Vega tiene un presupuesto de bundle de 320 KB (gzip). Si lo superas:

```sh
pnpm build
pnpm check-bundle-budget
```

Este comando reporta el tamaño real. Si está fuera del presupuesto, el build de producción lo rechazará.

## Pruebas

```sh
# Tests unitarios + contrato (contra adaptador memory)
pnpm test

# Tests e2e (Playwright, contra adaptador memory)
pnpm test:e2e

# Contrato contra PocketBase real (versión pineada)
pnpm test:pb

# Contrato contra rango de versiones de PocketBase (0.26.0 y 0.39.6)
PB_VERSION=0.26.0 pnpm test:pb
PB_VERSION=0.39.6 pnpm test:pb
```

Gate completo (la suite que CI ejecuta en cada PR):

```sh
pnpm gate
```

Esto corre: check + lint + test + build + e2e.
