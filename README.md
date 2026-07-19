# Vega

Admin y CMS genérico de contenidos, open source (MIT), construido sobre [PocketBase](https://pocketbase.io/) como una SPA estática de cliente. Vega abstrae el almacenamiento detrás de un **puerto** (`src/lib/backend/`) con adaptadores intercambiables, permitiendo reutilizar la interfaz de administración sobre distintos backends sin cambiar la app.

**Demo en vivo**: [fodaveg.github.io/vegacms/](https://fodaveg.github.io/vegacms/) (adaptador en memoria, sin backend real).

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

**Ver también**: [Guía de instalación](docs/INSTALL.md) · [Despliegue y montaje](docs/DEPLOYMENT.md) · [Integración con PocketBase](docs/POCKETBASE-INTEGRATION.md).

## Estructura de la app

Vega no es específico de PocketBase: el admin habla contra un **puerto** (`src/lib/backend/`, sin dependencias) mediante la interfaz `BackendPort`. Los backends concretos son adaptadores intercambiables:

- `src/lib/backend/adapters/memory/` — backend en memoria (tests de contrato + demo).
- `src/lib/backend/adapters/pocketbase/` — backend real sobre el SDK `pocketbase`.

## Desarrollo

```sh
pnpm check     # svelte-check (TS estricto)
pnpm lint      # prettier + eslint
pnpm test      # vitest (unit + contrato)
pnpm build     # SPA estática (@sveltejs/adapter-static)
pnpm gate      # check + lint + test + build + e2e (la suite completa)
```

## Referencia

- **Contrato P1**: la arquitectura del puerto (`BackendPort`) y el adaptador PocketBase siguen el documento normativo `Vega — Contrato P1`; el test de contrato (`tests/contract/`) verifica su cumplimiento.
- **Arquitectura**: la app es una SPA estática sin servidor. Toda la lógica de autenticación y control de acceso vive en el cliente.

## Licencia

MIT — ver [LICENSE](./LICENSE).
