/**
 * `datetime.ts` (F5-b, widget `datetime`, Audit Finding 2 / D-P5.13 del contrato P5): conversión
 * PURA y EXPLÍCITA UTC↔hora de pared para el `<input type="datetime-local">`. El dominio
 * (`type:'date'`, §2.1 del contrato de backend) emite/consume ISO 8601 UTC; `datetime-local` no
 * conoce zona horaria y trunca a MINUTOS (sin segundos, en la mayoría de navegadores) — el
 * widget no puede fingir una precisión que el control no ofrece, así que la conversión vive
 * aparte, en un módulo sin Svelte y con test de round-trip.
 *
 * Decisión de segundos (D-P5.13): al emitir de vuelta al dominio se fijan `:00.000` de
 * segundos/milisegundos SIEMPRE — la precisión sub-minuto de un valor ya existente se TRUNCA en
 * cuanto el usuario reedita ese campo. Es una pérdida aceptada y documentada (el control nativo
 * no permite más), no un bug: round-trip estable para cualquier valor ya en minuto exacto, y
 * "floor al minuto" para uno que no lo esté (`datetime.test.ts`).
 */

// Anclado al final (rechaza basura tras el minuto) pero tolera los segundos OPCIONALES que
// algunos navegadores añaden cuando el valor los trae (`HH:MM:SS`): se ignoran (floor al minuto,
// coherente con la decisión de segundos de cabecera), no invalidan el valor.
const LOCAL_INPUT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2})?$/;

/**
 * ISO 8601 UTC → valor de pared para `<input type="datetime-local">` (hora LOCAL del navegador,
 * sin zona, truncada a minutos). `''` si `iso` no es una fecha parseable — degrada sin lanzar
 * (L11), el widget la pinta como campo vacío en vez de reventar.
 */
export function isoUtcToLocalInput(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return '';
	const pad = (n: number): string => String(n).padStart(2, '0');
	// El año DEBE ir a 4 dígitos: `datetime-local` exige `YYYY` (un año < 1000 sin rellenar da un
	// valor que el navegador descarta → la fecha se perdería en silencio al abrir el formulario).
	const year = String(date.getFullYear()).padStart(4, '0');
	const month = pad(date.getMonth() + 1);
	const day = pad(date.getDate());
	const hours = pad(date.getHours());
	const minutes = pad(date.getMinutes());
	return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Valor de pared de `<input type="datetime-local">` (hora LOCAL, sin zona) → ISO 8601 UTC con
 * segundos fijos a `:00.000` (ver decisión de cabecera). `null` si `local` está vacío o no
 * coincide con el patrón esperado — el widget lo trata como "campo vaciado por el usuario".
 */
export function localInputToIsoUtc(local: string): string | null {
	if (local === '') return null;
	const match = LOCAL_INPUT_PATTERN.exec(local);
	if (!match) return null;
	const [, y, mo, d, h, mi] = match;
	const date = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), 0, 0);
	// `new Date(year, …)` mapea los años 0–99 a 1900–1999 (comportamiento legacy de JS): sin esto,
	// una fecha de año < 100 (histórica, migrada) se corrompería a la del s. XX en el round-trip.
	// `setFullYear` fija el año literal, evitando el mapeo.
	date.setFullYear(Number(y));
	if (Number.isNaN(date.getTime())) return null;
	return date.toISOString();
}
