/**
 * Tests de `a11y-audit.ts` (ver su cabecera): jsdom real, sobre fragmentos DOM construidos a mano
 * — mismo criterio que `focus-target.dom.test.ts`, el precedente de este repo. No monta ningún
 * componente Svelte: estas funciones son DOM puro, así que el fixture más barato que las ejercite
 * de verdad es HTML a pelo.
 */
import { afterEach, describe, expect, test } from 'vitest';
import {
	focusables,
	focusablesUnderAriaHidden,
	focusablesUnderHidden,
	focusLost
} from './a11y-audit';

/** Fragmento SUELTO (mismo criterio que `focus-target.dom.test.ts`): no se anexa a `document.body`
 *  porque a `focusables`/`focusablesUnderAriaHidden`/`focusablesUnderHidden` no les importa si el
 *  árbol está conectado al documento, solo su forma. */
function containerWith(html: string): HTMLElement {
	const div = document.createElement('div');
	div.innerHTML = html;
	return div;
}

describe('focusables', () => {
	test('recoge INPUT/SELECT/TEXTAREA/BUTTON/A y `[tabindex]`, en orden de DOM', () => {
		const root = containerWith(`
			<input id="i" />
			<span tabindex="0" id="s">span tabulable</span>
			<select id="sel"></select>
			<textarea id="t"></textarea>
			<button id="b">botón</button>
			<a href="#" id="a">enlace</a>
			<p id="p">texto normal, no cuenta</p>
		`);
		const ids = focusables(root).map((el) => el.id);
		expect(ids).toEqual(['i', 's', 'sel', 't', 'b', 'a']);
	});

	test('descarta `disabled`', () => {
		const root = containerWith(`<button id="ok">ok</button><button id="no" disabled>no</button>`);
		expect(focusables(root).map((el) => el.id)).toEqual(['ok']);
	});

	test('descarta `tabindex="-1"` (focusable por script, nunca por Tab)', () => {
		const root = containerWith(
			`<h2 id="heading" tabindex="-1">ancla de foco</h2><button id="btn">ok</button>`
		);
		expect(focusables(root).map((el) => el.id)).toEqual(['btn']);
	});

	test('un `<div>` sin `tabindex` no cuenta, aunque tenga manejadores', () => {
		const root = containerWith(`<div id="d" onclick="">no focusable de verdad</div>`);
		expect(focusables(root)).toEqual([]);
	});
});

describe('focusablesUnderAriaHidden — antipatrón "interactivo pero invisible"', () => {
	test('vacío: sin ningún `aria-hidden` en el árbol', () => {
		const root = containerWith(`<button id="b">ok</button>`);
		expect(focusablesUnderAriaHidden(root)).toEqual([]);
	});

	test('un botón dentro de un `aria-hidden="true"` sale atrapado', () => {
		const root = containerWith(
			`<div aria-hidden="true"><button id="trapped">atrapado</button></div>`
		);
		expect(focusablesUnderAriaHidden(root).map((el) => el.id)).toEqual(['trapped']);
	});

	test('anidamiento: el `aria-hidden` de un ANCESTRO lejano también cuenta', () => {
		const root = containerWith(
			`<div aria-hidden="true"><div><div><button id="deep">hondo</button></div></div></div>`
		);
		expect(focusablesUnderAriaHidden(root).map((el) => el.id)).toEqual(['deep']);
	});

	test('`aria-hidden="false"` NO atrapa (solo cuenta el valor `"true"`)', () => {
		const root = containerWith(`<div aria-hidden="false"><button id="b">ok</button></div>`);
		expect(focusablesUnderAriaHidden(root)).toEqual([]);
	});

	test('un botón fuera del `aria-hidden`, hermano de uno atrapado, no sale', () => {
		const root = containerWith(`
			<div aria-hidden="true"><button id="trapped">atrapado</button></div>
			<button id="free">libre</button>
		`);
		expect(focusablesUnderAriaHidden(root).map((el) => el.id)).toEqual(['trapped']);
	});
});

describe('focusablesUnderHidden — antipatrón contrario (control inalcanzable por Tab)', () => {
	test('vacío: sin ningún `hidden` en el árbol', () => {
		const root = containerWith(`<button id="b">ok</button>`);
		expect(focusablesUnderHidden(root)).toEqual([]);
	});

	test('un botón dentro de un ancestro `hidden` sale atrapado', () => {
		const root = containerWith(`<div hidden><button id="trapped">atrapado</button></div>`);
		expect(focusablesUnderHidden(root).map((el) => el.id)).toEqual(['trapped']);
	});

	test('anidamiento: el `hidden` de un ANCESTRO lejano también cuenta', () => {
		const root = containerWith(
			`<div hidden><div><div><button id="deep">hondo</button></div></div></div>`
		);
		expect(focusablesUnderHidden(root).map((el) => el.id)).toEqual(['deep']);
	});

	test('un botón fuera del `hidden`, hermano de uno atrapado, no sale', () => {
		const root = containerWith(`
			<div hidden><button id="trapped">atrapado</button></div>
			<button id="free">libre</button>
		`);
		expect(focusablesUnderHidden(root).map((el) => el.id)).toEqual(['trapped']);
	});
});

describe('focusLost', () => {
	// Los dos últimos casos SÍ necesitan un árbol conectado (`isConnected`/`document.activeElement`
	// solo tienen sentido dentro del documento real) — se anexan a `document.body` y se limpian
	// aquí, para no dejar botones huérfanos con ids repetidos acumulándose entre tests del mismo
	// fichero (jsdom desvaría con `querySelector` sobre un documento lleno de ids duplicados que
	// nadie limpió — se cazó de verdad escribiendo este mismo test).
	let mounted: HTMLElement | null = null;

	afterEach(() => {
		mounted?.remove();
		mounted = null;
	});

	function connectedContainerWith(html: string): HTMLElement {
		const div = containerWith(html);
		document.body.appendChild(div);
		mounted = div;
		return div;
	}

	test('`null` cuenta como foco perdido', () => {
		const root = containerWith(`<button id="b">ok</button>`);
		expect(focusLost(root, null)).toBe(true);
	});

	test('`document.body` cuenta como foco perdido', () => {
		const root = containerWith(`<button id="b">ok</button>`);
		expect(focusLost(root, document.body)).toBe(true);
	});

	test('un elemento DESCONECTADO del documento cuenta como foco perdido', () => {
		const root = containerWith(`<button id="b">ok</button>`);
		const orphan = document.createElement('button');
		expect(orphan.isConnected).toBe(false);
		expect(focusLost(root, orphan)).toBe(true);
	});

	test('un elemento conectado y distinto de `<body>` NO cuenta como foco perdido', () => {
		const root = connectedContainerWith(`<button id="b">ok</button>`);
		const btn = root.querySelector<HTMLButtonElement>('#b')!;
		btn.focus();
		expect(document.activeElement).toBe(btn);
		expect(focusLost(root, document.activeElement)).toBe(false);
	});
});
