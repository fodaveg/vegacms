# Papelera — selector del consumidor E2E

**Delta listo por revisión; navegador focal pendiente.** Base `147e51b84d6f16e50107a88ec014d15f1a5eca7a`, WT `/private/tmp/vegacms-trash-history-20261007`, árbol `1154ca9d92a2603e5b4887580ea683319220d566`.

Inventario stat/name-status y diff leído completo **1/1 archivo**, e2e/trash.spec.ts, +1/-1. Index coincide y no hay unstaged. goToTrash pasa exact:false a exact:true para seleccionar el enlace de navegación cuyo nombre es Papelera; la nueva oferta Home contiene también papelera en su texto, pero enlaza a Ajustes. El selector conserva el objetivo real y evita strict-mode ambiguity, sin ocultar el CTA ni modificar la fuente. Assertions y demás flujo de los casos quedan intactos.

Grafo ya consultado para este consumidor sin resultado de tests; se leyó el helper y sus casos vecinos en el candidato. Formato/ESLint0 informados por autor; prueba focal/browser aún pendiente del slot asignado. No se ejecutó navegador ni suite desde revisión. El gate del candidato anterior939bec8f sigue fallido hasta corregir ambos casos y verificar el candidato integrado nuevo.
