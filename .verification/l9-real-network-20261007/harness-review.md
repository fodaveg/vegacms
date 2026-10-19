# L9 — revisión independiente del harness de medición

2026-10-07. **Cambios requeridos antes de ejecutar: un bloqueo de la semilla y una sincronización incorrecta de la carrera del rail.** Son problemas del harness, no hallazgos nuevos del producto.

## Hallazgos accionables

### 🔴 P1 — El dataset64KiB no cabe en el campo PB creado

Ubicación: `tests/contract/pb-harness/l9-network-seed.ts:52` y `:153`.

El helper `text('body')` crea un TextField sin max explícito; resetL9 envía65536caracteres a ese campo para las primeras diez páginas. En la dependencia real PBv0.39.9 local, `core/field_text.go:92` documenta el default5000 y `:244` lo aplica cuando Max=0. La primera creación de página del reset devuelve400; seedL9 no captura esa excepción. Esto detiene beforeAll del smoke/admin y también el escenario visual, que reutiliza la misma semilla, antes de recoger mediciones.

Reproducción mínima que debe ejecutar el autor cuando tenga turno: crear la colección con la configuración actual, intentar crear una página con65536'x', observar rechazo de validación de body. Esta revisión confirma la causa por el código de la semilla y el validador PB local; no ejecutó esa reproducción.

Arreglo sugerido: declarar para body un max explícito >=65536 y mantener el dataset64KiB del criterio de búsqueda. Reducir el payload para que pase cambiaría ese criterio. Cierre: semilla real exitosa y verificación del tamaño guardado, seguida de la sonda discriminante, antes de construir el before.

### 🔴 P2 — El toast anterior puede liberar la respuesta LIST antes del segundo PATCH real

Ubicación: `scripts/l9-measure/admin.spec.ts:127`–`:130`, consumidor de carrera `:261`–`:264`.

save() hace click y espera cualquier toast `Guardado.` visible. En la carrera ya existen toasts de guardados anteriores (Rail/Reordered y después Interim). El helper no identifica una confirmación nueva, el PATCH concreto o la terminación del snapshot. Así, save(Latest) puede resolver con el toast anterior mientras Latest todavía espera GET de preimagen/PATCH. El finally libera en ese instante la LIST vieja. El escenario deja de garantizar la condición que pretendía medir: dos escrituras posteriores realmente confirmadas antes de recibir la respuesta retenida.

Reproducción mínima dirigida: conservar visible el toast de Interim, retrasar la escritura Latest real en el proxy, invocar save(Latest), comprobar que held.release ocurre sin haber terminado el PATCH Latest. Mantener el cuerpo y respuesta de PB, sin sustituirlos por un mock. La causa se confirma por lectura del helper; no se ejecutó la sonda.

Arreglo sugerido: armar antes de cada click la espera de la respuesta PATCH real del id esperado y comprobar su éxito; esperar también la finalización de guardado/snapshot según el contrato antes de liberar la LIST. El wait no debe depender de un toast previamente visible. Registrar la confirmación de ambos PATCH antes de held.release proporciona el criterio de cierre. Conservar la respuesta LIST real ya retenida, que está correctamente obtenida de PB.

Ambos hallazgos se enviaron a la raíz durante la revisión. El autor conserva los fixes.

## Inventario y alcance

Worktree `/private/tmp/vegacms-l9-measure-20261007`, rama indicada `test/l9-real-network-20261007`. Se empezó por git status y diff --stat/--name-status acotados. Las fuentes eran untracked: además del directorio scripts y el test Go apareció `tests/contract/pb-harness/l9-network-seed.ts`, consumidor directo imprescindible, que se incluyó. Se contabilizaron mediante diff --no-index contra/dev/null. **9/9ficheros nuevos,1310líneas, leídos completos por bloques**:

1. `scripts/l9-measure/README.md` —64líneas.
2. `scripts/l9-measure/admin.spec.ts` —444.
3. `scripts/l9-measure/astro-consumer.mjs` —45.
4. `scripts/l9-measure/playwright.config.ts` —22.
5. `scripts/l9-measure/transport.ts` —233.
6. `scripts/l9-measure/tsconfig.json` —11.
7. `scripts/l9-measure/visual.spec.ts` —242.
8. `extensions/vegapreview/l9_network_server_test.go` —73.
9. `tests/contract/pb-harness/l9-network-seed.ts` —176.

