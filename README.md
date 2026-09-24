# Vega

Vega es el CMS **de** [PocketBase](https://pocketbase.io/), open source (MIT): una SPA estática de
cliente, acoplada a propósito, que es dueña del esquema. Crea colecciones desde la propia interfaz
y descubre automáticamente las que ya existan en la base PocketBase conectada. Ante elegir entre
una solución de CMS genérica y otra que aprovecha lo que PocketBase ya ofrece, gana la segunda.

El admin habla contra PocketBase a través de un **puerto** (`src/lib/backend/`, interfaz
`BackendPort`). No existe para ser multi-backend en producción: su único otro adaptador es el
backend en memoria que usan la demo y los tests de contrato.

**Demo en vivo**: [fodaveg.github.io/vegacms/](https://fodaveg.github.io/vegacms/) (adaptador en memoria, sin backend real).

## Qué hace

- Modelado y autoría de esquema: crea colecciones y añade campos desde la interfaz, y descubre
  automáticamente las colecciones ya existentes en la base PocketBase conectada.
- Formularios de contenido con revisiones (historial y diff) y aviso, al guardar, de que el
  registro cambió en el servidor desde que lo abriste, con opción de ver diferencias, descartar y
  recargar, o guardar solo tus campos.
- Papelera y duplicado de registros.
- Editor visual por bloques, con paleta de tipos de bloque y reordenación.
- Biblioteca de medios con punto focal de imagen y aviso cuando falta el texto alternativo.
- Rol editor y gestión de editores (invitación, alta y baja) desde `/editores`, solo para
  superusuarios; copias de seguridad desde `/copias`.
- Sembrado de sitio pensado para el starter [`vega-astro`](https://github.com/fodaveg/vega-astro):
  campos SEO por página, sitemap y redirecciones.
- Temas configurables y la interfaz en español e inglés (`src/lib/i18n/`).

## Requisitos

- **Node.js**: versión 22 o superior.
- **pnpm**: versión 11.11.0 o superior (gestor de paquetes).
- **PocketBase**: versión ≥ 0.26.0 (solo para producción; no necesario en desarrollo con el adaptador en memoria).

## Inicio rápido

### Desarrollo (con backend en memoria)

```sh
pnpm install
VITE_VEGA_ADAPTER=memory pnpm dev
```

Abre [http://localhost:5173/](http://localhost:5173/) — inicio de sesión con **demo@vega.dev** / **vega-demo**.

### Producción (contra PocketBase)

```sh
pnpm install
pnpm build
# Copia el contenido de `build/` a `pb_public/` de tu instancia de PocketBase,
# o configura CORS + `static/vega.config.json` si están en orígenes distintos.
```

**Ver también**: [Configuración y manifiesto](docs/CONFIG.md) · [Guía de instalación](docs/INSTALL.md) · [Despliegue y montaje](docs/DEPLOYMENT.md) · [Integración con PocketBase](docs/POCKETBASE-INTEGRATION.md).

## Estructura de la app

El admin implementa la interfaz `BackendPort` (`src/lib/backend/`) contra dos adaptadores:

- `src/lib/backend/adapters/pocketbase/` — el backend real, sobre el SDK `pocketbase`.
- `src/lib/backend/adapters/memory/` — backend en memoria para la demo y los tests de contrato,
  no para producción.

Además del PocketBase oficial, hay extensiones Go **opcionales** en `extensions/` que requieren
compilar tu propio binario de PocketBase (la imagen oficial de Vega usa el PocketBase oficial sin
ellas):

- [`vegaauth`](extensions/vegaauth/README.md) — login reforzado: TOTP como segundo factor, códigos
  de recuperación de un solo uso y passkeys (WebAuthn), con límite de tasa por IP.
- [`vegabuild`](extensions/vegabuild/README.md) — dispara una build o un webhook de CI al pulsar
  «Publicar», para sitios prerenderizados que necesitan reconstruirse tras cada cambio.
- [`vegapreview`](extensions/vegapreview/README.md) — emite tokens firmados de corta duración para
  la vista previa de una página, incluida la de un borrador sin guardar.
- [`vegaschedule`](extensions/vegaschedule/README.md) — publica sola, a su hora, una página en
  borrador con fecha de publicación programada; sin la extensión, Vega avisa de que la fecha no
  tiene efecto.

## Desarrollo

```sh
pnpm check     # svelte-check (TS estricto)
pnpm lint      # prettier + eslint + cobertura de temas + objetivos táctiles de 44×44
pnpm test      # vitest (unit + contrato)
pnpm build     # SPA estática (@sveltejs/adapter-static)
pnpm gate      # la suite completa: check + lint + PocketBase real + test + build + e2e
```

## Referencia

- **Contrato P1**: la arquitectura del puerto (`BackendPort`) y el adaptador PocketBase siguen el documento normativo `Vega — Contrato P1`; el test de contrato (`tests/contract/`) verifica su cumplimiento.
- **Arquitectura**: la app es una SPA estática servida desde `pb_public`, sin servidor propio. El
  control de acceso lo decide PocketBase (reglas por colección); la autenticación vive en el
  cliente contra los endpoints estándar de PocketBase, salvo que el proyecto instale la extensión
  opcional `vegaauth`, que la mueve al servidor.

## Licencia

MIT — ver [LICENSE](./LICENSE).
