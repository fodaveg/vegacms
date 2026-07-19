/**
 * Versión de Vega y rango de servidor PocketBase soportado (P8·F2). Fuente de verdad ÚNICA:
 * `package.json` (campos `version` y `vega.pocketbaseServer`, este último D-P1.3: mínimo
 * 0.26.0). Nunca dupliques estos literales en otro sitio del código: `vite.config.ts` los lee
 * una sola vez y los inyecta en tiempo de build vía `define` (`__VEGA_VERSION__`,
 * `__VEGA_PB_SERVER_RANGE__`, declarados en `src/app.d.ts`); este módulo solo los reexporta
 * con nombre y tipo para que el resto de la app (p. ej. "Acerca de" en `/settings`) los consuma
 * sin tocar los globals crudos.
 */

/** Versión de Vega (`package.json#version`), horneada en build. */
export const VEGA_VERSION: string = __VEGA_VERSION__;

/** Rango de versiones de servidor PocketBase soportado (`package.json#vega.pocketbaseServer`),
 *  horneado en build. */
export const VEGA_PB_SERVER_RANGE: string = __VEGA_PB_SERVER_RANGE__;