Se leyó completo el plan `/private/tmp/vega-l9-real-network-measurement-plan-20261007.md`. No se cargaron datos, builds ni copias históricas generadas de .astro en .network-measure. El worktree before `/private/tmp/vegacms-l9-before-20261007` se observó limpio, HEAD exacto `dae1c8c1e90db2567efe3ea0ecaf5ce5f09ac193`.

Grafo primero para descubrir fixture/PB y contexto de renovación. Para símbolos nuevos o resultados insuficientes se leyó fuente conocida acotada: estado actual de renovación visual y validador TextField de la dependencia PB local. No se hizo auditoría amplia del producto ni se escribió un índice compartido.

## Cobertura real preparada y límites

- El runner importa Playwright directamente, configura adaptador pocketbase y overrides runtime presentes en ambos candidatos; no importa e2e/fixtures ni el puerto memory. Sirve una build estática existente, sin construirla. PB y BD son instancias efímeras propias; semilla/truncados usan ese objeto de fixture, fuera de las ventanas del proxy.
- El proxy obtiene status y body de PB real. Para la carrera captura una respuesta LIST completa ya recibida de PB y espera antes de remitirla al navegador; no fabrica el contenido. El404 discriminante también se solicita a PB real y forward termina con res.end. Errores de transporte terminan en502 y se marcan failed; no quedan assertions de fixture que dejen el socket abierto.
- El collector elimina Authorization, cuerpos, raw query y tokens. Registra ruta saneada, método, fields, bytes de cuerpo decodificado y estados; trace/screenshot/video están desactivados. Browser y proxy se contrastan por método/ruta tras la ventana. OPTIONS queda excluido en ambos resúmenes: los conteos son de peticiones de aplicación, no un total físico que incluya preflights. Bytes decodificados no son transferencia comprimida.
- Las ventanas admin esperan networkidle antes de reset y después de la acción, y tres iteraciones producen first/warm por superficie. El before común no acredita por sí solo la regresión intermedia del rail d74; el README/plan conserva ese límite. Igualdad de conteos no invalida mejoras de payload/concurrencia/DOM; el harness devuelve observaciones de esas superficies sin imponer cifras originales7/4 o50/1.
- Se preparan relación50 y variante ListRule/GET visible, búsqueda con payload64KiB, save/revisión, rail fuera de primera página/carrera, reorder/delete/import, trash201 y editores/correo sin envío externo. La semilla bloqueada impide hoy ejecutarlos. Cantidades como resolvedChips cuentan nodos y no prueban por sí solas todos los títulos; latestVisible/peerPreserved/tableRetained son observaciones reportadas, no asserts de aceptación. La raíz debe evaluar los valores concretos y no equiparar exitverde del harness a todos los criterios funcionales cumplidos.
- Go expone la extensión real con TokenTTL30s y reloj real, mediante test opt-in; no synthesiza respuestas token. Astro consumer copia la receta GET existente desde el archive privado y usa sus renderer/bridge reales. No edita fuentes del before/admin o del candidato Astroshare, ni añade adapter. La exactitud de los archives1ff/4469 y de la build administrada debe quedar ligada a recibos de la ejecución; los nombres/env de candidato no prueban solos correspondencia de artefactos.
- Visual separa inicial, primera renovación y reload posterior a la primera caducidad, y cuenta también server→PB a través del proxy. Conserva token/URL solamente en memoria y credentials de preparación en readiness mode0600/stdin. El reporte limita scope a GET/SSRDEV. La medición visual usa esperas fijas de1000/750ms más las respuestas de los ledgers, sin la misma barrera networkidle del carril admin; la raíz debe comprobar ausencia de operaciones pendientes/renovaciones vecinas al evaluar cada ventana. Scroll inicial0 o falsos de markerRetained no deben presentarse como prueba favorable de scroll/flicker. El test visual produce una observación por ejecución; no implementa internamente las tres repeticiones del admin.
- El Go readiness y los procesos/copias propias tienen cleanup; el before permanece intacto. Metadatos del informe incluyen candidato/tree proporcionados y versión browser. El informe admin no recoge automáticamente versión real del binario PB; la ejecución/recibo deberá registrarla y vincular el árbol/build R7 exacto. No se debe identificar la build por mtime.

