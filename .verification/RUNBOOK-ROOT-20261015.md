# Red durable Vega: ejecución acotada para release owner

Estado de este documento: **preparado, no autorizado ni ejecutado**. Candidato de trabajo: `.verification/network-durable-candidate-20261009` en el worktree `codex/network-durable-20261009`, base Git `b00186ce5587fcc7323aefdd9d3cdcbfea281750`. Los módulos A/B congelados se cargan desde el checkout principal; el nuevo runner y sus sellos viven en el worktree. No mezclar esos dos árboles ni sustituir el wrapper de B congelado después de publicar el nuevo HEAD.

## Bloqueos comprobados y autoridad

- La reanudación general de Vega autoriza preparar y revisar este candidato, pero el relevo no acredita permiso para **crear `vega-edge`, escribir/versionar `/srv/edge/compose.yml`, conectar Caddy o recrear `vega-pb`**. La aprobación de Fodaveg era para su corte exacto; la lectura de Caddy autorizada era acotada y no cubre esta aplicación. El release owner debe obtener una autorización nueva para esta secuencia concreta cuando estén cerradas las dependencias. `--execute` y un grant local no son autorización.
- En la lectura local de 15 oct, Fodaveg conserva el `STOP_NEEDS_OPERATOR` original en `HEALTH` y el journal `CREATED`; un diagnóstico posterior observa el NEW sano y el smoke público pasa 155/155. El agregado local [Fodaveg effective-state receipt](../../fodaveg-cutover-failure-20261008/.verification/fodaveg-forward-reconcile-20261015/receipt.json) cierra **solo** esa evidencia efectiva y tiene SHA-256 `ac3334c07a2f95db384a8422987a79d109539cbc9f904fc6f3a015b9cd7e80c1`. Su baseline público es histórico del 9 oct, no una captura fresca inmediatamente anterior al corte. Los smokes actuales de Vega y Lumbre pasan 153/153 y sus tuplas aplicadas constan en [dependencies.cors-prepared-20261015.json](dependencies.cors-prepared-20261015.json), todavía `DRAFT`; la procedencia exacta está en [sources](dependencies.cors-prepared-20261015.sources.md). Falta el preflight Caddy final y revisión root antes de crear el input `REVIEWED`. No convertir un `CORS_APPLIED_AWAITING_PUBLIC_SMOKE`, un rollback o un draft en PASS por sí solo.
- La nueva corrección de rollback está probada offline (13 tests) y el B congelado (5 tests), con hashes en `SHA256SUMS`. Falta revisión independiente del árbol corregido. El SHA-256 actual de `seals.json` es `68817475ef00b9b739141f471e807a5c2c88aad4300d4767d16cbc6e4f390bae`; el de `SHA256SUMS` es `5670cf430e91bb1e4e2489a6275a457937ab46422defa5a8e3175ae8b6ea70ba`. Recalcularlos y cotejar el veredicto antes de operar; no reutilizar si cambia cualquier byte.
- El lector phase2 sellado se ejecutó el 15 oct por root, salida `PROJECTED` en `cors-network-adoption-20261008/network-next/edge-phase2-current-read-20261015.json` (SHA-256 `f7435781e74d0433c005fcc6676f6499fb10263fc7cfdba68e9dd8e7303ed538`): Compose base y fuente EXACT, Git `EXACT_CLEAN` HEAD `2c3034b82efc070d5b747de8322936e3dbcc7459`, blob HEAD/índice/working `03bae62b20f3c9b7bba8661091b688fb4afbb2cf`, Caddy ID/imagen/running correctos en `edge`, y `vega-edge` `MISSING_CONFIRMED`. Es una observación puntual; A repite sus guards antes de escribir. Además de esa evidencia, medir presupuesto/capacidad del volumen y Caddy config preflight final. B exige Vega CORS ID `007b755b8de76195d857181ce985a9522fe71c5d2941a2c1597b310d12d56881`, Compose `11593d1da51e580f988058bfac8288194eaeb7697ac7db2f6926815f8d14dcde`, imagen OCI `sha256:dd978b8d23081d2e3c69ebf6ef8ff4599a1acdd3f38dc559ae6fa379e46449b4`. Deriva implica STOP y nuevo candidato; no repinar a ojo.

## Preparar y sellar dependencias, sin efecto remoto

Tras tres aplicaciones CORS servidas y su smoke del consumidor real, conservar para cada una el recibo exacto PASS, su SHA-256, `containerId`, `imageId` y SHA-256 del Compose **actual** seleccionado. Para `caddy` conservar el preflight final PASS y su SHA-256 junto al ID/imagen seleccionados. Los campos se cotejan con los productores y la observación fresca, no se rellenan desde `dependencies.draft.json`. La estructura cerrada que acepta `remote_dependencies.validate` es:

