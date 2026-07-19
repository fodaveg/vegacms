# Configuración de Vega

Vega se configura mediante un fichero JSON opcional, `static/vega.config.json`, que se lee en runtime (sin build) al iniciar la app.

## Configuración de PocketBase remoto

### Fichero de configuración

Crea `static/vega.config.json` con la siguiente estructura:

```json
{
	"backendUrl": "https://pb.example.com"
}
```

**Campos**:

- **`backendUrl`** (opcional, string): URL absoluta del servidor PocketBase (http:// o https://). Si está ausente o no es válido, Vega usa same-origin (el valor por defecto).

### Comportamiento

1. **Same-origin (default)**: Si `static/vega.config.json` no existe o `backendUrl` está ausente, Vega busca PocketBase en el mismo origen (`window.location.origin`). Es el caso más común cuando la SPA está copiada a `pb_public/` de PocketBase.

2. **Origen distinto**: Si defines `backendUrl`, Vega se conecta a ese servidor en lugar de same-origin. Debes habilitar CORS en PocketBase para que el navegador permita la conexión (ver [Integración con PocketBase](POCKETBASE-INTEGRATION.md)).

3. **Fallos**: Si la lectura de `vega.config.json` falla (404, JSON inválido, etc.) o `backendUrl` es malformado, Vega cae silenciosamente a same-origin. Nunca bloquea el arranque.

### Ejemplo

**Escenario**: tienes Vega desplegado en `https://admin.example.com/` y PocketBase en `https://api.example.com/`.

1. Antes de hacer build, crea `static/vega.config.json`:

   ```json
   {
   	"backendUrl": "https://api.example.com"
   }
   ```

2. Build:

   ```sh
   pnpm build
   ```

3. Despliega `build/` en `https://admin.example.com/`.

4. Asegúrate de que PocketBase en `https://api.example.com/` permite CORS desde `https://admin.example.com/` (ver [Integración con PocketBase](POCKETBASE-INTEGRATION.md)).

Al cargar la app, Vega lee `vega.config.json` en runtime y se conecta a `https://api.example.com/`.

## Validación en tiempo de build

Para verificar que tu `static/vega.config.json` es válido durante el desarrollo:

1. Asegúrate de que está colocado en `static/` (no en `public/` ni otro lado).
2. El fichero debe ser un JSON válido con la estructura indicada arriba.
3. Reinicia el servidor de desarrollo después de cambiar la configuración.

## Cambios frecuentes

Si necesitas cambiar `backendUrl` entre entornos sin recompilar:

1. Edita `static/vega.config.json` **después** de que la SPA esté desplegada (antes de hacer build, o en el servidor después de desplegar).
2. Recarga la página en el navegador — Vega re-lee el fichero en runtime.

**Nota**: esto requiere acceso al servidor web donde está la SPA. Si no lo tienes, deberás recompilar y redesplegar la SPA (ver [Guía de instalación](INSTALL.md)).
