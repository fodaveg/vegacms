import { describe, expect, test } from 'vitest';
import {
	DEFAULT_REDIRECT_CHOICE,
	hasRedirectConflict,
	isEmptyRedirectOps,
	isRedirectFrom,
	isRedirectTo,
	planRedirect,
	resolveRedirectOps,
	type RedirectPlanInput,
	type RedirectRef
} from './redirect-plan';
import {
	SITE_SEED_REDIRECT_FROM_PATTERN,
	SITE_SEED_REDIRECT_TO_PATTERN
} from '$lib/backend/site-seeding';

const OLD = '/sobre-nosotros';
const NEW = '/quienes-somos';

const ref = (id: string, from: string, to: string): RedirectRef => ({ id, from, to });

function input(over: Partial<RedirectPlanInput> = {}): RedirectPlanInput {
	return {
		oldPath: OLD,
		newPath: NEW,
		published: true,
		hasRedirects: true,
		access: { create: true, update: true, delete: true },
		existing: [],
		...over
	};
}

describe('planRedirect: cuándo no se ofrece nada', () => {
	test('página no publicada', () => {
		expect(planRedirect(input({ published: false }))).toBeNull();
	});

	test('sin colección redirects', () => {
		expect(planRedirect(input({ hasRedirects: false }))).toBeNull();
	});

	test.each(['create', 'update', 'delete'] as const)('sin permiso de %s', (op) => {
		const access = { create: true, update: true, delete: true, [op]: false };
		expect(planRedirect(input({ access }))).toBeNull();
	});

	test('ruta sin cambio', () => {
		expect(planRedirect(input({ newPath: OLD }))).toBeNull();
	});

	test.each([
		['nueva vacía', { newPath: '' }],
		['nueva sin barra', { newPath: 'quienes' }],
		['nueva con espacios', { newPath: '/quienes somos' }],
		['nueva que empieza por //', { newPath: '//quienes' }],
		['vieja vacía (página sin ruta)', { oldPath: '' }],
		['vieja sin barra', { oldPath: 'vieja' }],
		['vieja de más de 200', { oldPath: '/' + 'a'.repeat(200) }]
	] as const)('ruta no válida para redirects: %s', (_name, over) => {
		expect(planRedirect(input(over))).toBeNull();
	});
});

describe('planRedirect: oferta normal', () => {
	test('sin redirecciones previas: crea vieja → nueva', () => {
		const plan = planRedirect(input())!;
		expect(plan).toEqual({
			from: OLD,
			to: NEW,
			create: true,
			existing: null,
			repoint: [],
			remove: []
		});
		expect(hasRedirectConflict(plan)).toBe(false);
	});

	test('las redirecciones ajenas no cuentan', () => {
		const plan = planRedirect(input({ existing: [ref('1', '/otra', '/otro-sitio')] }))!;
		expect(plan.create).toBe(true);
		expect(plan.repoint).toEqual([]);
		expect(plan.remove).toEqual([]);
	});

	test('la raíz como ruta vieja es válida', () => {
		expect(planRedirect(input({ oldPath: '/' }))?.from).toBe('/');
	});
});

describe('planRedirect: cadena A → B → C', () => {
	test('una redirección que llegaba a la ruta vieja se reapunta', () => {
		const a = ref('1', '/nosotros', OLD);
		const plan = planRedirect(input({ existing: [a] }))!;
		expect(plan.create).toBe(true);
		expect(plan.repoint).toEqual([a]);
	});

	test('varias se reapuntan todas, y las que apuntan a otro sitio no', () => {
		const list = [
			ref('1', '/nosotros', OLD),
			ref('2', '/about', OLD),
			ref('3', '/la-cooperativa/quienes', OLD),
			ref('4', '/x', '/y')
		];
		const plan = planRedirect(input({ existing: list }))!;
		expect(plan.repoint.map((r) => r.id)).toEqual(['1', '2', '3']);
	});

	test('un destino http absoluto igual a la ruta vieja no es cadena', () => {
		const plan = planRedirect(input({ existing: [ref('1', '/a', `https://x.test${OLD}`)] }))!;
		expect(plan.repoint).toEqual([]);
	});
});

