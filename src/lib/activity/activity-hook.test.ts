/** Sondas negativas de los helpers de producto sin alterar artefactos del servidor. */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';
import { expect, test, vi } from 'vitest';

const NOW = Date.parse('2026-10-22T12:00:00.000Z');
const DAY = 86400000;
type Hook = {
	prune(app: object): void;
	request(event: object, action: string): void;
	positiveInt(value: string, fallback: number): number;
};
function helper(env: Record<string, string> = {}): Hook {
	const module = { exports: {} };
	vm.runInNewContext(readFileSync('infra/production/pb_hooks/vega-activity-lib.js', 'utf8'), {
		module,
		$os: { getenv: (name: string) => env[name] ?? '' },
		Date: class extends Date {
			static now() {
				return NOW;
			}
		}
	});
	return module.exports as Hook;
}
test('un fallo de original() no impide la escritura ni filtra valores', () => {
	const warn = vi.fn();
	const next = vi.fn();
	const record = {
		id: 'post',
		get: () => '',
		collection: () => ({ name: 'posts', type: 'base', system: false, fields: [] }),
		original: () => {
			throw new Error('SECRETO');
		}
	};
	const event = {
		record,
		auth: { id: 'ana' },
		app: { store: () => ({ get: () => true }), logger: () => ({ warn }) },
		next
	};
	helper().request(event, 'update');
	expect(next).toHaveBeenCalledOnce();
	expect(warn).toHaveBeenCalledOnce();
	expect(JSON.stringify(warn.mock.calls)).not.toContain('SECRETO');
});
test('el error de negocio de next() se propaga aunque falle la preparación', () => {
	const business = new Error('rechazado');
	const event = {
		record: {
			collection: () => {
				throw new Error('lectura');
			}
		},
		auth: { id: 'ana' },
		app: { logger: () => ({ warn: vi.fn() }) },
		next: () => {
			throw business;
		}
	};
	expect(() => helper().request(event, 'create')).toThrow(business);
});
test('retención ignora cero, decimales, negativos, infinito y enteros inseguros', () => {
	const lib = helper();
	for (const value of ['0', '-1', '1.5', 'Infinity', '9999999999999999999', 'abc', ''])
		expect(lib.positiveInt(value, 90)).toBe(90);
	expect(lib.positiveInt(' 12 ', 90)).toBe(12);
});

/** Ejecuta el SQL real por tandas en SQLite; solo adapta la sintaxis de parámetros de dbx. */
function retentionDatabase(freshRows: number) {
	const db = new DatabaseSync(':memory:');
	db.exec('CREATE TABLE vega_activity (id TEXT PRIMARY KEY, created TEXT NOT NULL)');
	db.prepare(
		`WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x < :count)
		INSERT INTO vega_activity SELECT printf('%015d', x), :created FROM n`
	).run({
		count: freshRows,
		created: new Date(NOW - DAY).toISOString().replace('T', ' ')
	});
	db.prepare('INSERT INTO vega_activity VALUES (:id, :created)').run({
		id: 'old',
		created: new Date(NOW - 91 * DAY).toISOString().replace('T', ' ')
	});
	const queries: Array<{ sql: string; params: Record<string, string | number> }> = [];
	const app = {
		store: () => ({ get: () => true }),
		db: () => ({
			newQuery: (sql: string) => ({
				bind: (params: Record<string, string | number>) => ({
					execute: () => {
						queries.push({ sql, params });
						const result = db.prepare(sql.replace(/\{:(\w+)\}/g, ':$1')).run(params);
						return { rowsAffected: () => Number(result.changes) };
					}
				})
			})
		})
	};
	return { app, db, queries };
}
test('días seguros enormes usan90días sin abortar el tope predeterminado100000', () => {
	const { app, db, queries } = retentionDatabase(100001);
	try {
		expect(() =>
			helper({ VEGA_ACTIVITY_DAYS: String(Number.MAX_SAFE_INTEGER) }).prune(app)
		).not.toThrow();
		expect(db.prepare('SELECT COUNT(*) AS count FROM vega_activity').get()?.count).toBe(100000);
		expect(db.prepare("SELECT id FROM vega_activity WHERE id='old'").get()).toBeUndefined();
		expect(
			db.prepare("SELECT id FROM vega_activity WHERE id='000000000100001'").get()
		).toBeDefined();
		expect(queries[0].params.cutoff).toBe(new Date(NOW - 90 * DAY).toISOString().replace('T', ' '));
		expect(queries.at(-1)?.params).toEqual({ max: 100000 });
	} finally {
		db.close();
	}
});
test('plazos válidos mantienen el corte y el tope configurados', () => {
	const { app, db, queries } = retentionDatabase(3);
	try {
		helper({ VEGA_ACTIVITY_DAYS: '7', VEGA_ACTIVITY_MAX_ROWS: '2' }).prune(app);
		expect(db.prepare('SELECT COUNT(*) AS count FROM vega_activity').get()?.count).toBe(2);
		expect(queries[0].params.cutoff).toBe(new Date(NOW - 7 * DAY).toISOString().replace('T', ' '));
		expect(queries.at(-1)?.params).toEqual({ max: 2 });
	} finally {
		db.close();
	}
});
