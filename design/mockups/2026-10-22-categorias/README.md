# Categorías: listado en árbol

Lámina previa a la UI. Regenerar: `node design/mockups/2026-10-22-categorias/build.mjs`.
Usa los tokens vigentes del candidato. El listado conserva columnas, búsqueda, acciones de
crear/duplicar/borrar/exportar/importar y estados genéricos. La columna título gana sangría y el
nombre de la madre debajo. Subir/Bajar en el menú de fila solo cambian el orden entre hermanas;
la madre se cambia en el formulario. Un filtro conserva la profundidad y el nombre de la madre,
aunque esta no coincida. Sin filtros, se lee el árbol completo por páginas de hasta 200 registros.
No se arrastra entre ramas. Los datos con ciclos, madres ausentes o exceso de profundidad aparecen
como raíces con aviso. El formulario impide volver a guardar una rama inválida.

Checklist de siete ejes: tokens cubierto (roles del sistema); estados cubierto (carga, vacío,
error y listo); responsive cubierto (sangría reducida en móvil, tabla conserva scroll contenido);
accesibilidad cubierto en la build (subtítulo/tarjeta 5.98:1 claro y 6.99:1 oscuro, menú
44×44 con puntero táctil y sin overflow a 1440/390 px; menú por teclado existente); contenido cubierto (nombre largo y tres niveles, árbol vacío y muchos
registros por cursor); feedback cubierto (errores de lectura en contexto, mutación en feedback,
borrado con confirmación); assets N/A (reutiliza iconos y logo existentes).

La verificación visual final se acredita sobre la UI de la build, no por esta lámina.

QA del candidato: capturas claro/oscuro a 1440 y 390 px en
`git-common-dir/verification/cms-seven-20261022/blog/`, junto a `ui-metrics.json` y el script de
captura. La prueba de navegador comprueba geométricamente que la hija queda a la derecha de la madre.
El nombre largo conserva el truncado y el título accesible de la tabla existente. La sangría usa
1.5rem por nivel en escritorio y 1rem en móvil. No se midieron todas las paletas: se reutilizan los
tokens semánticos y la cobertura de temas del sistema. Las imágenes son regenerables y no se versionan.
