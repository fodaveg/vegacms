# Veredictos separados: smoke público y CHECK de CORS

**APTO estático de lectura exclusivamente** para los dos alcances siguientes. APPLY/ROLLBACK del mismo candidato permanecen HOLD y tienen revisión aparte. No SSH/Docker/builds ni ejecución de tests por este revisor.

| Alcance | SHA-256 |
|---|---|
| served_cors_smoke.py, baseline/after/rollback públicos | `498e38433d2805d04d5cdb4bab77961d9c5c7d5080eccc76bd2c7ec7de9708da` |
| remote_apply.py, solamente modo CHECK | `e6fdfe27f7082187e1240973b227a1c13c3296cbdb5b2b9018ae37d4073ae74c` |
| run_once.py | `1cbbefd6a620c328419ac31ed8a9bb90acdd0818b4cc8e820093e73f99d111f6` |

Base `.verification/cors-network-adoption-20261008/apply/`. Revisión completa inicial de cinco archivos y lectura por bloques de la remediación e6fd/498e (truncaciones recuperadas específicamente). Helpers5d4131 y04be908 permanecen congelados; solo se carga su alcance pertinente. Los nuevos tests9/9 declarados se leyeron sin repetirlos. No hay aprobación de otras fases implícita por estas lecturas.

CHECK invoca exclusivamente preflight: Compose/env por FD de ancestros/hoja NOFOLLOW regular acotado, hashes/identidad en RAM; patch exacto; runtime saludable actual por ID/image/tag/ENTRY/CMD/PB argv y topology conocida; imagen de backup en caché; tamaño de volumen, filesystem/reserva; Compose config quiet. No backups, stop/start, labels completos, replaces o container creation en esta rama. JSON cerrado identifica presupuesto y candidatos. Debe detenerse si el sello o identidades actuales cambian.

SMOKE realiza GET/OPTIONS públicos sin credenciales en hosts/path conocidos; no proxies y no redirects antes de una segunda petición. Ese opener se inyecta también en el helper servido congelado. Discovery exige status200, MIMEapplication/json y cuerpo acotado8192 que parsea a objeto, sin guardarlo. Se prueban origen propio/ajeno/null y preflights en discovery y health; root/deep/health/panel/missing,153assetsSHA+MIME y peers se comparan con baseline del mismo servicio. Ni headers crudos ni cuerpos se persisten. Una denegación/resultado no esperado puede dar STOP conservador; no se transmite a otro host ni se leen secretos para discriminar.

Baseline solo captura firmas; no prueba CORS restrictivo. AFTER positivo acredita los asserts concretos, no login/authenticated UI ni overrides locales. ROLLBACK público compara política de health y paths/assets/peers con baseline; no autoriza un rollback de runtime. El discovery positivo distingue JSON de HTML SPA; no valida cada campo del contrato o todo contenido del proyecto.

Resto pendiente del candidato e6fd: guards finales de activación, stop por ID fijado, prueba del inode de temp propio y minimización de labels; negativos de flujo/recuperación. Esos hallazgos afectan APPLY/ROLLBACK, no las ramas de lectura aquí certificadas. Un hash posterior exige su delta-review y nueva aprobación exacta cuando proceda. Exclusividad de root y runtime de permisos siguen vigentes.
