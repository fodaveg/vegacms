/**
 * Tests de `resolveFocusTarget` (Fase F5-g, L-P5.2, fix de code-review `🟡 1`): jsdom real, sobre
 * un fragmento DOM construido a mano con el mismo marcado que pintan `FieldRow.svelte`/los
 * widgets (`.vega-field-row[data-field]`, ids de `field-ids.ts`) — no monta ningún componente
 * Svelte, solo ejercita la resolución DOM en sí.
 */

import { describe, expect, test } from 'vitest';
import { fieldIds } from './field-ids';
import { resolveFocusTarget } from './focus-target';

/** Fila de un widget INPUT normal (`text`/`select`/…, el `inputId` ya es el control real). */
function inputRow(name: string, disabled = false): string {
	const { inputId } = fieldIds(name);
	return `<div class="vega-field-row" data-field="${name}">
		<input id="${inputId}" type="text" ${disabled ? 'disabled' : ''} />
	</div>`;
}

/**
 * Fila de un widget de tipo GRUPO (`chips`/`relation`): `role="group"` sobre un `<div>` con el
 * `inputId` (NO focusable), seguido de N botones candidatos, cada uno opcionalmente `disabled`.
 */
function groupRow(name: string, buttonsDisabled: boolean[]): string {
	const { inputId } = fieldIds(name);
	const buttons = buttonsDisabled
		.map((disabled, i) => `<button ${disabled ? 'disabled' : ''}>opción ${i}</button>`)
		.join('');
	return `<div class="vega-field-row" data-field="${name}">
		<div id="${inputId}" role="group">${buttons}</div>
	</div>`;
}

function containerWith(html: string): HTMLElement {
	const div = document.createElement('div');
	div.innerHTML = html;
	return div;
}

describe('resolveFocusTarget — target directo (widget input/select/textarea/file)', () => {
	test('el `inputId` es focusable → se devuelve directamente', () => {
		const root = containerWith(inputRow('title'));
		const target = resolveFocusTarget(root, 'title');
		expect(target?.tagName).toBe('INPUT');
		expect(target?.id).toBe(fieldIds('title').inputId);
	});

	test('el `inputId` está `disabled` → NO se acepta, cae al fallback de fila (aquí sin más candidatos → null)', () => {
		const root = containerWith(inputRow('title', true));
		expect(resolveFocusTarget(root, 'title')).toBeNull();
	});
});

describe('resolveFocusTarget — fallback de grupo (widget chips/relation, `role="group"` no focusable)', () => {
	test('sin ningún candidato deshabilitado → el PRIMERO del DOM', () => {
		const root = containerWith(groupRow('tags', [false, false, false]));
		const target = resolveFocusTarget(root, 'tags');
		expect(target?.tagName).toBe('BUTTON');
		expect(target?.textContent).toBe('opción 0');
	});

	test('el PRIMER candidato `disabled` (maxSelect alcanzado) y el segundo habilitado → devuelve el SEGUNDO (el caso del bug)', () => {
		// Repro exacta del `🟡 1`: `maxSelect` deshabilita las opciones NO seleccionadas en el
		// orden de `options`, no en el de selección — la opción 0 (ya no seleccionable) va
		// PRIMERO en el DOM aunque la 1 siga siendo un target válido.
		const root = containerWith(groupRow('tags', [true, false, true]));
		const target = resolveFocusTarget(root, 'tags');
		expect(target?.tagName).toBe('BUTTON');
		expect(target?.textContent).toBe('opción 1');
	});

	test('TODOS los candidatos deshabilitados → null (no hay nada operable en la fila)', () => {
		const root = containerWith(groupRow('tags', [true, true]));
		expect(resolveFocusTarget(root, 'tags')).toBeNull();
	});
});

describe('resolveFocusTarget — casos sin fila / sin candidatos', () => {
	// Documenta el comportamiento que ve `RecordForm.focusFirstErrorField`: un `null` aquí es un
	// no-op silencioso (`target?.focus()`), NUNCA lanza — no debería darse en la práctica (D-P5.1
	// exige que un campo con error tenga al menos un control operable), pero L11 manda degradar
	// sin crashear si algún día pasara.
	test('no existe ninguna fila para `name` → null', () => {
		const root = containerWith(inputRow('title'));
		expect(resolveFocusTarget(root, 'campo-inexistente')).toBeNull();
	});

	test('fila SIN ningún elemento focusable (ni directo ni dentro) → null', () => {
		const root = containerWith(
			`<div class="vega-field-row" data-field="tags"><span>sin controles</span></div>`
		);
		expect(resolveFocusTarget(root, 'tags')).toBeNull();
	});
});

/**
 * Fila de un widget `richtext` (`Richtext.svelte`): la barra de herramientas (botones) va ANTES del
 * contenedor con el `inputId`, que no es focusable y dentro lleva el `contenteditable` de TipTap.
 */
function richtextRow(name: string, scope: string | null = null): string {
	const { inputId, labelId } = fieldIds(name, scope);
	return `<div class="vega-field-row" data-field="${name}">
		<label id="${labelId}" for="${inputId}">Contenido</label>
		<div class="vega-widget-richtext">
			<div role="toolbar"><button type="button">Negrita</button><button type="button">Cursiva</button></div>
			<div id="${inputId}" aria-labelledby="${labelId}">
				<div class="ProseMirror" contenteditable="true" tabindex="0" role="textbox"></div>
			</div>
		</div>
	</div>`;
}

describe('resolveFocusTarget — texto enriquecido y ámbito de bloque (lote 13, «ir al campo»)', () => {
	test('con el `inputId` como contenedor, el foco va a lo que hay DENTRO (el editor), no a la barra de herramientas', () => {
		const root = containerWith(richtextRow('body'));
		const target = resolveFocusTarget(root, 'body');
		expect(target?.getAttribute('contenteditable')).toBe('true');
		expect(target?.textContent).not.toBe('Negrita');
	});

	test('un `contenteditable` cuenta como focusable aunque no lleve `tabindex`', () => {
		const root = containerWith(
			`<div class="vega-field-row" data-field="body"><div id="${fieldIds('body').inputId}"><div contenteditable="true"></div></div></div>`
		);
		expect(resolveFocusTarget(root, 'body')?.getAttribute('contenteditable')).toBe('true');
	});

	test('con `scope`, resuelve los ids de ESA fila de bloque y no la del mismo campo de otro bloque', () => {
		const root = containerWith(
			`${inputRow('body')}
			<div id="vega-block-body-b1">${richtextRow('body', 'b1')}</div>
			<div id="vega-block-body-b2">${richtextRow('body', 'b2')}</div>`
		);
		const target = resolveFocusTarget(root, 'body', 'b2');
		expect(target?.closest('#vega-block-body-b2')).not.toBeNull();
		expect(target?.getAttribute('contenteditable')).toBe('true');
		// Sin `scope`, el comportamiento histórico: el campo del registro, no el de un bloque.
		expect(resolveFocusTarget(root, 'body')?.id).toBe(fieldIds('body').inputId);
	});

	test('con `scope` y un `inputId` focusable directo (un `<input>` de bloque), lo devuelve', () => {
		const { inputId } = fieldIds('href', 'b7');
		const root = containerWith(
			`<div class="vega-field-row" data-field="href"><input id="${inputId}" type="url" /></div>`
		);
		expect(resolveFocusTarget(root, 'href', 'b7')?.id).toBe(inputId);
	});

	test('con `scope` y sin esa fila de bloque → null', () => {
		const root = containerWith(richtextRow('body', 'b1'));
		expect(resolveFocusTarget(root, 'body', 'b9')).toBeNull();
	});
});
