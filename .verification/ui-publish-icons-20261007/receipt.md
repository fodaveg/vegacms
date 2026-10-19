# Candidato UI: publicar desde formulario e iconos

Base `9ae8b57c3297f1c32b6f22a3d66a17a78579383b`; árbol verificado `ed22ce2b5c13371ab02157ad9a96151d33b44533`; worktree `/private/tmp/vegacms-ui-publish-icons-20261007`; rama `feat/ui-publish-icons-20261007`. Tareas 566da926-e10f-4c9c-b281-c5cf34f7623b, bbc42d52-501d-4b81-8dfd-c39f89805603, c46a0999-fc61-43d3-8fa6-81b789f24176.

El formulario de edición comparte publicación con VisualPublishControl: primero valida/guarda contenido y luego cambia estado usando la versión devuelta, bajo mutex y con un solo aviso final al padre. No publica si el contenido falla, si Estado es readonly o si el servidor no confirma el estado. Reintento de estado conserva contenido ya guardado. La confirmación reúne revisión y bloques pendientes sin autoguardarlos; creación conserva Guardar. Iconos locales cadena y cohete sustituyen emoji/link y upload de publicar; upload de ficheros conserva su icono.

Inventario 10 archivos: RecordForm.svelte y sus publish/review/schedule tests; RecordBlocks.svelte; VisualPublishControl.svelte; Icon.svelte y registry.ts; EditorToolbar.svelte; PublishButton.svelte. Patch completo en candidate-final.patch.

Verificación del mismo árbol: Prettier y ESLint sobre los diez paths, check Svelte (0 errores/avisos), focal de nueve suites 229/229, todas exit 0. Los comandos y fechas exactos están en recovery-results.json y los logs *-recovery.log. No se atribuye identidad de suites al antiguo 209/209 porque no conservó argv.

Navegador final headless desktop/móvil claro/oscuro 4/4, cero pageErrors. Valida foco de errores, publicación de contenido, reapertura SPA, cadena SVG accesible, viewport y objetivo móvil 44px. browser-attempt2 conserva comando, logs, resultados, limpieza y capturas. Inspección visual de desktop claro dirty, desktop oscuro published, móvil claro dirty y móvil oscuro published correcta. Los siete ejes se cubren en fuente y prueba mínima; a11y sin lector de pantalla/dispositivo y navegador sin distribución real.

La revisión independiente final cierra P2; ver review-final.md. El red previo conserva tres regresiones discriminantes readonly/estado ignorado; su cuarto fallo partía de una premisa incorrecta sobre readonly publishAt, y no se cuenta como bug. El rojo posterior de fecha era solo formato ISO normalizado. Detalles en receipt.json.

Entorno: macOS, Node22.22.3, dependencias existentes, sin install ni cambios lockfile. pnpm avisa configuración enableGlobalVirtualStore distinta. Alcance focal y Vite dev con memory; no gate completo, build/distribución, PocketBase real, QA física, integración, push ni deploy. Raíz certifica árbol combinado. Espacio libre inicial 130 GiB y final 130 GiB (valores KiB en receipt.json), presupuesto <1 GiB. Servidor/navegador propios cerrados; worktree reservado y evidencia canónica conservada hasta integración.

Commit privado `64be058982b628717561ecca9dbced2a9ff936ac`; árbol commit coincide con el freeze. Worktree limpio tras commit.
