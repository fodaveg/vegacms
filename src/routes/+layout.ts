/**
 * Vega es una SPA estática: sin SSR (el admin siempre corre en el navegador, contra el
 * `BackendPort` configurado) y sin prerender (todo el contenido depende de sesión/datos en
 * tiempo real). `@sveltejs/adapter-static` necesita `fallback` (ver `vite.config.ts`) para
 * servir esto como app de página única.
 */
export const ssr = false;
export const prerender = false;
