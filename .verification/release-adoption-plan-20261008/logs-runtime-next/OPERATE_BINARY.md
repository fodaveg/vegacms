# Caddy binary metadata: siguiente operación concreta

Preparación revisable. Ninguna conexión, grant, marker ni receipt se ha creado.
Root debe leer wrapper, binary-metadata-manifest-v2 y bibliotecas antes de solicitar una aprobación
runtime nueva para **la invocación completa** siguiente. El alcance incluye el
stdout de `caddy list-modules`, potencialmente con nombres custom, solo en RAM
remota; `caddy version`; dos pins `.Id`/`.Image`/`.Config.Tty`. Son cuatro comandos
Docker. Excluye GET, Env, logs, whole config, otros hosts/loggers
y escrituras remotas. Los grants consumidos no autorizan esta operación.

Tras revisión independiente, root sustituye los dos placeholders con el SHA final
del binary-metadata-manifest-v2 y la referencia real de revisión. Presenta el bloque completo como
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
body = (base / 'binary-metadata-manifest-v2.json').read_bytes()
if hashlib.sha256(body).hexdigest() != manifest_sha:
    raise SystemExit('STOP manifest drift; zero connections')
manifest = json.loads(body)
approval = {
    'status': 'APPROVED', 'reviewStatus': 'APPROVED',
    'operationId': 'c459ae09-0a35-46a8-9470-f2f12dd2fb4d',
    'mode': 'caddy-fixed-binary-metadata-module-ram-read',
    'manifestSHA256': manifest_sha, 'scope': manifest['scope'],
    'runtimeApprovalReference': 'Managed runtime approval of this exact require_escalated exec_command for operation c459ae09-0a35-46a8-9470-f2f12dd2fb4d, including version and list-modules stdout (potential custom identities) only in remote RAM and pre/post Id/Image/Config.Tty pins; independent review ' + review_reference,
    'selectiveBinaryMetadataAndModuleStdoutRAMAccessExplicitlyApproved': True,
    'environmentOrLogContentAccessApproved': False,
    'wholeConfigAccessApproved': False,
}
fd = os.open(base / 'binary-execution-approval.json', os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
with os.fdopen(fd, 'w') as stream:
    json.dump(approval, stream, sort_keys=True)
    stream.flush()
    os.fsync(stream.fileno())
result = subprocess.run([sys.executable, '-B', str(base / 'run_binary_metadata.py'), '--operation-id', approval['operationId']], check=False)
raise SystemExit(result.returncode)
PY
```

El wrapper toma fuentes, manifest y grant una vez, comprueba hashes y envía esos
mismos buffers. El marker exclusivo consume el intento antes del SSH. No borrar ni
reutilizar marker/grant/receipt tras STOP. La salida finita no cierra 8ce56224:
seguridad efectiva, productores custom y named logger coverage siguen false.
Los markers/recibos de esta operación llevan prefijo binary; nunca tocar los e544 consumidos.

Insertar SHA de manifest y revisión en la invocación de root después del sello final,
sin modificar este documento ni las fuentes selladas. Si el runtime exige también
consentimiento humano para esos nombres custom transitorios en RAM, root debe obtenerlo antes; nunca
deducirlo del archivo local ni de esta receta.
