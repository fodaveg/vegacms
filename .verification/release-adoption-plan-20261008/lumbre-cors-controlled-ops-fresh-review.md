# Lumbre CORS — receta controlada

Veredicto: **APTO estático**, sin mustfix. No acredita ejecución, CORS servido ni causa del STOP histórico.

Sellos locales comprobados:

- remote_apply_lumbre_controlled.py: `4416eb5b9b23c23cf596d028e1f0ecc8ce983b43b29d6af7625b16c1b9ae5926`
- run_lumbre_controlled.py: `19c1d2dafa1e0e62db45e90c4859cd6f91368bf0618d1e919bd785eb9842a84d`
- selftest_lumbre_controlled.py: `83917fc01efaea0fb89e423a599fa25437b4079ffa8f9ee1203c5d062d6041a8`
- OPERATE-LUMBRE-CONTROLLED.md: `250a56e68a08b19ea14f18b6f40f3259753fe4cf10acfd80437613897edf44bd`

Inventario diff-first frente a base acreditada remote_apply.py `079f3cfa28378d551b29893ef4e47d71b6417eb8cd3c0f32ea3133d2fcc21682`: un fichero de fuente, 122 inserciones y 7 eliminaciones. Diff completo leído, además del contexto de archivo/FD, parada, instalación, rollback y main; wrapper, tests y documento completos. Helper conservado `5d4131c229d7aa88918c932dd517b0d33e024a3497aa4fcc4b9f0c9940467128`. Los ficheros nuevos de wrapper/tests/docs están contabilizados como material adicional de revisión.

El producto y sus guards quedan iguales: selección solo Lumbre; BASE 7ed9 a TARGET 56caa con la misma imagen OCI 40df y old ID6241. No se relaja comparación del baseline ni se normalizan arrays para dar verde. Cinco muestras RO sin cambio de orden no prueban la causa histórica.

La corrección CAS es adecuada: checkpoint CREATE y START se escribe antes de la última gate_files; no hay escritura de estado entre esa guarda final y create/start. Compose y dotenv conservan controles completos de hash, dev/inode, owner, modo, tamaño y timestamps mediante parent FD NOFOLLOW. Los otros controles de imagen/selección/runtime siguen presentes. La creación queda sin build/pull y registra CREATED/ID antes del arranque fijo.

En fallo, solo INSTALLED sin newContainerId registrado intenta el rollback acreditado, que exige el old ID seleccionado, TARGET propio, dotenv propio, imagen/topología y ausencia de otro writer antes de restaurar BASE y arrancar ese mismo ID. Si create sustituyó el old ID o hay drift ajeno, STOP_NEEDS_OPERATOR. No adopta un contenedor parecido ni restaura datos PB. STOP_OLD_RUNTIME_RESTORED sigue exit2 y requiere smoke público.

Los checkpoints, failureClass y comparaciones se exportan como enums/booleanos; create conserva solo el código numérico y descarta stdout/stderr. La comparación adicional es diagnóstica, no una guarda ni prueba independiente de causa. Wrapper utiliza los buffers sellados una vez, esquema cerrado y archivo exclusivo0600; ningún dotenv, mount source, error crudo o argumento privado sale de RAM.

Se reutilizan cuatro métodos / ocho subcasos y AST acreditados por el owner; revisión no ejecutó tests, SSH, Docker, HTTP ni builds. Negativos leídos: Compose ajeno durante checkpoint CREATE impide create; dotenv ajeno durante START impide start y preserva bytes; runtime/create fallido con recuperación permitida o guardada. Mocks no sustituyen la prueba de ejecución real.

Antes de ejecución raíz debe usar baseline público nuevo tras estabilizar Fod, check fresco del BASE/ID y aprobación runtime correspondiente. Después, smoke público de Lumbre153/discovery JSON/CORS/API y peers; un fallo se interpreta por recibo concreto, nunca replay ciego de079f.