## Veredicto y ejecución

**Cambios requeridos: corregir la capacidad del campo body y la barrera de las dos escrituras del rail antes de medir.** Después corresponde al autor ejecutar la sonda pequeña y solo con el turno global concedido por la raíz; esta revisión no ocupa ni altera la reserva R7.

No se ejecutó runtime, navegador, servidor, instalación, test, suite o build. Se hicieron únicamente lecturas, inventarios y diff-check estático; no se modificaron fuentes. Se escribió solo este informe. No hay cifras antes/después observadas ni gate nuevo acreditado por esta revisión. La evidencia final debe distinguir datos medidos, booleans de correctitud y limitaciones de before común/SSRDEV/GET.

## Addendum — revisión dirigida del delta corrector

2026-10-07, mismo worktree. Se leyeron únicamente los fragmentos modificados de la semilla y save(), con el contexto directo de la ventana visual. No se repitió la lectura de9fuentes ni se ejecutó runtime.

- **P1 resuelto por revisión:** body declara ahora `{ name: 'body', type: 'text', max: 65536 }`. Esto elimina el conflicto con el default5000 del validador PB y conserva los65536caracteres del dataset. La comprobación real de semilla/tamaño sigue correspondiendo al smoke del autor.
- **P2 resuelto por revisión:** save() arma las dos esperas antes del click: PATCH a la ruta exacta pages/recordId y POST a vega_revisions/records. Espera ambos status exitosos, finished y cuerpos; comprueba title de la respuesta actualizada y recordId del snapshot. El retorno del helper —y por tanto held.release tras Interim/Latest— ya depende de estas escrituras reales, sin utilizar el toast anterior como barrera. Los cuerpos no se imprimen ni se guardan en el informe. La LIST retenida continúa siendo la respuesta real del proxy.

**No quedan cambios requeridos de los dos hallazgos originales.** Apto por esta revisión del delta para la sonda admin autorizada por la raíz; la validación ejecutada todavía está pendiente.

**Ventana visual, condición para el alcance de la evidencia:** el código sigue esperando1000ms tras la respuesta token y mide scroll sin exigir que el punto inicial sea positivo. No bloquea el smoke/admin ni la recogida de valores crudos, pero antes de atribuir un resultado favorable de preservación visual se debe esperar la finalización del fetch/navegación real correspondiente a esa renovación, no solo el POST token o un texto Conectado que ya podía estar visible. La espera puede incorporarse al mismo harness, sin otra suite ni reloj simulado. Para scroll, usar contenido suficiente y exigir initialScroll>0, o declarar explícitamente que no se ejercitó;0→0 no prueba preservación. markerRetained=false sigue siendo un resultado negativo/esperable del before, nunca evidencia favorable del after. Antes de abrir la ventana de reload hay que evitar mezclar una renovación vecina aún pendiente con su tráfico. Son condiciones de interpretación de la medición visual; no se convierten cifras esperadas en asserts que obliguen a fingir una mejora.

Los límites del informe inicial permanecen: counts/bytes observados, opciones de escenario funcional evaluadas por la raíz, build/tree exactos y gate separados, SSRDEV/GET sin certificación de producción.


## Addendum — arranque, aislamiento y ventanas de medición

2026-10-07. **Sin nuevos hallazgos confirmados; apto por revisión para continuar la medición autorizada.** P1/P2 originales siguen resueltos por inspección. Este veredicto revisa el harness, no certifica los resultados funcionales ni un gate de producto.

### Inventario y candidato verificable

Se inventarió git status y diff --no-index --stat/--name-status contra /dev/null: **10/10 archivos contabilizados**, con contexto previo reutilizado y delta semántico leído. El snapshot inicialmente revisado tenía1454líneas: README74, admin.spec.ts481, astro-consumer.mjs64, playwright.config.ts24, transport.ts247, tsconfig.json11, visual.spec.ts298, test Go73, semilla181 y .gitignore1. .gitignore contiene solo un comentario y no excluye evidencia.

