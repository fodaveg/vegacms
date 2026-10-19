# Smoke stock legacy final — APTO dirigido

Sello actual served_cors_smoke.py43d537d35b6dff7435908abfd65b2999067c5d5edae5238bfffb670ff3e177d4; selftestac24693e0798450765396ee49dc126622d13867d266de0f9f6f195113315a998; OPERATE4ee2fc172710834a7a68b9ca3ff159639a3bd6051aa6e7b40316bad8d72b45c4. Hashes3/3 comprobados y delta completo leído. Owner16tests acreditados; no rerun/HTTP/SSH del revisor. Remote079f/wrapper1cbb permanecen aprobados en su propio alcance.

Root acredita stock aplicado y sano; su discovery200 es HTML SPA exacto, no GoJSONendpoint. Contrato docs/PROJECT-CONTRACT-v1.md50–56 permite respuesta discovery ausente/inválida/no soportada con fallback legacy. El smoke previo fallaba únicamente por imponer JSON universal; eso no demuestra bug de producto. Corrección solo harness: stock requiere200text/html y SHA exacto index sellado con GET propio/foreign/null/sinOrigin y política ACAO; declara LEGACY_SPA_FALLBACK. Lumbre nativo conserva200JSON acotado como objeto y FodSTRICT permanece en script independiente6d602. Forma desconocida=>UNKNOWN/STOP, no ampliación de excepción a otros consumidores.

Añade API normal /api/collections/_superusers/records: GET sin credenciales debe401/403 y MIMEapplication/json, ACAO propio y ausencia foreign/null/sinOrigin; esto certifica status/MIME/política, no parseo exhaustivo del cuerpo error ni UI/auth. Preflights de health/discovery/API normal cubren métodos/cabeceras autorizados con own/foreign/null. OPTIONS sin Origin no se exige: no es preflightCORS y podía imponer un falsoSTOP adicional; tres mocks fallan si se solicita. GET sin Origin continúa exigido. Negativos nuevos: hashHTML distinto/ownACAO ausente, nativeHTML aun stubJSONtrue, normalAPI200/MIMEHTML/foreignwildcard. NoRedirect/NoProxy, canonicalindexalias/153assets/paths+peers permanecen.

La aceptación pública necesita ejecución nueva del smoke final por root; no nuevo servidor patch, sourcecommit, imagen, Caddy privado ni gate global a raíz de este ajuste. Los antecedentes abajo conservan cambios anteriores, sus límites y evidencia de recuperación; no usar hashes viejos como sello actual.

---

# Delta público canónico index — APTO

Smoke final b26ff4afaaa9f24c8dae84bd1065d7906b3bdbb3f9b52c67bd58e03693494f04 / selftest546e6e7b647903e204ee4a730d31580843afc5df266bf7df29df404539443dda. Hashes verificados y delta/full smoke más negativo dirigidos leídos. Owner acredita14/14; revisor no ejecutó. Remote079f/wrapper1cbb permanecen intactos.

Root comunica recovery real handle35008 terminal97dd44 EXIT0 CORS_ROLLED_BACK_AWAITING_PUBLIC_SMOKE: mismo ID antiguo5f8, BASE restaurado, healthy estricto/datos intactos. El primer publicrollback152/153 era `/index.html`301 canónico a `/`, conocido por lector público95ebd2; `/`200 HTML con SHA exacto del index sellado. Backend/path/CORS previo/peers root ya acreditados; aceptación pública nueva aún pendiente de ejecutar este smoke.

Nuevo harness mantiene NoRedirect/NoProxy. Solo si único asset fallido es index.html y raíz200 tiene SHA del index manifiesto, realiza petición fija nueva a index y admite301/308 únicamente cuando Location resuelve exactamente HTTPS mismo host `/`, sin query/userinfo. No sigue Location ni exporta valor. MIME raíz text/html ya obligatorio en observe. Registra canonicalIndexAlias para distinguir alias lógico de fichero servido directamente. Negativos foreign redirect y raíz SHA distinta conservan152/153. No patch servidor, no excepción para redirect de otros assets/hosts.

---

# Delta de recuperación 9 Oct 2026 — APTO estático

Sello actual remote_apply.py 079f3cfa28378d551b29893ef4e47d71b6417eb8cd3c0f32ea3133d2fcc21682; run_once.py 1cbbefd6a620c328419ac31ed8a9bb90acdd0818b4cc8e820093e73f99d111f6; smoke498e permanece. Selftest a78f34b098d22a7f1db0228309a85536f15380bbbe65e4e955af03fdbe06dd98. Hashes verificados, delta runtime y ambos tests nuevos leídos íntegros; 695 líneas de protocolo y 544 de tests contabilizadas. Owner acredita 13/13, revisor no ejecutó tests/SSH/Docker.