```json
{
  "schema": 1,
  "state": "REVIEWED",
  "cors": {
    "vega-pb": {"status":"PASS","containerId":"64 hex","imageId":"sha256:64 hex","composeSha":"64 hex","receiptSha":"64 hex"},
    "lumbre-admin-pb": {"status":"PASS","containerId":"64 hex","imageId":"sha256:64 hex","composeSha":"64 hex","receiptSha":"64 hex"},
    "fodaveg": {"status":"PASS","containerId":"64 hex","imageId":"sha256:64 hex","composeSha":"64 hex","receiptSha":"64 hex"}
  },
  "caddy": {"status":"PASS","containerId":"ae97fc0c57fbe4c3a97f5dce15dfc9da92f33f527b60d95c3f74de9d2a160a7a","imageId":"sha256:5f5c8640aae01df9654968d946d8f1a56c497f1dd5c5cda4cf95ab7c14d58648","preflightSha":"64 hex"},
  "source": null
}
```

Guardar el JSON revisado como `dependencies.reviewed.json` **directamente** en el directorio del candidato, sellarlo con `shasum -a 256 dependencies.reviewed.json` y conservar junto a él las rutas/hashes de los cuatro recibos base. `remote_dependencies.guard` vuelve a medir ID/imagen/Compose de los tres PB al publicar, y de Lumbre/Fod durante B; el adapter de B controla Vega. Para el input publicado copiar exactamente esas cuatro dependencias vigentes y cambiar solo `source` a:

```json
{"backupId":"backupId de A","head":"head de durable-publish","parent":"parent de durable-publish","composeSha":"composeSha de durable-publish","networkId":"networkId de durable-publish","receiptSha":"SHA-256 del JSON durable-publish"}
```

El nuevo archivo se llama `dependencies.published.reviewed.json`, se revisa y se sella de nuevo. Su `source` debe concordar con el recibo real `CADDY_SOURCE_DURABLE` y los guardas del backup, no con un HEAD calculado antes de publicar. Antes de cada invocación comprobar los hashes de dependencias y `seals.json`; el runner carga los diez módulos por SHA y valida el JSON cerrado. Cualquier cambio de candidato o recibo invalida el sello anterior.

## Secuencia root, serial, después de autorización y revisión

Usar nombres de salida **nuevos** terminados en `.json`; los wrappers rechazan sobrescritura. Los valores en mayúsculas son los reales extraídos de recibos sellados, nunca IDs supuestos. Ejecutar cada comando desde el directorio indicado y comprobar su `exit_code` y `status` antes de pasar al siguiente. Los comandos siguientes no se han ejecutado aquí.

1. La proyección de solo lectura actual ya consta en el recibo phase2 anterior. No repetirla sin una deriva o una nueva frontera temporal que la haga necesaria. Si se requiere una nueva lectura, desde `$HOME/code/vegacms/.verification/cors-network-adoption-20261008/network-next` y con **nombre de salida libre**:

   ```sh
   python3 -B run_edge_phase2.py --execute --source-sha256 13427c4798645a1fd2701b169a0cb7776166d6789f33d6090ec36e7db28f516f --out edge-phase2-NUEVO.json
   ```

   Debe devolver `PROJECTED`, `composeBaseMatches=true`, `composeSourceClass=EXACT`, `gitClass=EXACT_CLEAN`, ID/imagen Caddy correctos y `networkClass=MISSING_CONFIRMED`. Si no, STOP. El propio A vuelve a comprobar frescura inmediatamente antes de escribir.

2. En el mismo directorio, fase A congelada. Su resultado positivo es `CADDY_ATTACHED_PARTIAL`; registrar `backupId` y `networkId` reales. No recrea Caddy.

   ```sh
   python3 -B run_edge_apply_candidate.py --execute --mode apply --source-sha256 04bc97dddc7528e0f831d0d8ccea086c2149b838a915892bc2f10e61d16ba841 --out edge-partial-apply-NEW.json
   ```

3. Desde `$HOME/code/vegacms/.verification/worktrees/network-durable-20261009/.verification/network-durable-candidate-20261009`, publicar **solo** el Compose seleccionado de Caddy con el input `source:null`. Resultado requerido: `CADDY_SOURCE_DURABLE`; guardar `head`, `parent`, `composeSha`, `networkId` y SHA-256 del recibo. No hace push ni recrea Caddy.

   ```sh
   python3 -B run_candidate.py --execute --action durable-publish --backup-id EDGE_BACKUP_REAL --manifest-sha256 MANIFEST_SHA_REVISADO --dependencies dependencies.reviewed.json --dependencies-sha256 SHA_DEPENDENCIES_REVISADO --out durable-publish-NEW.json
   ```

