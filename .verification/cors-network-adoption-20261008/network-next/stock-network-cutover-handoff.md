# Vega stock: candidato fase B, red dedicada (9 oct 2026)

**Candidato local pendiente de revisión; no ejecutar.** Depende de una fase A
`CADDY_ATTACHED_PARTIAL` acreditada y de su `edgeBackupId` real. No reutiliza
ningún ID antiguo ni baja imagen: exige el `vega-pb` CORS actual ID
`007b755b8de76195d857181ce985a9522fe71c5d2941a2c1597b310d12d56881`,
imagen `sha256:dd978b8d23081d2e3c69ebf6ef8ff4599a1acdd3f38dc559ae6fa379e46449b4`,
CMD con `--origins=https://admin.vegacms.com`, sin puerto publicado y volumen
`vega_data` intacto. Su preimagen Compose
`11593d1da51e580f988058bfac8288194eaeb7697ac7db2f6926815f8d14dcde`
produce exclusivamente `50b1d28af027fc64e48788fbdc3b6e7703ea6d5420e8d2f94a0b3409dd86c08a`.
`stock-after-cors-preimage.compose.yml` y `stock-vega-edge.candidate.compose.yml`
acreditan la comparación byte a byte del delta.

El adaptador importa, con SHA fijo, el cutover CORS revisado `079f3cfa…` y
su helper de imagen `5d4131c2…`; conserva sus guardas de archivo/entorno
**propios de Vega**, copia quiesced de `vega_data`, archivo privado, ensayo
aislado de restauración, create sin build/pull, ID fijado antes de start,
health/argv y rollback sin restaurar datos vivos. Cambia solo spec actual,
patch de redes y runtime esperado: `edge` antes, `vega-edge` después, mismo
comando/imagen/mount/puerto. Añade guard sobre fase A, hash/identidad del
Compose Caddy instalado, HEAD/índice conocido, Caddy exacto en `edge` y
`vega-edge`, etiqueta e ID de red propia, dos miembros máximos conocidos e
ID de red efectivo del PB nuevo. No lee Env/config/logs de Caddy; el `.env`
de Vega se comprueba en RAM conforme al helper ya revisado.

Fuentes locales selladas actuales:

- `remote_stock_network_adapter.py` SHA-256 `4437eaef7df9843335e03845bc768d4a7ffd42db522201fd17a0e2503017ed43`.
- `run_stock_network_candidate.py` SHA-256 `5c03308a2489013846cd2303a5a12aa3dce6e66a27216fe8afcda67a87468215`.
- `selftest_stock_network.py` SHA-256 `9228f69f1813c3f0956b3b23dcd1925f21f75968e4633e7bf242058b5d6790b4`.

`python3 -B selftest_stock_network.py` → 5 tests, exit 0: delta/argv exactos,
topología e ID de red, membresía propia y esquema de transporte. Ningún SSH,
Docker, build ni suite pesada se ejecutó en esta preparación.

Tras revisión independiente y grant runtime nuevo, root ejecutaría primero
`check` con el `edgeBackupId` producido por fase A; sólo con recibo vigente y
presupuesto/imagen/datos verdes ejecutaría `apply`. El resultado positivo del
script es `NETWORK_APPLIED_AWAITING_PUBLIC_SMOKE`, **aún no certifica servido**.
Root debe repetir las comprobaciones públicas del mismo candidato: 153/153
assets, API/health, CORS propio/ajeno/null, alias `vega-pb:8090` desde Caddy,
PB solo en `vega-edge`, Caddy en ambas redes, ningún puerto PB publicado y
peer viejo `edge` sin acceso directo. Para fallo propio, `rollback` vuelve al
Compose CORS `11593…` y recrea PB sobre `edge` con la misma imagen/volumen;
después exige smoke público antes de retirar el attach/red de fase A.

Aunque A+B y esos smokes queden verdes, la fuente Caddy publicadora y su
comportamiento en futura recreación siguen sin acreditarse. El attach vivo
no satisface por sí solo la durabilidad exigida por el contrato de red. La
lectura privada de Caddy permanece fuera de este encargo.
