La identidad pública **no coincide** con los builds CSP13 ya acreditados. Se hicieron seis GET públicos sin cookies, credenciales, query, redirects o retry; session10525 terminó exit0. No se descargaron151 assets.

Vega y Lumbre tienen el mismo índice SHA92696276c1727cdc6fdc33a711be36e1bf0a890a6ed8c0f20610fc9b16953d0c y versión1790238198788. Fod tiene índice SHA4cdfa4a5ca28b5376273e4b7db055fafce90f56dedd5d1844518d82f1a57ef86 y versión1790238028368. Los seis recursos respondieron200.

Los discriminantes no coinciden con el índice empaquetado f59 SHA362177c30431c6c473c8d1b663c9108e09ed1e2ab833f3558089679081a0a6d3, el manifiesto151 del CSP13 histórico (índice0ad48a6a/version06b7476b), ni el manifiesto151 del actualbe130 (índice9b6f93f8/version495c203b). El productor confirmó que no conserva un manifiesto151 completo de f59/cecf: bin/hook e índice parcial no sustituyen ese inventario.

El CSP13 anterior **montaba el build9165** sobre f59; no probaba su SPA empaquetada. Por tanto tampoco permite transferir compatibilidad al servido por nombre de imagen. La versión sola no demuestra incompatibilidad funcional: aquí sólo se excluye identidad exacta y reutilización del certificado sobre esos bytes. No se han comprobado todos los assets públicos, funcionalidades, CORS ni headers propuestos en producción.

Paso útil: preparar y sellar dos clones públicos autocontenidos (Vega/Lumbre compartido, Fod separado), obtener manifiestos SHA de sus dependencias y probarlos localmente con el arnés CSP existente y los headers propuestos. La política no se modifica en producción. El plan está en served-csp-plan.md; su ejecución pesada espera decisión de raíz, metadata revisada y slot.