El autor declaró que no conservó snapshot byte exacto anterior de estas fuentes untracked; no se presenta un patch histórico reconstruido. Los diez archivos coincidían byte a byte con `/Users/david/code/vegacms/.verification/l9-real-network-20261007/harness/` y sus diez SHA256 del receipt.json durante la lectura. La comprobación final detectó el delta concurrente anunciado por el autor y detuvo la escritura del informe: se revisó aparte, con inventario y diff completos, **2/2 archivos,6líneas añadidas**, desde ese snapshot conservado en `/private/tmp/vega-l9-harness-runtime-delta.patch`.

El candidato final revisado consta de los ocho hashes intactos del receipt y estos dos nuevos hashes, comprobados inmediatamente antes de escribir este addendum:

- `extensions/vegapreview/l9_network_server_test.go`: `48d1b90958b048d4f79d666c3b02fb4f3d8bfe767bcb1f11b112b81d814419d6` —78líneas.
- `scripts/l9-measure/visual.spec.ts`: `7cb0ecd20b8c9c436508d591ccc97915fa22c99b32c189d8afa6177829de94c8` —299líneas.

Se reutilizó el descubrimiento dirigido por grafo de la revisión previa. El contexto nuevo corresponde a rutas explícitas del harness, procesos/configuración y al binding CORS de la dependencia local PB; no se indexó otro árbol ni se amplió la auditoría de producto.

### Invariantes comprobadas

- **Semilla/carrera:** permanece body.max65536. El modo lista prepara diez registros64KiB y elimina defaultSort para permitir reorder; las restantes superficies conservan sesenta registros y orden por posición. save() conserva PATCH exacto + POSTsnapshot armados antes del click, status/body/title/recordId y finalización antes de devolver/liberar LIST. La respuesta retenida continúa siendo PB real.
- **Errores/correctitud:** las ventanas admin registran pageerror con nombre y código Svelte saneado o unclassified-page-error. No descartan los errores desconocidos ni guardan el mensaje bruto. LIST añade count/unique, sin ids o cuerpos. Latest/peer y retención continúan como observaciones, no se sustituyen por éxito HTTP. L9_SURFACES acota los escenarios ejecutados. README declara que admin exit0 no prueba correctitud: deben evaluarse pageErrors y los booleans concretos, además de los conteos. Las repeticiones first/warm tampoco se presentan como tres cold-cache independientes.
- **Visual:** seis bloques hero reales proporcionan scroll y se exige initialScroll>0. Se arman antes de renovar las esperas POST token y GET real de preview; se comprueba éxito, finished y networkidle antes de observar/resetear ledgers. Reload espera navegación real terminada/networkidle y registra su status;404 permanece resultado desfavorable. Se eliminó la antigua barrera1000/750ms. markerRetained=false o scroll no preservado no acreditan una mejora; los asserts de fidelidad no fuerzan esos valores a positivos. Para atribuir métricas completas/favorables la raíz debe verificar ejecución completed, errores ausentes y valores reales de scroll/marker/Latest/peer; esta revisión no los ejecutó ni los acredita.
- **Startup/cleanup:** Astro usa cwd del starter externo, configuración/loaderToken por stdin, fases y error redactado, y timeout de readiness. EPIPE de cleanup no sustituye el fallo original. Estados Go/Astro, pánico y stack acotado se proyectan sin stderr bruto/tokens; null o señal no acreditan salida exitosa. El nuevo resumen `.transport.json` en finally conserva status/conteos saneados incluso cuando falla Visual. Se mantiene Go real, TTL30s y reloj real;1.26.3 es la toolchain declarada, no un cambio de extensión.
- **Delta CORS2/2:** el test Go añade el middleware público apis.CORS con origen* y los mismos seis métodos que `apis.Serve` de PB0.39.9 local, comprobado en `apis/serve.go:77` y defaults de `middlewares_cors.go`. Esto permite preflight de navegador en el httptest que usa NewRouter sin Serve. No cambia auth o producto ni sintetiza respuestas. La reproducción HTTP negativa404/sinACAO indicada por el autor no fue ejecutada por este revisor.

