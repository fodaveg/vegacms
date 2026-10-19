# Default logger: siguiente operación concreta

Preparación revisable. Ninguna conexión, grant, marker ni receipt se ha creado.
Root debe leer wrapper, manifest-v2 y bibliotecas antes de solicitar una aprobación
runtime nueva para **la invocación completa** siguiente. El alcance incluye el
subtree potencialmente privado `logging.logs.default` solo en RAM remota, un GET
fijo y dos pins `.Id`/`.Image`. Excluye Env, logs, whole config, otros hosts/loggers
y escrituras remotas. Los grants consumidos no autorizan esta operación.

Tras revisión independiente, root sustituye los dos placeholders con el SHA final
del manifest-v2 y la referencia real de revisión. Presenta el bloque completo como
una sola `exec_command require_escalated`, con ese alcance explícito. Solo la
aceptación runtime permite ejecutar el bloque. Si se rechaza, no crear el archivo
ni ejecutar el wrapper. Este bloque no se ha ejecutado en la preparación.

```sh
python3 -B - <<'PY'
import hashlib, json, os, subprocess, sys
from pathlib import Path
base = Path('.verification/release-adoption-plan-20261008/logs-runtime-next').resolve()
manifest_sha = 'REPLACE_WITH_REVIEWED_MANIFEST_V2_SHA256'
review_reference = 'REPLACE_WITH_REAL_INDEPENDENT_APTO_REFERENCE'
body = (base / 'manifest-v2.json').read_bytes()
if hashlib.sha256(body).hexdigest() != manifest_sha:
    raise SystemExit('STOP manifest drift; zero connections')
manifest = json.loads(body)
approval = {
    'status': 'APPROVED', 'reviewStatus': 'APPROVED',
    'operationId': 'e544677b-b75b-4734-bdf7-cda99e4f013a',
    'mode': 'caddy-default-logger-selective-private-ram-read',
    'manifestSHA256': manifest_sha, 'scope': manifest['scope'],
    'runtimeApprovalReference': 'Managed runtime approval of this exact require_escalated exec_command for operation e544677b-b75b-4734-bdf7-cda99e4f013a, including private default subtree only in remote RAM; independent review ' + review_reference,
    'selectiveDefaultPrivateSubtreeRAMAccessExplicitlyApproved': True,
    'environmentOrLogContentAccessApproved': False,
    'wholeConfigAccessApproved': False,
}
fd = os.open(base / 'execution-approval.json', os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
with os.fdopen(fd, 'w') as stream:
    json.dump(approval, stream, sort_keys=True)
    stream.flush()
    os.fsync(stream.fileno())
result = subprocess.run([sys.executable, '-B', str(base / 'run_default.py'), '--operation-id', approval['operationId']], check=False)
raise SystemExit(result.returncode)
PY
```

El wrapper toma fuentes, manifest y grant una vez, comprueba hashes y envía esos
mismos buffers. El marker exclusivo consume el intento antes del SSH. No borrar ni
reutilizar marker/grant/receipt tras STOP. La salida finita no cierra 8ce56224:
seguridad efectiva, productores custom y named logger coverage siguen false.

Insertar SHA de manifest y revisión en la invocación de root después del sello final,
sin modificar este documento ni las fuentes selladas. Si el runtime exige también
consentimiento humano para ese acceso privado, root debe obtenerlo antes; nunca
deducirlo del archivo local ni de esta receta.
