# Vega

CMS de contenidos genérico y open source (MIT) sobre [PocketBase](https://pocketbase.io/).

Vega no es específico de PocketBase: el admin habla contra un **puerto** (`src/lib/backend/`,
sin dependencias) mediante la interfaz `BackendPort`. Los backends concretos son adaptadores
intercambiables:

- `src/lib/backend/adapters/memory/` — backend en memoria (tests de contrato + demo).
- `src/lib/backend/adapters/pocketbase/` — backend real sobre el SDK `pocketbase` (Fase 2;
  único lugar del repo donde puede importarse ese paquete, forzado por ESLint).

## Desarrollo

Requiere Node 22 y [pnpm](https://pnpm.io/).

```sh
pnpm install
pnpm dev       # servidor de desarrollo
pnpm check     # svelte-check (TS estricto)
pnpm lint      # prettier + eslint (incluida la frontera de imports)
pnpm test      # vitest (unit + contrato)
pnpm build     # build estático (SPA, @sveltejs/adapter-static)
pnpm gate      # check + lint + test + build, en ese orden
```

## Documento normativo

La Parte 1 (puerto + adaptador PocketBase) sigue al pie de la letra el contrato firmado
`Vega — Contrato P1 (puerto + adaptador PocketBase)`. Lo que ahí dice DEBE/NO DEBE es criterio
de aceptación; el test de contrato (`tests/contract/`) es su verificación ejecutable.

## Licencia

MIT — ver [LICENSE](./LICENSE).