### Evidencia y límites

El receipt declara archives externos before/after en `/private/tmp/vega-l9-sites-20261007`, objetos1ff64d74/4469e482,71/101 blobs comprobados y cero discrepancias. Se comprobó esa declaración y su uso en cwd/configuración; no se releyeron archives o generados ni se atribuye aquí la comparación realizada por el autor. La causa Go1.27.1/JSONv2 y el funcionamiento con1.26.3 siguen siendo evidencia runtime del autor.

No se ejecutó navegador, runtime, servidor, instalación, test, suite o build; no se modificaron fuentes, datos, ramas o procesos ajenos. Se escribió únicamente este informe. Persisten los límites de conteos de aplicación sin OPTIONS, bytes decodificados, before común, VisualSSRDEV/GET y booleans por evaluar. Snapshot, builds exactas, mediciones, gate y despliegue son estados y evidencia distintos.


## Addendum — delta visual final congelado

2026-10-07. **Sin nuevos hallazgos confirmados en el delta1/1; apto por revisión para la matriz autorizada.** Se inventariaron --stat/--name-status y se leyó completo el patch `/private/tmp/vega-l9-harness-final-visual-delta.patch`:42líneas añadidas y6eliminadas, únicamente `scripts/l9-measure/visual.spec.ts`. Base canónica SHA256 `7cb0ecd20b8c9c436508d591ccc97915fa22c99b32c189d8afa6177829de94c8`; final congelado `84008bcf6b70ed922e9c0942ba9401b0f318462339eaeec4f1a07ed1c73e2465`. Go permanece `48d1b90958b048d4f79d666c3b02fb4f3d8bfe767bcb1f11b112b81d814419d6`. Los tres hashes se comprobaron inmediatamente antes de escribir. Las versiones intermedias del autor no se certifican como candidatos finales ni se usaron para reescribir fuentes.

Tras localizar el iframe, se espera su networkidle, se solicita scrollTo(top200,behaviorinstant) y se dejan pasar dos requestAnimationFrame antes de leer scrollY. Es una acción de desplazamiento sobre el documento real con reposo; no cambia alturas, estilos, nodos o dimensiones. Se conserva initialScroll>0 y se registra geometría saneada antes de esa assertion para diagnosticar fallos (scroll,viewport,documentHeight,número de bloques). El marker inicial ya existía; el delta no lo repone tras renovar ni toca el scroll observado después. Las barreras POSTtoken/GET/finished/networkidle de renovación permanecen.

Los eventos framenavigated se nombran ahora frameNavigationEvents, sin confundirlos con recargas documentales: documentRequests se calcula separadamente desde resourceType=document del ledger real. Se conserva observación cruda de markerRetained/scroll. El modo L9_MATRIX con el report.json usado añade sufijo-rN por repeatEachIndex, evitando sobrescritura de las tres repeticiones.

El archivo incremental identifica completed=['initial','renewal'] antes de abrir reload. Si falla después, ese archivo es evidencia parcial de esas dos ventanas, no resultado completo ni exit0 de toda la prueba. Reload mantiene la respuesta HTTP real y finished, y espera load del frame afectado en vez de networkidle global del padre, cuyas renovaciones periódicas continúan. Después recoge los ledgers pendientes y el status real. Esta barrera acredita carga del documento/terminación de la respuesta esperada; no se presenta como quiescencia global del padre o ausencia de cualquier petición futura. La raíz debe evaluar el status y los datos reales; un404 o marker false no se convierten en favorables.

Se revisó solo el delta y su contexto inmediato, sin repetir las otras nueve fuentes o una auditoría de producto. El autor declaró causa smooth-scroll y sonda26112exit0; este revisor no ejecutó ni acreditó independientemente esa sonda,46690,la matriz o cifras favorables. La matriz usa el candidato final ampliado y no hereda certificación de una sonda anterior. No hubo runtime, suite, build o edición de fuentes; se actualizó únicamente este informe. Siguen vigentes los límites previos de SSRDEV/GET, mediciones frente a correctitud funcional y build/gate separados.
