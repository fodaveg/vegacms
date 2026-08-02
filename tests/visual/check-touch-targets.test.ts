/**
 * Fixtures sintéticos (sin tocar disco) para `scripts/check-touch-targets.mjs`, mismo criterio que
 * `tests/themes/check-theme-coverage.test.ts`: se testean las funciones puras directamente sobre
 * fuente inventada, nunca sobre los componentes reales del repo (esos ya los cubre correr el
 * script a mano, ver el informe de la tarea).
 */

import { describe, expect, test } from 'vitest';
import {
	checkComponent,
	evaluateControl,
	extractControls,
	extractMarkup,
	parseStyleScopes,
	stripHtmlComments,
	toPx
} from '../../scripts/check-touch-targets.mjs';

describe('toPx', () => {
	test('convierte rem con la raíz de 16px', () => {
		expect(toPx('1.6rem')).toBeCloseTo(25.6);
	});

	test('deja px tal cual', () => {
		expect(toPx('44px')).toBe(44);
	});

	test('unidad no reconocida (%, em, var(), calc()) → null', () => {
		expect(toPx('100%')).toBeNull();
		expect(toPx('2em')).toBeNull();
		expect(toPx('var(--x)')).toBeNull();
		expect(toPx('calc(100% - 4px)')).toBeNull();
	});
});

describe('extractControls', () => {
	test('un <button> con class="..." estática', () => {
		const controls = extractControls('<button type="button" class="a b"></button>');
		expect(controls).toEqual([{ tag: 'button', classes: ['a', 'b'], conditional: [] }]);
	});

	test('class:nombre={condición} se suma a las clases del control', () => {
		const controls = extractControls(
			'<button class="row" class:row--selected={selected}></button>'
		);
		expect(controls[0].classes).toEqual(['row', 'row--selected']);
		// Y queda MARCADA como condicional: es lo que impide que su caja cuente como medida (ver
		// `dropConditional` en el script).
		expect(controls[0].conditional).toEqual(['row--selected']);
	});

	test('una clase CONDICIONAL que declara tamaño no tapa el fallo de la clase base', () => {
		// El pase falso silencioso que señaló la revisión: una variante de estado con un
		// `min-height` MAYOR que el de la clase base haría que el script reportara el tamaño del
		// caso MEJOR como si fuera el de siempre. Se mide el REPOSO (solo clases fijas), así que el
		// 20px de `.btn` sigue saliendo como fallo aunque `.btn--activo` declare 44px.
		const style = `
			.btn { width: 20px; height: 20px; }
			@media (pointer: coarse) {
				.btn { min-height: 20px; min-width: 20px; }
				.btn--activo { min-height: 44px; min-width: 44px; }
			}
		`;
		const { base, coarse } = parseStyleScopes(style);
		const conVariante = evaluateControl(
			{ tag: 'button', classes: ['btn', 'btn--activo'], conditional: ['btn--activo'] },
			base,
			coarse
		);
		expect(conVariante.verdict).toBe('fail');
		expect(conVariante.fails.map((f) => f.px)).toEqual([20, 20]);
		// Y el estado que NO se mide se avisa, en vez de callarse.
		expect(conVariante.conditionalSized).toEqual(['btn--activo']);

		// Con la variante como ÚNICA clase, en reposo no queda ninguna caja: "no medible", nunca
		// "pass".
		const soloVariante = evaluateControl(
			{ tag: 'button', classes: ['btn--activo'], conditional: ['btn--activo'] },
			base,
			coarse
		);
		expect(soloVariante.verdict).toBe('no-medible');

		// Falsificación del propio criterio: la MISMA clase, declarada como FIJA, sí mide y pasa.
		const fija = evaluateControl(
			{ tag: 'button', classes: ['btn--activo'], conditional: [] },
			base,
			coarse
		);
		expect(fija.verdict).toBe('pass');
		expect(fija.conditionalSized).toEqual([]);
	});

	test('una flecha `=>` dentro de un atributo no confunde el cierre de la etiqueta', () => {
		const controls = extractControls(
			'<button type="button" class="btn" onclick={() => (open = !open)}>x</button>'
		);
		expect(controls).toEqual([{ tag: 'button', classes: ['btn'], conditional: [] }]);
	});

	test('<a> sin href se descarta, <a href> se cuenta', () => {
		const controls = extractControls('<a class="decorativo">x</a><a href="/x" class="real">y</a>');
		expect(controls).toEqual([{ tag: 'a', classes: ['real'], conditional: [] }]);
	});

	test('<input>/<select>/<textarea> también cuentan', () => {
		const controls = extractControls(
			'<input class="i" /><select class="s"></select><textarea class="t"></textarea>'
		);
		expect(controls.map((c) => c.tag)).toEqual(['input', 'select', 'textarea']);
	});

	test('un <div> no es un control, aunque lleve role/tabindex', () => {
		const controls = extractControls('<div class="separador" role="separator" tabindex="0"></div>');
		expect(controls).toEqual([]);
	});
});

