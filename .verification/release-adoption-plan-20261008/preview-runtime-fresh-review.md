# Review independiente del runtime preview

Veredicto: **APTO para integrar**. Sin must-fix ni mejoras relevantes en el alcance.

Candidato `c7345ab7ebcbb016f629fe28fa0bac3490f3f3cc`, árbol `4d991bf42661a9963eeaf38a2da6bfc240954327`, base `a598bfe`. Inventario mediante `git diff --stat` y `git diff --name-status`: cinco ficheros, todos contabilizados: README, deploy-preview.sh, Dockerfile, runtime/package.json y runtime/package-lock.json.

Revisados los diffs completos de fuentes y documentación; lock revisado mediante sus 169 entradas, versiones, relaciones, restricciones de plataforma y origen/integridad. Todos los descargables usan registry.npmjs.org y tienen integrity. SHA-256 del lock `2a6bda8cee2458a1b0b7b89b06f02bc0a196cf9d22fab4712d9d733b02a23252`, igual al recibo. Cierre fijado remark 7.2.1, PocketBase 0.27.2 y sharp 0.35.3; sharp-musl-x64 y libvips corresponden al runtime Linux/amd64.

Contexto: script completo, manifest preview, ruta pages, resolvePreview y escenarios dirigidos de preview. El smoke selecciona un ID publicado real de pages y exige 404 sin bloques sin token. El secreto ya no se extrae al Mac. El Dockerfile solo cambia comentarios: la receta ejecutable coincide con la imagen local acreditada `sha256:4678e3f9dc1b85b038427e45eaec4ece6a37affbcd164383def641c9dce1986f`.

Evidencia reutilizada: `.verification/lumbre-astro-production-20261008/receipt.md`; arranque/reapertura, carga sharp Linux y HMAC sintético TEST 200 con bloques, 404 sin token. No ejecuté builds, suites, SSH ni despliegues. La prueba con token emitido por el admin de producción y la comprobación del dominio siguen fuera de esta review. APTO acredita integración del cambio revisado, no versión servida.
