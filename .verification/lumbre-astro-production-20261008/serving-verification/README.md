# Comprobación pública de entrega L13

Scope: 55 archivos del archive estático local SHA53dab75d… y manifest f551461c… del candidato a598bfe, incluyendo ES/EN/DE y sitemap. Sólo GET HTTPS públicos sin auth/cookies/proxy, redirects o retries. Se reutilizan las convenciones de identidad de assets del helper `image-only-delivery/served_smoke.py`, el filtro NoRedirect del probe público y el lookup de portada publicada de `lumbre-web/infra/production/deploy-preview.sh`; el exportador es menor y sólo guarda SHA/bytes/MIME finito de archivos públicos, estados de preview/health y flags. No se exportan headers completos, cuerpos, IDs del registro de portada, logs privados, env o credenciales.

El código y pruebas pertenecen exclusivamente a este nuevo directorio del worktree `codex/caddy-referenced-env-20261008`. El lector Caddy está congelado y queda fuera de este candidato. No se modifica ni despliega ningún proyecto. La raíz conserva publicación y estado de tareas.

`python3 -B test_verify_served.py`: cinco tests offline dirigidos, sin suite/build, servidor o navegador. `verify_served.py --check-local --source-dir /Users/david/code/vegacms/.verification/lumbre-astro-production-20261008`: verifica los 55 miembros directamente en RAM, sin extracción y cero GET. `seal.json` fija SHA256 de script/pruebas/documento; se verifica antes de consultar red.

Ejecución pública autorizada por el encargo: `python3 -B verify_served.py --source-dir /Users/david/code/vegacms/.verification/lumbre-astro-production-20261008`. Output exclusivo nuevo `public-serving-receipt.json` aquí. Los HTML se consultan en su ruta de directorio canonical (`index.html`→`/`); los assets conservan path literal. La comparación exige HTTP200, SHA+bytecount iguales y MIME clasificado.

Preview: lookup público de la única portada publicada (fields=id), luego GET sin token de root y `/preview/pages/<id>` en ES/EN/DE; exige404 y ausencia de marcador de bloques. Si el lookup no resuelve, el recibo queda parcial y no acredita esos tres paths. Health: sólo estado GET `/api/health` de los tres admins, sin leer cuerpo. Total esperado63 GET:55 assets+1 lookup+4 preview+3 health.

Límite: no prueba token REAL emitido por admin/CMS, sesión/autenticación, CSP/CORS, UI ni estado interno/container de producción. El recibo no puede cerrar la prueba positiva del consumidor L13 por sí solo. El archive y el manifest local ya sellados no prueban qué está servido: eso se decide por el resultado HTTP observado.