describe('planRedirect: conflicto en from', () => {
	test('ya existe una redirección desde la ruta vieja hacia otra parte', () => {
		const e = ref('9', OLD, '/empresa');
		const plan = planRedirect(input({ existing: [e] }))!;
		expect(plan.create).toBe(false);
		expect(plan.existing).toEqual(e);
		expect(hasRedirectConflict(plan)).toBe(true);
	});

	test('la cadena también se reapunta en el conflicto', () => {
		const chain = ref('1', '/nosotros', OLD);
		const plan = planRedirect(input({ existing: [ref('9', OLD, '/empresa'), chain] }))!;
		expect(plan.repoint).toEqual([chain]);
	});

	test('si ya lleva a la nueva no hay nada que hacer', () => {
		expect(planRedirect(input({ existing: [ref('9', OLD, NEW)] }))).toBeNull();
	});

	test('si ya lleva a la nueva, la cadena no se toca', () => {
		const plan = planRedirect(
			input({ existing: [ref('9', OLD, NEW), ref('1', '/nosotros', OLD), ref('5', NEW, '/z')] })
		)!;
		expect(plan.repoint).toEqual([]);
		expect(plan.remove.map((r) => r.id)).toEqual(['5']);
		expect(hasRedirectConflict(plan)).toBe(false);
	});
});

describe('planRedirect: bucle al volver a una ruta anterior', () => {
	test('existe nueva → vieja y la página vuelve a la nueva: se borra', () => {
		const loop = ref('7', NEW, OLD);
		const plan = planRedirect(input({ existing: [loop] }))!;
		expect(plan.remove).toEqual([loop]);
		expect(plan.create).toBe(true);
	});

	test('el bucle no se reapunta a sí mismo aunque su destino sea la ruta vieja', () => {
		const loop = ref('7', NEW, OLD);
		const plan = planRedirect(input({ existing: [loop] }))!;
		expect(plan.repoint).toEqual([]);
	});

	test('cualquier redirección desde la ruta viva se borra', () => {
		const shadow = ref('8', NEW, '/otra');
		const plan = planRedirect(input({ existing: [shadow] }))!;
		expect(plan.remove).toEqual([shadow]);
	});

	test('con la oferta ya satisfecha, el bucle sigue dando plan', () => {
		const plan = planRedirect(input({ existing: [ref('9', OLD, NEW), ref('7', NEW, OLD)] }))!;
		expect(plan.create).toBe(false);
		expect(plan.remove.map((r) => r.id)).toEqual(['7']);
	});
});