4. Tras sellar `dependencies.published.reviewed.json` con el recibo anterior, comprobar fuente y stock antes de mutar PB. Resultados requeridos: `DURABLE_SOURCE_VERIFIED` y `NETWORK_READY_FOR_REVIEW`. Revisar presupuesto devuelto por stock-check y contrastarlo con espacio actual y ausencia de otra build/suite pesada.

   ```sh
   python3 -B run_candidate.py --execute --action durable-check --backup-id EDGE_BACKUP_REAL --manifest-sha256 MANIFEST_SHA_REVISADO --dependencies dependencies.published.reviewed.json --dependencies-sha256 SHA_DEPENDENCIES_PUBLICADO --out durable-check-NEW.json
   python3 -B run_candidate.py --execute --action stock-check --backup-id EDGE_BACKUP_REAL --manifest-sha256 MANIFEST_SHA_REVISADO --dependencies dependencies.published.reviewed.json --dependencies-sha256 SHA_DEPENDENCIES_PUBLICADO --out stock-check-NEW.json
   ```

5. Aplicar B solo con ambos checks y presupuesto actuales en verde. Resultado positivo `NETWORK_APPLIED_AWAITING_PUBLIC_SMOKE` aporta el `backupId` de stock; aún no certifica el corte servido.

   ```sh
   python3 -B run_candidate.py --execute --action stock-apply --backup-id EDGE_BACKUP_REAL --manifest-sha256 MANIFEST_SHA_REVISADO --dependencies dependencies.published.reviewed.json --dependencies-sha256 SHA_DEPENDENCIES_PUBLICADO --out stock-apply-NEW.json
   ```

6. Conservar recibos del mismo candidato para: resolución y salud de `vega-pb:8090` desde Caddy, Caddy en `edge` y `vega-edge`, PB solo en `vega-edge`, red propia sin miembros ajenos, ausencia de puerto PB publicado, viejo peer de `edge` sin acceso directo a PB, 153/153 assets, SPA/API/health y CORS propio/ajeno/`null`/sin Origin. El README de producción exige ejecutar primero el smoke **global** `/srv/edge/scripts/smoke.sh` y después el específico Vega. Root obtuvo sus bytes solo lectura en `edge-global-smoke-source-20261015/smoke.sh` (SHA-256 `0362bbe1c4b022135cff039d52271b0ff1da473b7ae65117ed962556832b5873`). El [launcher metadata-only](edge-global-smoke-launcher-20261015/BRIEF.md) conserva sus 19 checks y cambia únicamente el `docker inspect` descartado por `--format '{{.Id}}'`, con otro SHA sellado; un PASS suyo acredita esa variante, no ejecución literal del SHA canónico. Usarlo una vez antes del corte como baseline y repetir tras B para el resultado global servido; los smokes públicos presentes no lo sustituyen. Reutilizar `apply/served_cors_smoke.py` con un baseline nuevo del mismo estado antes de B y `--stage after` después de B, usando su SHA actual como `--script-sha256`; ese script comprueba los hosts públicos, assets y CORS, pero **no** sustituye el smoke global ni resolver/topología Docker. No declarar PASS si falta cualquiera de esas pruebas.

## STOP y vuelta atrás

- Antes de publicar, solo A puede revertirse mediante su `run_edge_apply_candidate.py --mode rollback --backup-id EDGE_BACKUP_REAL`, siempre que su guard exacto lo permita. Después de publicar, no reejecutar A/B congelados: sus guardas exigen HEAD antiguo.
- Si B alcanzó un backup propio y hay que restaurar PB, usar el nuevo runner con `--action stock-rollback --backup-id EDGE_BACKUP_REAL --stock-backup-id STOCK_BACKUP_REAL`, el manifiesto y dependencias **publicadas** exactas, salida nueva; exigir `NETWORK_ROLLED_BACK_AWAITING_PUBLIC_SMOKE` y repetir smoke. La recuperación mantiene volumen y datos vivos y deja Caddy en ambas redes.
- `durable-rollback-source` solo invierte la fuente Git cuando la red propia contiene Caddy solo, antes de B o después de su rollback sano. Usa el mismo runner con `--backup-id EDGE_BACKUP_REAL`, manifiesto/dependencias publicados y salida nueva. No desconecta Caddy ni borra la red; el retiro físico necesitaría otro procedimiento y autoridad.
- Un timeout, salida inválida o `STOP_*` implica reconciliar el estado y los backups privados seleccionados. No relanzar la operación por intuición ni tratar un recibo de STOP como permiso para la siguiente fase.

Pregunta de autorización para David **solo después** de que la revisión del candidato corregido, los tres PASS CORS y el preflight Caddy final estén enlazados: «¿Autorizas este corte concreto de la red de Vega en `/srv/edge` y `/srv/vega`: crear `vega-edge`, añadirla y versionarla en el Compose seleccionado de Caddy sin recrear Caddy, conectar el Caddy actual, recrear solo `vega-pb` conservando `vega_data`, comprobar todos los sitios y aplicar el rollback acotado si falla?». Enlazar en esa pregunta este runbook, el veredicto, el manifiesto y los cuatro recibos reales; no crear un grant anticipado.
