# Revisión independiente del corte SOURCE limpio L13

Veredicto final: **APTO en revisión estática para el corte SOURCE-only**, tras corregir propiedad y rename. No acredita ejecución ni source productiva instalada.

Candidato final: lector `remote_source_clean_cutover.py` SHA `192bde319b7d004c2436187ef24d3d8ce05e8eebb3e2061c6fb85fb55aac9ac2`; wrapper `run_source_clean_cutover.py` SHA `1d28ee125f5928efba8040d1153f23a3eff1b14cb5ed414f622ec5f583aae750`; test `test_source_clean_cutover.py` SHA `0f21718a7c201010d0cce6a4da97a403528a1a5f70b46b89533f67b524d97114`. Los tres hashes finales cotejados independientemente sobre los bytes locales. Módulos fijados: contrato `2baa3e7d…`, guard `6e15acc7…`, extras `48307b2f…` ya revisados. Inventario inicial `git diff --no-index --stat/--name-status` contra `/dev/null`: dos archivos nuevos, 189 y 88 líneas. Lector final, wrapper, test y handoff leídos completos. Grafo previo de esta superficie excluida sin resultados; lectura de paths conocidos.

## Hallazgo inicial y cierre

**P1 cerrado — `remote_source_clean_cutover.py:76` y `:167` del antecedente `00f22fe5…`: propiedad del clean y destino del rename sin cierre.** `extract_clean()` creaba y abría CLEAN mediante path absoluto; `O_NOFOLLOW` protegía solo la hoja al abrir, pero no los padres de mkdir/open. Un cambio de STAGE a symlink después del precheck podía desviar la creación inicial. Tampoco conservaba identidad device/inode del directorio creado por esta invocación; un árbol ajeno sustituido con los mismos archivos podía superar las verificaciones de contenido y ser renombrado.

El último `preconditions()` ocurría antes de dos recorridos de tree/hashes y de mkdir de padres. `os.rename(CLEAN, SOURCE)` podía reemplazar un directorio SOURCE vacío creado por otro escritor en ese intervalo. La ausencia previa del destino no protegía esa operación.

Corrección comprobada en `192bde31…`, sin tocar el contrato original: ancestros abiertos mediante descriptores y O_NOFOLLOW, STAGE fijado por device/inode, CLEAN creado y extraído por descriptor de su padre, identidad del clean y de padres source/drop-in revalidada inmediatamente antes/después del corte. El rename usa exclusivamente Linux `renameat2(RENAME_NOREPLACE)`, con los padres fd-relativos; no hay fallback que sobrescriba. La llamada y el manejo de errno concuerdan con [Linux man-pages, rename(2)](https://man7.org/linux/man-pages/man2/rename.2.html). El drop-in también se crea por descriptor O_EXCL. El stage sucio permanece intacto.

Test local final leído: positivo conserva stage/cache y deja 232 archivos/49 directorios más drop-in exacto; negativo STAGE sustituido por symlink sin escritura externa; negativo CLEAN sustituido por árbol de iguales bytes rechazado por inode, ambos conservados; negativo SOURCE vacío creado justo antes de rename conservado con STOP. El handoff acredita **cuatro casos exit0**. No se repitieron por este revisor. En macOS la llamada Linux y Docker/systemd son dobles: no se acredita soporte real del syscall/filesystem del VPS. Sí se acredita en código que falta de soporte o error producen STOP sin sobrescribir el destino; puede quedar el clean propio para inspección. Antes de cualquier retry es necesaria lectura fresca.

## Comprobado

- Snapshot único del tar con tamaño/SHA antes de parseo; 232 archivos, 49 directorios, paths relativos/clases/modos/duplicados/límites y padres declarados antes de extraer. Los miembros se leen desde esos mismos bytes.
- Stage sucio se acepta únicamente con los 232 archivos exactos y extras regulares íntegramente en `.pnpm-store`, sin links o tipos especiales. No se borra ni se mueve ese stage, sus cachés, las fuentes antiguas o el sitio servido.
- Extracción de hijos del clean usa descriptores nofollow y creación exclusiva; modos, bytes y árbol exacto se comprueban dos veces. Guards de publisher pausado/quiescente, old trees, sitio/Compose nuevo, imagen/store, unidad y fuentes/droppin ausentes se repiten.
- Drop-in se crea fd-relativo con O_EXCL. No hay start/restart del watcher ni build; solo daemon-reload tras instalación. Fallo posterior al rename exige operador y no inventa rollback o reactivación seguros.
- Wrapper verifica y transmite buffers únicos; módulos cargados como módulos, sin sus main; esquema finito estricto, stderr descartado, sin output privado guardado. Un outcome de transporte desconocido requiere inspección antes de retry.

Límites: revisión de lectura; no SSH, Docker, builds, tests ejecutados ni edición de fuentes por este revisor. La simulación/negativos locales descritos por owner en el handoff no acreditan el estado remoto. El corte es de SOURCE solamente, y no convierte el handoff en requisito nuevo de activar opt-ins o de ejecutar login/token/CMS productivo para la adopción L13.
