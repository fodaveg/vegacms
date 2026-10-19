# Continuar Vega en Fedora — 19 octubre 2026

Encargo de David: subir todas las ramas a medias para poder continuarlas en Fedora. Esta rama conserva el relevo y evidencias; cada candidato sigue en su propia rama. Los checkpoints son WIP, sin gate ni despliegue nuevos. Main local y remoto de partida: `ce0a3d44c9a6f36fda295ca44750d0227777b883`.

## Arranque

```sh
git fetch origin
git switch --track origin/wip/fedora-handoff-20261019
```

Leer este documento y después el relevo específico antes de retomar trabajo. Si una rama ya existe en Fedora, inspeccionar su estado antes de cambiarla; no sobrescribir cambios locales. Para abrir otro candidato, usar su rama remota en un worktree propio.

## Trabajo de infraestructura que estaba sin commit

Se copiaron los archivos sin commit a ramas nuevas, conservando intactos los worktrees e índices originales del Mac. Cada copia se comparó mediante SHA256. Sus bases históricas pueden quedar detrás de main: revisar los deltas antes de integrar.

| Rama para continuar | Commit | Archivos preservados | Base original |
| --- | --- | ---: | --- |
| `wip/fedora-caddy-20261019` | `8652c38f458237a8e92e4d1854f0efad1bb3bedc` | 148 | `a51b8521e1eeef52a522d2a065b36a03578c0c3a` |
| `wip/fedora-fodaveg-20261019` | `2dee6deaf9ae5a3a444b275198400d445ecc2757` | 19 | `a51b8521e1eeef52a522d2a065b36a03578c0c3a` |
| `wip/fedora-network-20261019` | `be3bc37c0101c5ca8e3564c0275d3bea6fee1ab8` | 30 | `b00186ce5587fcc7323aefdd9d3cdcbfea281750` |

Caddy: `.verification/caddy-global-logs-20261015/`, las variantes posteriores y `infra/production/README.md` están en `wip/fedora-caddy-20261019`. Parte del borrador documental puede haber sido sustituida en main: cotejar antes de usarlo. La copia preserva también scripts de verificación de adopción/serving.

Fodaveg: `.verification/fodaveg-forward-reconcile-20261015/` está en `wip/fedora-fodaveg-20261019`. El relevo del 15 octubre documenta una operación consumida cuyo journal quedó distinto del estado observado; no repetir APPLY a partir del relevo.

Red: `.verification/RUNBOOK-ROOT-20261015.md`, `.verification/network-durable-candidate-20261009/` y los borradores de dependencias están en `wip/fedora-network-20261019`.

## Otras ramas conservadas con sus commits exactos

Esta selección incluye las 16 ramas locales cuyos tips no eran ancestros de main; esa comparación no demuestra que todos sus cambios sigan pendientes, pues algunos pueden haberse integrado mediante otra historia. Todas se suben con sus nombres originales, sin forzar referencias.

| Rama | Commit |
| --- | --- |
| `codex/caddy-global-logs-readme-20261015` | `77177f62b858d61c93ce163775348660294c2ade` |
| `codex/import-origins-20261007` | `3c577f07c6169b8b51b6295973e5832121e984d6` |
| `codex/l15-release-url-20261007` | `f6e915f305adcfc6f67a2e23456ca302ac2a647c` |
| `codex/visual-desktop-20261007` | `faa1ad7241818cb0323c7ea3f0fa31e51332fb02` |
| `codex/webhook-status-20261007` | `52c09a9007f5c951afaa4006cb14fe2ad772648f` |
| `design/l10-ink2-comparison-20261007` | `223d67ecd9c235165392f5c7946845983f3ae6b3` |
| `design/l12-relation-create-20261007` | `5cb85a087514ce0226aba75a3c65059f6e905115` |
| `design/l13-share20261007` | `9cb49522be1f6a5f2cefb18d6ec3f8eed923c45f` |
| `feat/trash-history-onboarding-20261007` | `c3244ba11595de860031805d9cd271e3bec70a18` |
| `feat/ui-publish-icons-20261007` | `64be058982b628717561ecca9dbced2a9ff936ac` |
| `fix/config-base-path-20261018` | `13b04bffa00d88647e892e37db4595e0671d70e4` |
| `fix/l14-internal-exports-20261007` | `3e56e147d9d8e5e7e6393624baeb4c5f5f692519` |
| `fix/l15-security-focus-20261007` | `971a68da2ae1a4bfbeb1ce5fa8963329fbd400d7` |
| `tanda/vegaauth` | `d00a29e5241e394554f5750c567ec84f2a062228` |
| `test/contact-smtp-tls-20261007` | `76a27a4fe4ec3efb1175111e59b5cc142bf6ec78` |
| `test/l9-real-network-20261007` | `1798e95242c805d4d3f0ed5ec14b1c5b6eec7233` |

## Relevos y evidencia en esta rama

- `.verification/backlog-r10-consolidated-20261007/CONTINUACION-20261015.md`: relevo histórico más reciente del lote de infraestructura; leer después `HANDOFF-PAUSA-20261009.md` solo para antecedentes. Sus SHAs, estado de producción, autorizaciones y presupuestos son históricos; verificarlos antes de operar.
- `.verification/config-base-20261018/RECEIPT.md` y `root-review.md`: evidencia focal del candidato `fix/config-base-path-20261018`. Conserva 108 tests de sesión y checks focales históricos. Gate completo, build, HTTP/E2E bajo `/admin`, integración y despliegue seguían pendientes.
- `.verification/release-adoption-plan-20261008/`, `.verification/cors-network-adoption-20261008/`, `.verification/image-only-delivery-20261008/`: propuestas, revisiones, recetas y recibos históricos necesarios para continuar.
- `.verification/caddy-bare-backslash-validator-20261015/`, `.verification/fodaveg-diagnostic-20261015/`, `.verification/edge-global-smoke-source-20261015/`: candidatos y sondas conservados.
- Evidencias de las ramas de importación, red, publicación, diseño, historial y editor visual: sus directorios originales bajo `.verification/`.
- `design/mockups/2026-10-01-ajustes-y-sembrado/capturas/`: capturas de mockups que estaban sin seguimiento en main.
- `.verification/fedora-transfer-20261019/preservation.json`: inventario de las copias y hashes; `original-branches.json` y `checkpoints.json`: correspondencia exacta de ramas y candidatos.

## Límites de la transferencia

No se ejecutaron suites, builds, despliegues ni operaciones en los servidores de producción. Los scripts y recibos conservan sus rutas e identidades históricas de macOS/producción; revisarlos y adaptar solo las rutas locales necesarias en Fedora. La subida por sí sola no autoriza ni acredita aplicar una operación remota.

No se copiaron imágenes Docker/archivos tar, ZIP de trazas, bases de datos de prueba, dependencias, bytecode ni entornos de ejecución regenerables. Esos recursos originales siguen en el Mac. Las ramas antiguas ya contenidas en main y los registros de worktrees cuyos directorios no existen se dejaron intactos.

Los avisos de whitespace procedentes de patches/logs históricos se conservan sin reescribir la evidencia. Esto es un checkpoint para continuar, no una certificación del producto.

Disco inicial observado: aproximadamente 13 GiB libres. Presupuesto de preparación inferior a 150 MiB, sin builds. Se conservan las cuatro copias de trabajo nuevas mientras estos candidatos estén pendientes de integración; no se limpió material ajeno. El cliente SSH temporal usado con la clave de fodaveg se retira después de verificar la subida.