describe('stripHtmlComments', () => {
	test('quita un comentario preservando el nº de líneas', () => {
		const input = '<!-- uno\ndos -->\ntres';
		const out = stripHtmlComments(input);
		expect(out.split('\n')).toHaveLength(3);
		expect(out).not.toContain('uno');
		expect(out).toContain('tres');
	});
});

describe('extractMarkup: un comentario que MENCIONA una etiqueta no debe leerse como control', () => {
	test('un comentario HTML con `<button>` de prosa no cuela como control fantasma', () => {
		const content = `
			<!-- el propio \`<button>\` (\`aria-label\`), nunca el title -->
			<button type="button" class="real">x</button>
		`;
		expect(extractControls(extractMarkup(content))).toEqual([
			{ tag: 'button', classes: ['real'], conditional: [] }
		]);
	});

	test('un comentario HTML que menciona `<style>` justo tras el `</script>` no se come el `<style>` real (bug de verdad, visto en VisualOverlay.svelte)', () => {
		const content = `
			<script>const x = 1;</script>
			<!-- no solo en el \`<style>\` de abajo -->
			<button type="button" class="real">x</button>
			<style>.real { width: 20px; height: 20px; }</style>
		`;
		// `checkComponent` es la puerta real (`main()` no llama a la regex de `<style>` a pelo, ver su
		// cabecera): si el comentario se comiera el `<style>` de verdad, esto saldría "no medible" en
		// vez de "fail", porque `base`/`coarse` quedarían vacíos.
		const [result] = checkComponent(content);
		expect(result.verdict).toBe('fail');
		expect(result.width.fine?.px).toBe(20);
		expect(result.height.fine?.px).toBe(20);
	});

	test('una mención a `<button>` dentro del JSDoc del <script> tampoco cuela', () => {
		const content = `
			<script>
				/** Nada seleccionable salvo el propio \`<button>\` de abajo. */
			</script>
			<button type="button" class="real">x</button>
		`;
		expect(extractControls(extractMarkup(content))).toEqual([
			{ tag: 'button', classes: ['real'], conditional: [] }
		]);
	});
});

describe('parseStyleScopes', () => {
	test('separa base de @media (pointer: coarse), y descarta cualquier otro @media', () => {
		const { base, coarse } = parseStyleScopes(`
			.btn { width: 20px; }
			@media (max-width: 900px) { .btn { width: 999px; } }
			@media (pointer: coarse) { .btn { min-width: 44px; } }
		`);
		expect(base).toEqual([{ className: 'btn', prop: 'width', value: '20px' }]);
		expect(coarse).toEqual([{ className: 'btn', prop: 'min-width', value: '44px' }]);
	});

	test('un selector compuesto (pseudo-clase, combinador) no aporta caja', () => {
		const { base } = parseStyleScopes(`
			.btn:hover { width: 999px; }
			.wrap .btn { height: 999px; }
			.btn { width: 30px; }
		`);
		expect(base).toEqual([{ className: 'btn', prop: 'width', value: '30px' }]);
	});

	test('varias clases en la misma regla (selector con comas) reciben las mismas declaraciones', () => {
		const { base } = parseStyleScopes('.a, .b { height: 26px; }');
		expect(base).toEqual([
			{ className: 'a', prop: 'height', value: '26px' },
			{ className: 'b', prop: 'height', value: '26px' }
		]);
	});
});

