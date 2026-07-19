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

Por defecto, Vega busca PocketBase en `http://localhost:8090` (same-origin). Si PocketBase está en otro host/puerto (p. ej. `https://pb.example.com`), crea un fichero `static/vega.config.json`:

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

### 3. Verificar

Abre la URL donde hayas desplegado `build/`, inicia sesión con tus credenciales de PocketBase, y verifica que puedas navegar por el admin y crear/editar contenido.

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