Causa remota acreditada por root: fase INSTALLED, OLD aún detenido, Compose TARGET propio/env/imagen/mounts/red/aliases/ExposedPorts8090/no HostBindings y snapshotStable verdaderos; NetworkSettings.Ports={} es el único desacuerdo. Nuevo runtime admite ese vacío únicamente con require_healthy=False, container detenido y metadata ExposedPorts exacta más ausencia de bindings. Baseline normaliza únicamente esa representación acreditada, conservando otros campos exactos. Runtime running/healthy sigue exigiendo ports8090:null, health/PBargv e identidad fijos. Negativos leídos: puerto expuesto distinto, binding publicado, runtime running, require_healthy=True y baseline con puerto publicado.

APTO para receta revisada rollback del backup real vega-pb-20261008T220737Z-3510397 desde INSTALLED: guards TARGET/env/imagen/ID antiguo, restore BASE bajo ownership, persistencia de fase/identidad restaurada, nuevo gate y docker start del ID antiguo fijo; strict healthy/PBargv/ports y guards finales. Test positivo de esa rama ejecuta el runtime real mockeando únicamente frontera Docker/filesystem, acredita un solo start del ID esperado. No restore de datos, adopción de container desconocido ni cambio Caddy.

Este APTO de delta sustituye sello c5e0 para próxima receta; no acredita recuperación ejecutada. Root conserva ejecución exclusiva y aprobación del runtime; exige resultado terminal y smoke público. Informes anteriores abajo son antecedentes; no repetir automáticamente apply/rollback tras STOP ni usar fuente vieja con wrapper/lector de otro sello.

---

# Revisión final independiente CORS apply

**APTO estático comunicado antes de ejecución** para remote c5e0dab2cd8d258f7db6c62bee4cc5fc333c9200cbc433cdf50c5e07b05e168f, wrapper 1cbbefd6a620c328419ac31ed8a9bb90acdd0818b4cc8e820093e73f99d111f6 y smoke 498e38433d2805d04d5cdb4bab77961d9c5c7d5080eccc76bd2c7ec7de9708da. Este dictamen sustituye el HOLD del antecedente conservado abajo. No acredita éxito remoto ni autoriza repetir una fase fallida.

Cinco fuentes inventariadas mediante stat/name-status y leídas por bloques iniciales y deltas completos: remote678, wrapper154, smoke263, selftest409, OPERATE127 líneas. Hashes finales 5/5 verificados de nuevo. Selftest0961f7c8db1d6f831096f3e2b561e8ab878a2c3c372809652183f929e3672b03 y OPERATE7f13a3fb6d0b0b827cf09aa5bdb3f819853881ec3049c37906713d256baa9c22. Contexto pertinente: helpers congelados 5d4131/04be908, dos Compose exactos y contrato discovery/API normal. Sin SSH, Docker, builds, ejecución de tests ni edición de fuentes por el revisor.

Los P1 anteriores están cerrados: parent FD O_NOFOLLOW e identidad dev/inode/uid/gid/mode/size/mtime/ctime; checks antes/después de rename, temp inode/dev propio obligatorio; stop/start por ID fijo; imagen/runtime primero y bytes+identidad Compose/env AL FINAL antes create/start, más comprobación post-health. INSTALLED se persiste antes create y CREATED con ID detenido, imagen, dos labels selectivos, command/mounts/puertos/red antes start. Create usa --force-recreate --no-build --pull never. Rollback admite ID propio no saludable; no adopta IDs por labels/fecha ni restaura datos automáticamente. Snapshot quiescido, tar validado y clone TEST byte exacto permanecen. Smoke NoRedirect/NoProxy también en helper, discovery status/MIME/JSON objeto, CORS GET/OPTIONS health+discovery, 153 assets SHA/MIME y peers/baseline frescos. Sin Config.Env, logs, Health.Test/Output ni valores Caddy; env servidor RAM/copia privada, labels únicamente project/service, wrapper JSON cerrado.

Once métodos offline y sus subcasos leídos; owner acredita 11/11, no repetidos por revisor. Negativos cubren pre-stop, post-restore-probe, pre-create, pre-start, contenido igual con inode ajeno y rollback del ID propio no saludable. Sonda local create detenida del owner no demuestra equivalencia de campos de endpoint Docker remoto. Los guards son comprobaciones secuenciales bajo exclusividad de root, no una transacción Docker/filesystem. Creación ambigua o recuperación fallida se detienen para el operador.

**Estado remoto posterior comunicado por root:** handle51402/terminalab34bc exit2 STOP_NEEDS_OPERATOR, backup propio vega-pb-20261008T220737Z-3510397. No equivale a cutover completado. Diagnóstico selectivo nuevo pendiente; no repetir apply ni avanzar Lumbre/Fod a partir de este APTO. Serving requiere smoke remoto posterior. No se certifica UI/auth, overrides de navegador, aislamiento de redes ni nueva imagen Fod. No se reabre rechazo privado Caddy.

---

# Antecedente histórico superado: HOLD del primer sello

# Revisión independiente del protocolo CORS apply

Veredicto actual: **HOLD / cambios requeridos** para remote51f631, wrapper1cbb y smoke28ae. No ejecutar este sello. Root y el owner recibieron hallazgos agrupados; se espera candidato corregido para delta-review. Revisión sin SSH, builds, ejecución de tests ni cambios de fuentes.