describe('checkComponent / evaluateControl: los cinco casos del encargo', () => {
	test('PASA: la caja mide 44×44 ya en la declaración base, sin necesitar puntero basto', () => {
		const content = `
			<button type="button" class="btn-pass">x</button>
			<style>.btn-pass { width: 44px; height: 44px; }</style>
		`;
		const [result] = checkComponent(content);
		expect(result.verdict).toBe('pass');
		expect(result.fails).toEqual([]);
	});

	test('FALLA por altura: anchura sobra, altura por debajo de 44px', () => {
		const content = `
			<button type="button" class="btn-short">x</button>
			<style>.btn-short { width: 60px; height: 30px; }</style>
		`;
		const [result] = checkComponent(content);
		expect(result.verdict).toBe('fail');
		expect(result.fails).toEqual([
			expect.objectContaining({ dimension: 'altura', px: 30, className: 'btn-short' })
		]);
	});

	test('FALLA por anchura: altura sobra, anchura por debajo de 44px', () => {
		const content = `
			<button type="button" class="btn-narrow">x</button>
			<style>.btn-narrow { width: 20px; height: 60px; }</style>
		`;
		const [result] = checkComponent(content);
		expect(result.verdict).toBe('fail');
		expect(result.fails).toEqual([
			expect.objectContaining({ dimension: 'anchura', px: 20, className: 'btn-narrow' })
		]);
	});

	test('PASA solo gracias al bloque de puntero basto: con puntero fino sería un fallo', () => {
		const content = `
			<button type="button" class="btn-coarse-ok">x</button>
			<style>
				.btn-coarse-ok { width: 24px; height: 24px; }
				@media (pointer: coarse) {
					.btn-coarse-ok { min-width: 44px; min-height: 44px; }
				}
			</style>
		`;
		const [result] = checkComponent(content);
		expect(result.verdict).toBe('pass');
		// El propio "puntero fino" (`.fine`) NO llega a 44px: es el bloque de puntero basto el que
		// salva el veredicto, no la declaración base.
		expect(result.width.fine?.px).toBe(24);
		expect(result.width.coarse?.px).toBe(44);
	});

	test('NO MEDIBLE: el tamaño no sale de la propia clase (crecería por padding/tipografía)', () => {
		const content = `
			<button type="button" class="btn-unmeasured">Texto largo</button>
			<style>.btn-unmeasured { padding: 0.5rem 1rem; color: var(--ink); }</style>
		`;
		const [result] = checkComponent(content);
		expect(result.verdict).toBe('no-medible');
		expect(result.fails).toEqual([]);
		expect(result.width.coarse).toBeNull();
		expect(result.height.coarse).toBeNull();
	});
});

describe('evaluateControl: un fallo medido nunca se tapa por una dimensión no medible', () => {
	test('altura conocida y por debajo de 44px → FALLA, aunque la anchura no se pueda leer', () => {
		const control = { tag: 'button', classes: ['btn-mixed'] };
		const base = [{ className: 'btn-mixed', prop: 'height', value: '40px' }];
		const result = evaluateControl(control, base, []);
		expect(result.verdict).toBe('fail');
		expect(result.width.coarse).toBeNull();
		expect(result.fails).toEqual([expect.objectContaining({ dimension: 'altura', px: 40 })]);
	});
});

describe('evaluateControl: min-* nunca deja que el valor use menos de lo que fija', () => {
	test('min-width mayor que width → gana min-width', () => {
		const control = { tag: 'button', classes: ['btn'] };
		const base = [
			{ className: 'btn', prop: 'width', value: '30px' },
			{ className: 'btn', prop: 'min-width', value: '44px' },
			{ className: 'btn', prop: 'height', value: '44px' }
		];
		const result = evaluateControl(control, base, []);
		expect(result.width.coarse?.px).toBe(44);
		expect(result.verdict).toBe('pass');
	});
});
