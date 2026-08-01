/**
 * Guardarraíl de UNA regla de `base.css`: `[hidden] { display: none !important }`.
 *
 * Por qué tiene test propio. El atributo `hidden` lo oculta el NAVEGADOR con una regla suya, y
 * cualquier regla de autor le gana: a un elemento cuya clase diga `display: flex` el `hidden` deja
 * de ocultarlo, sin error, sin aviso y sin que se caiga ningún test. Ya pasó en la ficha del editor
 * visual (`VisualInspector.svelte`), que monta TODOS los bloques y esconde los no elegidos con
 * `hidden`: se veían los N apilados y la ficha parecía no seguir a la selección. Los tests de esa
 * pantalla no lo vieron porque consultan el ATRIBUTO (`.vega-inspector-body:not([hidden])`), que
 * estaba puesto y era correcto — el atributo no es la propiedad.
 *
 * **Por qué esto NO monta nada y solo mira el texto de la hoja.** El test evidente (inyectar
 * `base.css` en jsdom, crear un `div` con `display: flex` + `hidden`, comprobar que su
 * `getComputedStyle().display` es `none`) se escribió, salió verde… y SIGUIÓ VERDE al quitarle el
 * `!important` a la hoja. O sea: jsdom no resuelve esta cascada como un navegador y ese test no
 * habría cazado nunca el fallo que motivó la regla. Un instrumento que no se pone rojo cuando el
 * código está mal no vale, así que se cambió por esta comprobación de la FUENTE, que es pobre pero
 * honesta: dice que la declaración está y está marcada, no que el navegador la respete.
 *
 * El comportamiento sí se comprobó, a mano y en Chromium (Playwright, agosto 2026): con
 * `display: flex` en la clase, un elemento con `hidden` daba `display: flex`; quitando el
 * `display` de la clase, daba `none`. La versión de verdad de este test —abrir el editor visual en
 * un navegador y exigir UNA sola ficha visible— es parte de la tarea de e2e del editor visual,
 * donde ya hay un navegador de verdad corriendo.
 *
 * Los comentarios se quitan ANTES de buscar: la propia cabecera de la regla en `base.css` cita
 * `[hidden] { display: none }` como ejemplo de lo que hace el navegador, y un guardarraíl que busca
 * texto suelto se lo tragaría como si fuera la regla.
 */

import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

// Del disco, no `import ... from './base.css?raw'`: en el proyecto `server` (SSR) Vite devuelve
// CADENA VACÍA para el CSS, así que ese import dejaría el test pasando sobre nada.
const baseCss = readFileSync(new URL('./base.css', import.meta.url), 'utf8');

/** `base.css` sin comentarios `/* … *\/`, para no confundir la documentación con el código. */
const css = baseCss.replace(/\/\*[\s\S]*?\*\//g, '');

test('`base.css` neutraliza `[hidden]` con `!important`', () => {
	const rule = /\[hidden\]\s*\{([^}]*)\}/.exec(css);
	expect(rule, 'no hay ninguna regla `[hidden]` en base.css').not.toBeNull();
	expect(rule![1]).toMatch(/display\s*:\s*none\s*!important\s*;?/);
});
