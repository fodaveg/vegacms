# Importación: autorizar los orígenes de medios antes de pedirlos

Tarea: 16864548-279d-4305-9229-1acbafe79aa5. Base privada f18da71. Decisión técnica para el siguiente lote, dentro del encargo de avanzar el backlog. Fuente: lectura dirigida por grafo de import-media/fetchTransferFile, TransferDocument/TransferOrigin y el diálogo. La memoria compartida mantiene importar por referencia desde origen, conservar ids y escribir por dependencias; no introducir ZIP ni cambiar esos acuerdos.

## Política

- Vega hace fetch en el navegador; no atribuir SSRF de servidor ni garantizar cómo resuelve DNS el navegador.
- El JSON es entrada no confiable. `origin.backendUrl` describe el origen, pero no autoriza por sí solo ningún acceso. Reunir los orígenes HTTP(S) normalizados de los medios; mostrar el backend declarado y los demás orígenes presentes ANTES de cualquier fetch de medios o escritura. Autorización explícita por fichero/sesión de importación, ninguna casilla de origen preseleccionada. Reiniciar al cerrar/reabrir o cambiar fichero. Sin medios, no pedir esta autorización.
- Tras autorizar, solo se solicitan URLs cuyo origen exacto (esquema, host y puerto normalizados) está en el conjunto autorizado. Rechazar usuario/contraseña en la URL y otros protocolos. Las migraciones a PocketBase local siguen posibles mediante autorización explícita del origen local; no bloquear indiscriminadamente localhost/RFC1918. Indicar de forma concreta si el origen declarado es local, sin fingir clasificación DNS de dominios públicos.
- Peticiones de medios sin credenciales del navegador ni referente; no seguir redirecciones automáticamente, porque una allowlist comprobada solo después del redirect no impide la petición anterior. Usar URLs directas en exportaciones con CDN/proxy. Una URL no autorizada nunca consume un slot ni se pide durante preview/import.

## Integridad y vista previa

- Fuente no autorizada o URL rechazada por política: registro BLOQUEADO antes de escribir, incluso si el fichero es opcional; mostrar campo y origen/motivo sin URL con credenciales. Nunca convertir un bloqueo de política en vaciado de ficheros al PISA. El usuario puede autorizar ese origen y recalcular la vista previa.
- Conservar el acuerdo previo para un medio autorizado pero no alcanzable: required bloquea; opcional puede entrar sin fichero y el informe lo identifica. La vista previa debe advertir qué medios autorizados no se pudieron traer antes del consentimiento de sobreescritura; no fingir que un fallo genérico de fetch demuestra una redirección.
- Compartir resultados cacheados del mismo fichero y política entre preview/escritura. Una aprobación nueva invalida resultados rechazados; cancelar/reabrir no hereda permisos o resultados de otro fichero. Conservar ids, relaciones, escritura por niveles y semántica de campos vacíos.
- Mostrar los registros bloqueados y permitir importar solo los que ya cumplen la política/contrato, igual que los otros bloqueos de preview. Ninguna aprobación de origen autoriza sustituir registros sin la confirmación PISA existente.

## Verificación proporcional

Tests de origen exacto, HTTP(S)/puerto/defaultport, URL con credenciales, hosts locales autorizados/no autorizados, protocolos/IPv4 normalizados y ausencia de fetch/slots en rechazos. Fetch options omit/no-referrer/redirect-error observables. Componente: elegir fichero no llama red de medios antes de consentimiento; confirmar/recalcular; URLs ajenas BLOQUEAN aun optional y no se vacía un fichero existente; permisos se reinician por fichero/close. Tests de import existentes para ids/dependencias/relaciones/PISA y fallos required/optional. Contrato de módulo actualizado antes del parche; revisión de diff y un gate conjunto tras candidato estable. No proveedor externo, datos reales, instalación, backend nuevo ni despliegue.

Diseño7ejes: tokens/estados/contenido/feedback/assets cubiertos por reutilización del diálogo y sus controles; responsive y accesibilidad parciales hasta lámina/headless y pruebas de foco/labels; sin nuevos assets. Autor puede señalar una contradicción o ajustar la costura técnica antes de construir, manteniendo estas premisas.
