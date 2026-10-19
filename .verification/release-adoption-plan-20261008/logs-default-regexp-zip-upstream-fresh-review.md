# Logger default: revisión dirigida de query upstream y ZIP

Veredicto: **APTO para los claims del fixture local**, sin must-fix identificado. No certifica configuración privada, aplicación ni cobertura de loggers productivos. Sin SSH, Docker, HTTP o tests ejecutados por el revisor.

Inventario stat/name-status y lectura del nuevo driver, plan, recibo y delta final de propuesta. Se reutilizaron las revisiones del fragmento79cb y sus sondas de sintaxis/stream502.

- `zip_upstream_probe.py`: `96aece491f0972a069fd33b14006f67dc030304894e79a9be25286aee42c2563`.
- `ZIP_UPSTREAM_PLAN.md` final: `470cea0ae37406e4d61ca2cbb2a3361e580c6056a8da915f44fea7e681bc7767`; sustituye el plan preparadofeefa4e6.
- `zip-upstream-receipt.json`: `35175d897ff3f72e50dbb50211fdbd685bcb2483e43db163768568e50624b2a7`.
- Propuesta final: `16b7f8e952b61f017839d58726a9c0a7beed4321f6b550d1fcea7a4a2b476198`.
- Fragmento: `79cb9a1ac82ef4dda07c822794a8ca3e9091f3a0cab1a854ea8a20941492c441`.

El driver comprueba imagen `sha256:6b08c1b9858ca9a7d99c1da13c3695081e0e604c6cf214ca26a7ce0e2c4fd9b4`, Linux/arm64. Monta sólo fixtures propios y un ZIP determinista sintético; usa red propia, read-only, sin pull/build y puerto efímero publicado en loopback. El listener8080 proxía al8081 del mismo proceso; sólo el segundo tiene un access logger instrumental JSON/stdout. Los tokens y registros completos se mantienen en RAM y la evidencia exportada es finita.

El recibo acredita dos respuestas200 de175bytes, ambas con SHA256 del ZIP original `f863530618de8c2ab2d82b2bb0affd369a38287af5b912f3919289a7bf5aac3b`. El driver exige que los dos registros entrantes del listener interno tengan exactamente los URI enviados: caso token normal y caso combinado `%zz`, clave codificada/repetida. Las cadenas comparadas son ASCII, por lo que la igualdad del URI reconstruido prueba los bytes de query de estos fixtures. No se infiere autenticación ni semántica de parámetros del backend. La retirada del contenedor y red figura con ambos exit0.

El logger global default usa el mismo fragmento; la nueva sonda prueba que su presencia no altera esos dos GET ni sus bytes de respuesta. El logger nombrado stdout es exclusivamente instrumento local para observar el upstream y deliberadamente conserva el marcador sintético; no constituye prueba de saneamiento de access logs de producción. La ausencia del marcador en default502 pertenece a la sonda anterior y no se extiende a un record200 de default que este driver no observa.

El documento final limita sus claims de forma consistente. Los números df y filtros Docker vacíos son evidencia de ejecución aportada por owner/root, no campos del recibo ZIP ni una inspección independiente del revisor. No se exige repetir la ejecución para este dictamen.

Pendiente: fuente efectiva y fusión exacta de writer/routing/filtros/consumidores, revisión y autorización runtime del candidato productivo, y comprobación posterior. La imagen local6b08 no es la imagen productiva5f5c. El fixture no prueba descargas autenticadas, otros upstreams, servidores/loggers/sinks o retención, ni concede lectura de Env/configuración privada. `8ce56224` no queda cerrado con esta evidencia.
