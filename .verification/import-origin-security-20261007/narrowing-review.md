# Import origins — delta de narrowing

**Listo para merge; sin hallazgos.** Base `949f8355dbfc032a00ae2af45d77c5576bbcd19b`, WT `/private/tmp/vegacms-import-origins-20261007`, árbol staged `ffd60013f0c038309a5b398ae28e0eed27416dfe` comprobado sin diferencias de index/unstaged.

Inventario stat/name-status y lectura completa **1/1 archivo**: import-collection.ts, 2 inserciones y 1 eliminación. collectImportMediaOrigins conserva exactamente el predicado hasTransferMediaUrl, moviéndolo de filter al guard continue dentro del for. Se recorren los mismos elementos, en el mismo orden, y fileCount/origins no cambian. El guard explícito permite a TypeScript estrechar file antes de leer .url. No hay cambio de política, consentimiento, validación, cache, bloqueo ni PISA.

Receipt narrowing-receipt.json y logs finales leídos: pnpm check exit0, 0 errores/0warnings; import-collection **46/46**, exit0; formato/ESLint/diff0 del autor. No se ejecutó prueba ni se cambió fuente desde la revisión. Full gate/build siguen reservados a raíz; la revisión funcional previa conserva su alcance y límites.