describe('resolveRedirectOps', () => {
	test('oferta marcada: crea con 301 y no toca nada más', () => {
		const plan = planRedirect(input())!;
		const ops = resolveRedirectOps(plan, DEFAULT_REDIRECT_CHOICE);
		expect(ops).toEqual({
			remove: [],
			update: [],
			create: { from: OLD, to: NEW, code: '301' }
		});
	});

	test('oferta desmarcada: no hace nada', () => {
		const plan = planRedirect(input())!;
		const ops = resolveRedirectOps(plan, { createOffered: false, conflict: 'repoint' });
		expect(isEmptyRedirectOps(ops)).toBe(true);
	});

	test('cadena simple: crea y reapunta la que llegaba a la vieja', () => {
		const a = ref('1', '/nosotros', OLD);
		const ops = resolveRedirectOps(
			planRedirect(input({ existing: [a] }))!,
			DEFAULT_REDIRECT_CHOICE
		);
		expect(ops.update).toEqual([{ ref: a, to: NEW }]);
		expect(ops.create).toEqual({ from: OLD, to: NEW, code: '301' });
	});

	test('cadena múltiple: reapunta todas', () => {
		const list = [ref('1', '/a', OLD), ref('2', '/b', OLD), ref('3', '/c', OLD)];
		const ops = resolveRedirectOps(
			planRedirect(input({ existing: list }))!,
			DEFAULT_REDIRECT_CHOICE
		);
		expect(ops.update.map((u) => u.ref.id)).toEqual(['1', '2', '3']);
		expect(ops.update.every((u) => u.to === NEW)).toBe(true);
	});

	test('cadena con la oferta desmarcada: no se reapunta nada', () => {
		const plan = planRedirect(input({ existing: [ref('1', '/a', OLD)] }))!;
		const ops = resolveRedirectOps(plan, { createOffered: false, conflict: 'repoint' });
		expect(isEmptyRedirectOps(ops)).toBe(true);
	});

	test('conflicto, elección por defecto: reapunta la existente y la cadena, sin crear', () => {
		const e = ref('9', OLD, '/empresa');
		const chain = ref('1', '/nosotros', OLD);
		const plan = planRedirect(input({ existing: [e, chain] }))!;
		const ops = resolveRedirectOps(plan, DEFAULT_REDIRECT_CHOICE);
		expect(ops.create).toBeNull();
		expect(ops.update).toEqual([
			{ ref: e, to: NEW },
			{ ref: chain, to: NEW }
		]);
	});

	test('conflicto, «dejarla como está»: no escribe nada', () => {
		const plan = planRedirect(input({ existing: [ref('9', OLD, '/empresa')] }))!;
		const ops = resolveRedirectOps(plan, { createOffered: true, conflict: 'keep' });
		expect(isEmptyRedirectOps(ops)).toBe(true);
	});

	test('conflicto: la casilla de la oferta se ignora', () => {
		const plan = planRedirect(input({ existing: [ref('9', OLD, '/empresa')] }))!;
		const ops = resolveRedirectOps(plan, { createOffered: false, conflict: 'repoint' });
		expect(ops.update).toHaveLength(1);
	});

	test('bucle: se borra aunque la oferta esté desmarcada', () => {
		const loop = ref('7', NEW, OLD);
		const plan = planRedirect(input({ existing: [loop] }))!;
		const off = resolveRedirectOps(plan, { createOffered: false, conflict: 'repoint' });
		expect(off.remove).toEqual([loop]);
		expect(off.create).toBeNull();
		const on = resolveRedirectOps(plan, DEFAULT_REDIRECT_CHOICE);
		expect(on.remove).toEqual([loop]);
		expect(on.create).toEqual({ from: OLD, to: NEW, code: '301' });
	});

	test('bucle con conflicto en la vieja: borra y respeta la elección', () => {
		const plan = planRedirect(
			input({ existing: [ref('7', NEW, OLD), ref('9', OLD, '/empresa')] })
		)!;
		const keep = resolveRedirectOps(plan, { createOffered: true, conflict: 'keep' });
		expect(keep.remove).toHaveLength(1);
		expect(keep.update).toEqual([]);
	});

	test('propiedad: tras aplicar las escrituras no queda ciclo ni from igual a la ruta viva', () => {
		const existing = [
			ref('1', '/nosotros', OLD),
			ref('2', NEW, OLD),
			ref('3', OLD, '/empresa'),
			ref('4', '/otra', NEW)
		];
		const plan = planRedirect(input({ existing }))!;
		const ops = resolveRedirectOps(plan, DEFAULT_REDIRECT_CHOICE);
		const after = new Map(existing.map((r) => [r.id, { ...r }]));
		for (const r of ops.remove) after.delete(r.id);
		for (const u of ops.update) after.get(u.ref.id)!.to = u.to;
		const final = [...after.values()];
		if (ops.create) final.push({ id: 'n', from: ops.create.from, to: ops.create.to });
		expect(final.some((r) => r.from === NEW)).toBe(false);
		expect(final.some((r) => r.from === r.to)).toBe(false);
		const next = new Map(final.map((r) => [r.from, r.to]));
		for (const start of next.keys()) {
			const seen = new Set<string>();
			let cur: string | undefined = start;
			while (cur !== undefined) {
				expect(seen.has(cur)).toBe(false);
				seen.add(cur);
				cur = next.get(cur);
			}
		}
	});
});

describe('validadores de ruta', () => {
	test('isRedirectFrom e isRedirectTo', () => {
		expect(isRedirectFrom('/a')).toBe(true);
		expect(isRedirectFrom('a')).toBe(false);
		expect(isRedirectTo('/')).toBe(true);
		expect(isRedirectTo('//a')).toBe(false);
		expect(isRedirectTo('https://x.test/a')).toBe(true);
	});

	test('el patrón local coincide con el del sembrado (contrato)', () => {
		const to = new RegExp(SITE_SEED_REDIRECT_TO_PATTERN);
		const from = new RegExp(SITE_SEED_REDIRECT_FROM_PATTERN);
		for (const s of ['/', '/a', '//a', '/\\a', 'a', 'https://x', 'http://x', '/ a', '']) {
			expect(isRedirectTo(s) || false).toBe(to.test(s) && !/\s/.test(s));
			expect(isRedirectFrom(s)).toBe(from.test(s) && !/\s/.test(s));
		}
	});
});
