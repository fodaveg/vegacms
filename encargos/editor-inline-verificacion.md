# Editor inline — reproducción y límites

El cliente CMS conserva v1 y negocia v2 con el sitio. El propietario del borrador
sigue siendo `BlockEditor`; sus pruebas cubren data/record, null, claves huérfanas,
commit/cancel sin backend, permisos y guardar con expectedVersion.

## Checks locales

En CMS usar las dependencias del lock del candidato y `NODE_OPTIONS=--no-experimental-webstorage`
con Node 26: su implementación global de localStorage sin fichero impide que jsdom
instale la suya. La opción no modifica código de producto ni aserciones.

```sh
node_modules/.bin/svelte-kit sync
node_modules/.bin/svelte-check --tsconfig ./tsconfig.json
NODE_OPTIONS=--no-experimental-webstorage node_modules/.bin/vitest run src/lib/visual src/lib/model/block-description.test.ts --maxWorkers=2
```

En el checkout Astro correspondiente: `pnpm check`, `pnpm lint`, `pnpm test`,
`pnpm build`, `pnpm pack:check`. El fixture de build comprueba que `VegaBlocks`
renderiza la anotación del componente Hero y que la página pública no emite puente.
`packages/astro/test/inline-editing.test.ts` ejecuta el módulo de puente real sobre
DOM jsdom; esa prueba no acredita selección, caret o IME de un navegador real.

## Navegador cross-origin con renderer Astro real

`e2e/visual-inline-astro.spec.ts` sirve el HTML y los assets reales de
`fixtures/basic/dist/inline-preview/index.html`, compilados por el gate Astro.
No copia el puente ni lo sustituye por un doble. El registro/valor del fixture se
ajusta al backend memory del CMS; token y backend son dobles, por lo que no certifica
PocketBase ni el endpoint Go de cifrado.

```sh
VEGA_ASTRO_ROOT=/ruta/al/checkout/vega-astro VEGA_E2E_PREBUILT=1 \
  node_modules/.bin/playwright test e2e/visual-inline-astro.spec.ts
```

Sin `VEGA_ASTRO_ROOT`, esta prueba se omite con razón explícita: el CI público del
CMS no tiene necesariamente acceso al checkout Astro. El gate normal conserva sus
pruebas v1 y del cliente, pero NO acredita la integración del renderer real. Con la
variable presente, la ausencia de artefactos falla y no se omite.

En esta máquina Chromium falla incluso con permisos elevados al arrancar
(`bootstrap_check_in`, `MachPortRendezvous` 141). No se repite ese fallo ambiental.
La ejecución cross-origin y la QA visual 1440/390/tableta, claro/oscuro, selección,
foco, IME y pegado nativos siguen pendientes hasta disponer de un navegador viable.

## Correcciones tras revisión

La composición IME conserva el nodo hasta `compositionend` incluso si hay blur o
Guardar desde la barra; el commit final incluye el valor terminado. Guardar sigue
habilitado para reintentar; navegar/reabrir el iframe invalida la petición y su
commit tardío. El timeout de inicio se conserva, la espera de composición no se
corta a los 2 segundos. Los nodos de texto elegibles reciben foco tras negociar v2
y Enter/F2 solicita edición; los controles nativos conservan su comportamiento.
Resolver un conflicto mediante Guardar igualmente o Descartar y recargar limpia
el estado de error del anfitrión. Regresiones focales y recibo de revisión en la
misma carpeta durable de evidencia; QA de navegador sigue pendiente.
