/**
 * `true` si `value` es un objeto no nulo y no array — la forma que vale la pena seguir
 * inspeccionando clave a clave (campos `json`, manifiestos, ficheros de importación).
 *
 * "Plano" aquí es solo eso: NO distingue por prototipo, así que `Date`, `Map`, `Set`, `RegExp` e
 * instancias de clase también dan `true`. Es el comportamiento que tenían las cuatro copias que
 * unifica (formulario, importación, diff de revisiones y validación del manifiesto), todas con
 * el mismo cuerpo; los valores que llegan ahí vienen de JSON, donde esos tipos no existen.
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
