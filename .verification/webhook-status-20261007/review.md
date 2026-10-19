# Webhook HTTP status — revisión independiente

**Veredicto: cambios requeridos por un P2 de ciclo de vida en el nuevo camino de rechazo.** Sin hallazgos en la sanitización del estado HTTP revisada. El arreglo pertenece al autor; esta revisión no modificó fuentes ni ejecutó pruebas.

## Hallazgo prioritario

🔴 **P2 — reiniciar sondeo tras desmontar conserva el token anterior y deja reintentos huérfanos.** `src/lib/shell/PublishButton.svelte:165`.

El nuevo `beginPolling()` del catch se ejecuta después de `await client.trigger()` sin comprobar que el componente siga montado. Si se hace logout mientras el POST está pendiente, `onDestroy` ya ha detenido el poller previo, pero el rechazo tardío crea otro. Su función de parada queda almacenada en una instancia destruida y no vuelve a ejecutarse. `createBuildClient` capturó el token al montar; el nuevo GET usa ese token anterior. Si status responde 401/403 o hay fallo de red, `pollBuildStatus` sigue reintentando con backoff; si devuelve running, sigue sondeando, aunque no quede botón montado.

El consumidor real permite ese desmontaje: `src/routes/+layout.svelte:448` deja de renderizar `AppShell` sin sesión; `AppShell.svelte:80` contiene `Topbar`, y `Topbar.svelte:255` contiene `PublishButton`. El propio cleanup del botón (`:143–149`) declara que debe detener todo sondeo. En el nuevo camino esto ocurre antes de arrancarlo.

**Reproducción mínima para el autor (no ejecutada por el revisor):** montar y resolver el status inicial idle; dejar `/trigger` como promesa diferida; hacer click; desmontar el componente/logout; rechazar la promesa (o resolver su Response con 502); vaciar tareas. Se observa un nuevo GET `/status` con Authorization del contexto anterior después del desmontaje. Hacer que status responda 401 y avanzar el reloj muestra reintentos posteriores. No exige webhook externo ni Go.

**Propuesta de cierre:** marcar el ciclo de vida cerrado al destruir y descartar la continuación tardía antes de emitir feedback o reiniciar el sondeo. Una guarda común también debe cubrir el éxito tardío ya existente para que ambos caminos respeten el mismo cleanup. Regresión discriminante: ninguna consulta nueva, toast ni actualización del componente tras desmontar con trigger pendiente; mientras siga montado, el rechazo aún debe refrescar failed/detail y detenerse al estado terminal. No cancela ni reintenta el POST en el servidor.

## Candidato e inventario

Worktree `/private/tmp/vegacms-webhook-status-20261007`, base `9ae8b57c3297f1c32b6f22a3d66a17a78579383b`, commit `e08af15559079a8a19871d1dbc40b627bab83703`, árbol `6226b85c5c83a79552ad842bf0ab42ff5899877b`. Se empezó con `git diff --stat/--name-status`, se leyó el diff completo por bloques y se contabilizaron **7/7 archivos**, 208 inserciones y 16 eliminaciones:

1. `docs/PROJECT-CONTRACT-v1.md`.
2. `extensions/vegabuild/README.md`.
3. `extensions/vegabuild/vegabuild.go`.
4. `extensions/vegabuild/vegabuild_test.go`.
5. `extensions/vegabuild/webhook.go`.
6. `src/lib/shell/PublishButton.svelte`.
7. `src/lib/shell/PublishButton.svelte.test.ts`.

Los siete SHA256 vivos coinciden con `receipt.json`; HEAD/tree coinciden con el candidato y el worktree estaba limpio. SHA256 del diff del rango: `cbdd96841ef8e295461cc17f8910d318807bd81d552b6da4d4b33292e3b06398`. Se leyó el metadata fuller del commit, el recibo completo y los JSON de restauración exacta de los dos controles rojos. El cambio de iconos paralelo queda fuera de este candidato/revisión.

## Contrato y flujo comprobados

Se adopta la decisión técnica explícita de la raíz: solo respuestas HTTP reales 400–599 del WebhookRunner pueden añadir `(HTTP N)` a los textos fijos. Los dos documentos reflejan ese refinamiento; no se reabre la decisión anterior.

`webhookResponseError` es privado y almacena únicamente un entero. `startFailureText` comprueba ese tipo directo y el rango cerrado; no analiza `Error()` ni acepta que un Runner arbitrario que diga HTTP 500 aporte texto. Construcción/transporte y estados fuera del rango mantienen las frases fijas. `Start` descarta el cuerpo y no añade URL, headers ni valores del request a sus errores. `Trigger` guarda el detalle sanitizado pasando por `closeRun`; `triggerHandler` solo devuelve el mensaje sanitizado, manteniendo 502. El error arbitrario del Runner sigue destinado al log del servidor como en el contrato previo.

Se usó primero el grafo `vega-backlog-r2-20261007` para localizar `Trigger`, `closeRun`, handlers y `createBuildClient`/`pollBuildStatus`; el índice no devolvió funciones del componente. Se verificó el contexto directamente en los paths conocidos del candidato. El autor proporcionó después el índice privado `vegacms-webhook-status-20261007`, donde se confirmó la localización de los dos símbolos del cliente. No se creó otro índice ni se amplió a otros módulos. El cliente no lee el body del rechazo HTTP para su error público; la UI pinta detail como texto. El sondeo reemplaza al anterior y se detiene al recibir idle/ok/failed; su parada descarta resultados pendientes. El hallazgo está en crear uno nuevo después de que ese mecanismo de limpieza ya haya terminado.

Los tests nuevos de Go recorren dispatch HTTP real, trigger/status y persistencia para 302/399/400/403/429/500/599/600, buscando cuerpos/headers/URL secretos en la salida; prueban también error de transporte, construcción y Runner arbitrario. El test de componente comprueba rechazo 502→status failed, detalle sanitizado, ausencia de error privado y tres peticiones totales. El happy path previo sigue cubierto. No cubren el rechazo que resuelve después de unmount; por ello sus verdes no cierran el hallazgo.

## Evidencia y límites

El recibo del autor acredita Go test/vet, componente 16/16, formato/ESLint y controles discriminantes rojos con bytes restaurados. Son evidencias del autor, no ejecuciones de esta revisión. No se ejecutaron tests, suite, build, Go, navegador, runtime, instalación ni webhook externo. No se acredita E2E, gate combinado, producción, deploy ni interacción con un proveedor. La corrección del P2 y su evidencia deberán revisarse como delta antes de cerrar este veredicto.
