# Consolidación privada: traspaso TLS local

Base de integración indicada por raíz: `4b6db12a0891a37a8d980ccc7e540c7d7036b9f2`.
Aplicar en orden `57ad99221e174173f9575a36624ea219b49c24a5`, después
`76a27a4fe4ec3efb1175111e59b5cc142bf6ec78`. No se han ejecutado pruebas nuevas
en este traspaso. El gate del candidato combinado queda en raíz.

Hay cinco entradas de diff entre los dos commits y cuatro fuentes únicas:

- `57ad992`: `tests/contract/pb-harness/smtp-sink.ts`.
- `57ad992`: `tests/contract/pocketbase.contact-notify-hook.test.ts`.
- `76a27a4`: `tests/contract/pb-harness/smtp-sink.ts` (hostname TLS opcional; default intacto).
- `76a27a4`: `tests/contract/pb-harness/docker-server.ts`.
- `76a27a4`: `tests/contract/pocketbase.contact-notify-image.test.ts`.

Dependencia común `tests/contract/pb-harness/server.ts`: diff completo vacío entre
la base `4b6db12` y `76a27a4`; conserva env scoped al hijo, tipos y firmas compatibles.
También es vacío el diff de Dockerfile, dockerignore y hook de contacto entre
`d6df761` (contexto acreditado de imagen) y `4b6db12`.

Comandos focales, si el gate exige aislar un fallo, desde el worktree de raíz con
Node 22 y los CLIs existentes; no instalar ni construir otra imagen:

```sh
node node_modules/vitest/vitest.mjs run tests/contract/pocketbase.contact-notify-hook.test.ts tests/contract/pocketbase.server-settings.contract.test.ts --project server
node node_modules/vitest/vitest.mjs run tests/contract/pocketbase.contract.test.ts --project server -t 'invitación de extremo a extremo'
node node_modules/eslint/bin/eslint.js tests/contract/pb-harness/smtp-sink.ts tests/contract/pb-harness/docker-server.ts tests/contract/pocketbase.contact-notify-hook.test.ts tests/contract/pocketbase.contact-notify-image.test.ts
```

`VEGA_CONTACT_SMTP_TLS_TRUST_TEST` debe quedar ausente en Darwin/PB Go 1.26.5:
el negativo CA sí corre; el positivo nativo se omite honestamente (un skip).
Sin `VEGA_CONTACT_TEST_IMAGE`, el contrato Docker añade dos skips intencionales.
Estos opt-ins son independientes. No se debe activar el trust opt-in nativo en
Darwin para intentar forzar el positivo Docker.

El contrato Linux puede reutilizar su evidencia exacta (dos verdes, cero skips,
session24350 exit0, árbol `ee5e4c00eda92d1204070225a7c8445f13164e5a`) cuando las
fuentes integradas sean idénticas. Si raíz decide repetir únicamente ese contrato:

```sh
VEGA_CONTACT_TEST_IMAGE=sha256:f59dc6354915b5716febbc933817a3f59aca135a32a8946f6be6d8d3a1f29a6b node node_modules/vitest/vitest.mjs run tests/contract/pocketbase.contact-notify-image.test.ts --project server
```

La imagen existente no se descarga: el adaptador usa `--pull=never`, Linux/amd64,
hook empaquetado, CA pública solo en el proceso y recursos efímeros propios. La
conexión gateway→sink local ya quedó acreditada en la sonda mínima del recibo.
El consumidor plaintext conserva la firma previa del helper.

Recibos históricos: `receipt.json` y `image-proof/receipt.json` en este directorio.
Sus menciones a proveedor pendiente preceden a la decisión posterior de David:
el proveedor externo, AUTH/STARTTLS y la búsqueda de credenciales están descartados.
No se reescriben esos recibos para cambiar la evidencia histórica. La prueba local
acredita TLS implícito y reintentos pending→sent, no SMTP externo ni producción.

El worktree propio permanece limpio en `76a27a4`, con prerrequisitos existentes
reservados. Los fixes que descubra el gate vuelven a este agente y a ese worktree;
no hay autorización para main, push, despliegue ni servidores externos.
