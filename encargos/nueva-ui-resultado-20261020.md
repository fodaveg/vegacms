# Nueva UI — candidato y verificación

Implementación candidata de las dos tareas autorizadas el 20 octubre de 2026.
Pendientes: capturas comparativas y E2E real en navegador. No se declara gate CMS
completo, integración en main, push, despliegue ni publicación de Astro.

## Candidatos

- CMS: rama `feat/nueva-ui-base-20261020`, producto `bdb772a3e40dbae694c9196340d817ca6a185ae9`,
  árbol `4fff6599eb353ed68b56251aac83ac24e5d263c2`.
- Astro: rama `feat/editor-inline-20261020`, `19f7f675a53dacea9d9bce252c41d30928490c84`,
  árbol `a8c9777c9545fb01f710f4b75e99f2f9569d11ad`.
- Bases y alcance: `nueva-ui-20261020.md`; protocolo: `editor-inline-protocol-20261020.md`.
- Worktrees: `/private/tmp/vegacms-nueva-ui-base-20261020` y
  `/private/tmp/vega-astro-editor-inline-20261020`. Se conservan para la QA pendiente.

## Resultado

Inicio y shell usan los roles ampliados de P7 y fuentes autoalojadas. La portada usa
datos reales, permisos, estados recuperables, miniaturas y publicación; las respuestas
de los dos botones no deben hacer retroceder el estado observado. Se reutilizan iconos
existentes. P7 está reconciliado en sus copias de Obsidian y Hebra.

El editor negocia v2 sin perder compatibilidad v1; edita texto plano sobre el mismo
borrador del inspector, valida identidad y secuencia, permite cancelar, y solo guarda
explícitamente. El guardado espera el valor final, incluida composición IME larga.
Astro habilita acceso por teclado tras negociación. Se incluyen descripciones de
bloques, estados de error recuperables y vista previa bajo demanda.

Las revisiones independientes de ambos lotes finalizaron sin hallazgos bloqueantes
después de corregir los problemas de publicación, IME, teclado y errores obsoletos.
Si un iframe no responde al acuse de valor final, Guardar permite reintentar; las
acciones de salida invalidan la sesión. Observar esta espera en la QA real.

## Evidencia

Evidencia local durable:
`/Users/david/code/vegacms/.verification/nueva-ui-20261020/`.
Esta ruta puede no existir en otra máquina. Los comandos permiten reproducirla.

- `pnpm check`: exit 0, cero errores y avisos, `final-check.log`.
- `pnpm lint`: exit 0, `final-lint.log`; incluye formato, ESLint, cobertura de temas y objetivos táctiles.
- PocketBase 0.39.9 comprobado con `node scripts/check-pocketbase-binary.mjs`.
- Suite completa en `bdeda05`: `NODE_OPTIONS=--no-experimental-webstorage node_modules/.bin/vitest run --maxWorkers=2`,
  exit 0; 308 ficheros pasan, uno omitido; 5057 tests pasan, 12 omitidos.
  `combined-vitest.log`. Después solo cambiaron las superficies cubiertas por el siguiente comando.
- En el producto final: el mismo comando Vitest con
  `src/lib/home/home-page.svelte.test.ts src/lib/home/pending.test.ts src/lib/shell/PublishButton.svelte.test.ts src/lib/visual/inline-session.test.ts src/lib/visual/inline-draft.svelte.test.ts src/lib/visual/VisualEditorScreen.svelte.test.ts src/lib/form/RecordBlocks.svelte.test.ts`:
  exit 0, siete ficheros y 206 tests, `final-affected-tests.log`.
- `pnpm test:go`: exit 0 en los cuatro módulos; `combined-go.log`. Sus fuentes y
  dependencias no cambiaron con las correcciones posteriores.
- `pnpm build`: exit 0 sobre producto final, `combined-build.log`.
- `pnpm check-bundle-budget`: exit 0 sobre esa build. Inicial 158.28/200 KB;
  pantalla más cara 81.01/82 KB; total 677.49/1024 KB. Sin ampliación de límites.
  Las fuentes suman 749500 bytes brutos y no están incluidas en este presupuesto JS/CSS.
- Astro: `pnpm gate` exit 0, 132 tests, check/lint, build de fixture y starter,
  assertions y pack. Después solo cambió README y se repitió lint, exit 0.
  `editor-inline/review-receipt.md` y logs adyacentes.

Entorno macOS, dependencias fijadas por lock. El entorno normal usa Node 26.12.0;
los procesos elevados pueden usar Node 22.22.3. La opción de webstorage evita el
conflicto de jsdom. Los recibos de cada lote precisan sus comandos.

## Pendiente verificable

Chromium falla antes de navegar con SIGTRAP, `bootstrap_check_in` /
`MachPortRendezvous` error 141, incluso con ejecución elevada. CUA no ofrece navegador.
No se generaron capturas ni se ejecutó el E2E; la lógica de eventos en jsdom no acredita
caret, foco, IME o pegado nativos.

1. Ejecutar el gate CMS existente en un entorno que pueda arrancar Chromium.
2. Con Astro compilado, ejecutar
   `VEGA_ASTRO_ROOT=/ruta/vega-astro VEGA_E2E_PREBUILT=1 pnpm test:e2e e2e/visual-inline-astro.spec.ts`.
   Usa el renderer real entre orígenes; sin esa variable el test se omite explícitamente.
   La omisión no acredita integración. Véase `editor-inline-verificacion.md`.
3. Comparar Inicio y editor con las láminas a 1440/390, claro/oscuro, tableta,
   densidad compacta, menús abiertos y estados carga/error/vacío admin/editor.
4. Verificar teclado, IME, pegado, cancelar/guardar/recargar, v1/v2 y espera de guardado.

Checklist de diseño: tokens cubiertos por checks; componentes/estados parcial;
responsive parcial; accesibilidad parcial; contenido real cubierto por lógica y tests;
feedback parcial hasta QA nativa; assets cubiertos con fuentes locales y licencias.

La frescura remota de la base Astro no pudo verificarse por autenticación; no asumirla
antes de una futura integración/publicación.

## Conservación

Espacio libre: 172 GiB al inicio, 168 GiB al cierre de verificación (valores redondeados).
Se retiraron solo artefactos regenerables propios del worktree de Inicio y descargas
temporales de fuentes, conservando los binarios versionados y la evidencia.
Se mantienen las ramas, dependencias y build/fixture del candidato para la QA pendiente.
No se retiran worktrees sin integrar ni recursos de otras sesiones.