Base `.verification/cors-network-adoption-20261008/apply/`. Cinco archivos contabilizados con stat/name-status contra `/dev/null` y leídos completos: remote_apply.py369líneas, run_once.py154, served_cors_smoke.py210, selftest.py144 y OPERATE.md112. Contexto pertinente del helper congelado5d4131: read_private/write_new/backups/archive-validation/clone-volume/volume-budget; helper público04be908: fetch/signatures/manifiestos. No repetir sus gates previos ni editar esos helpers.

| Fuente actual | SHA-256 |
|---|---|
| remote_apply.py | `51f6318f24d129f1ef767aade63942b4ba76dfb6fa91174d25717c9c4340c7ea` |
| run_once.py | `1cbbefd6a620c328419ac31ed8a9bb90acdd0818b4cc8e820093e73f99d111f6` |
| served_cors_smoke.py | `28ae5cc714cd8397051ab9d9915330fbfa407500e8dc62da935a43f3ddfdaf07` |

## Must fix

1. **P1, remote_apply.py:242–243: reemplazo no comprueba identidad propia después de validar.** Compose/env/container se comprueban antes de compose_quiet; un cambio ajeno durante esa validación puede ser sobrescrito. h.write_new hace os.replace por ruta sin expected identity ni parent FD retenido. identity(:51) omite uid/gid/size/ctime; read_private solo impide symlink final. Exigir snapshot root→parent FD O_NOFOLLOW, identidad completa/cuerpo antes y después, atributos preservados y revalidación tras toda validación y justo antes del rename. Negativos: cambio ajeno durante validate, symlink ancestral, chmod/chown/reemplazo de mismo contenido.

2. **P1, remote_apply.py:249 y :325: falta gate fresco de activación forward/rollback.** Instalar/restaurar y luego recrear sin guard final puede activar Compose/env ajenos introducidos en esa ventana. Compartir gate que coteje env, imagen/tag/container/selection, ausencia de otro volume writer y, al final, bytes+metadata propios antes del arranque. No recrear ante drift. Usar --pull never junto con no-build/no-deps. Negativos después de install y después de restore, incluyendo env/Compose drift, deben conservar cambios ajenos y cero recreaciones adicionales.

3. **P1, remote_apply.py:248–256 y :294–312: estado de recuperación no acredita un arranque fallido.** La identidad instalada solo se persiste después de up y runtime saludable; si up falla, el backup queda PREPARED/identitynull y el rollback lo rechaza. También exige health/PB argv al entrar, justamente lo que puede fallar tras el corte. Persistir fase+identidad de archivo antes de operar runtime; acreditar/persistir un ID creado antes de arrancarlo, y recovery guardado desde fase conocida. Un fallo ambiguo de creación debe detenerse para el operador. No atribuir ownership exclusivamente por labels/createdtime de un container observado después del error. La rama old-ID aún detenido puede restaurar su runtime cuando archivos/imagen/selección siguen siendo exactamente propios. Nunca restore de datos automático.

4. **P1, served_cors_smoke.py:92–118: falta discovery en la prueba del consumidor.** Solo /api/health recibe los tests CORS. PROJECT-CONTRACT-v1:1088–1094 exige discovery y API normal. Añadir GET/OPTIONS discovery y comprobar respuesta JSON real, con positivo origen propio, negativo ajeno/null y preflights; HTML SPA200 no acredita discovery. Solo categorías/booleanos/hashes públicos, sin cuerpo guardado.

5. **P1 de alcance HTTP, served_cors_smoke.py:34 y helper público fetch heredado:** urlopen sigue redirects antes de comprobar host final. La validación posthoc no evita una petición fuera de destinos autorizados. Bloquear redirects mediante adapter local del smoke/helper o handler que valide HTTPS/allowlist antes de seguir; no consultar Location ni añadir destinos privados. Mantener helper congelado intacto.

## Lo ya comprobado

Patches deterministas con preimage/target exactos, same image y argv conocido de los dos PB, topology edge/mounts/ports, backup quiescido privado, tar sin traversal/links, clone TEST verificado byte a byte y cleanup propio. El helper conserva presupuesto de snapshot+clone/reserva en filesystem real; sin build/pull deliberado. Env se mantiene en servidor RAM y copia privada, sin exportar selector/secreto ni Docker Config.Env. Wrapper inyecta buffers cuyo SHA validó y rechaza salidas/backupIDs/strings fuera de esquema. OPERATE no mezcla cierre CORS con aislamiento de redes o Fod.

Seis tests offline declarados por el owner fueron leídos; no cubren todavía las carreras anteriores. La revisión final debe leer el delta y nuevos negativos y fijar nuevos hashes. APTO de las fuentes --origins no autoriza ejecutar este protocolo ni sustituye su revisión. No se revisa aquí una imagen Fod nueva ni se reabre ningún rechazo privado de Caddy.
