# Review de la lectura selectiva de identidad

Veredicto: **APTO para la etapa RO**, en los hashes exactos:

- remote_image_identity.py `2dc473e1ba30ed494da992b61a4d2b74a45c289265eec8e4a17082cee585efe0`.
- run_image_identity.py `515d7c9b4d313c7fd7820256d0f8297721034e6859684be8ba1f20d9a7c5a273`.

Ambas fuentes completas y sus tres fixtures leídos. Solo se consultan los tres tags candidatos conocidos. Los templates seleccionan ID, OS/arquitectura, RootFS.Layers, Descriptor y la única label de revisión; Descriptor se filtra en RAM a digest/mediaType. Ninguna anotación ni config completa ni Env sale del servidor. Plataforma, digests, listas y revisión se validan antes de proyectar un esquema exacto. El wrapper fija fuente por hash y descarta salidas crudas. No pide contenedores, Compose, Caddy ni logs ni ejecuta load o mutaciones.

No ejecuté tests, DockerAPI ni SSH. APTO acredita seguridad y alcance de la lectura, no la identidad equivalente de las imágenes ni un guard nuevo de cutover. La comparación debe demostrar la cadena criptográfica del archivo sellado: digest del blob manifest OCI, su config.digest, digest de bytes del config y correspondencia de diffIDs/plataforma con el runtime. El projector local original observado no probaba aún ese enlace; owner fue avisado y el dictamen de correspondencia queda pendiente de su versión corregida y resultado vivo.
