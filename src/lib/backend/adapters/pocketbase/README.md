# Adaptador `pocketbase` — Fase 2

Este directorio es, por contrato (§1 del contrato P1), el **único lugar del repo donde puede
existir `import ... from 'pocketbase'`** (ley L1, forzada por la regla de lint
`no-restricted-imports` en `eslint.config.js`).

La implementación de `createPocketBaseBackend({ url }): BackendPort` es **Fase 2** y no está
hecha todavía. Este README deja anotado el layout y una landmine ya conocida para cuando se
implemente:

## Landmine: autocancelación del SDK

El SDK oficial `pocketbase` **cancela automáticamente** peticiones "duplicadas" que sigan en
vuelo cuando llega una nueva petición al mismo endpoint (pensado para UIs tipo autocompletar).
Eso produce aborts fantasma que este puerto mapearía como `VegaError 'network'` sin que haya
habido ningún fallo real — ver §4.6 y la tabla de mapeo de §5 ("Abort (incluida la
autocancelación del SDK si se colase) → `network`").

**La autocancelación DEBE desactivarse en todas las llamadas** del adaptador (`requestKey: null`
por llamada, o `pb.autoCancellation(false)` a nivel de cliente). La política de cancelación de
peticiones es de los consumidores (P3/P4), no del transporte. Sin este ajuste, cualquier
`list()`/`get()` disparado dos veces seguidas desde la UI se auto-cancela y aparece como error
de red intermitente — un bug muy difícil de reproducir si no se sabe que existe.

## Layout esperado (Fase 2)

```
adapters/pocketbase/
  index.ts        — createPocketBaseBackend({ url }): BackendPort
  schema.ts        — mapeo de esquema PB → Vega (§6 del contrato)
  errors.ts         — mapeo ClientResponseError/fetch → VegaError (§5)
  query.ts          — compilación del AST de Query a filtros PB con binding de parámetros (§4.6)
  files.ts          — subida/URL/thumb (§4.4)
```

Todo lo demás (harness que arranca un binario de PocketBase para CI, colección fixture real,
job de CI) es de Fase 2/P8; no se monta aquí todavía.
