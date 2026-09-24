/**
 * `AdministrationPort` en memoria (demo y e2e): cuentas de `vega_editors` y copias de seguridad sin
 * servidor. Emula lo que se midió contra PocketBase 0.39.6 (ver la cabecera del adaptador
 * `pocketbase/administration.ts`) sin fingir lo que no puede hacer:
 * - No envía correo. `mailEnabled()` devuelve lo que diga la semilla (`false` por defecto) y una
 *   invitación sin correo se rechaza, en vez de dar por enviado algo que no salió.
 * - Una copia no copia nada: guarda sus metadatos y su descarga es un `.zip` vacío pero válido
 *   (22 bytes), servido como `data:` para que el navegador y `fetch` lo abran sin red.
 * - La contraseña de una cuenta se valida y se descarta: estas cuentas no inician sesión en
 *   `memory` (eso sigue siendo cosa de `MemorySeed.users`).
 */

import type { AdministrationPort } from '../../port';
import type { BackupFile, EditorAccount } from '../../types';
import { PB_VALIDATION_CODES, VegaError } from '../../errors';
import { VEGA_EDITORS_COLLECTION_NAME } from '../../administration';
import { DEFAULT_PASSWORD_MIN_LENGTH, sortBackups, sortEditors } from '../../administration-rules';

/** El `.zip` vacío más pequeño válido: solo el registro de fin de directorio central. */
const EMPTY_ZIP_DATA_URI = 'data:application/zip;base64,UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA==';

/** Mismo criterio mínimo que PocketBase: algo@algo.algo, sin espacios. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface MemoryAdministrationOptions {
	/** Exige sesión viva, como el resto de operaciones del adaptador (§7). */
	checkSessionAlive(): void;
	/** `true` si `vega_editors` existe como colección `auth` (sembrada o creada después). */
	editorsCollectionExists(): boolean;
	generateId(): string;
	editors: EditorAccount[];
	backups: BackupFile[];
	mailEnabled: boolean;
	backupDurationMs: number;
}

/** Crea la sección de administración de `memory` sobre el estado que le pasa la factory. */
export function createMemoryAdministration(
	options: MemoryAdministrationOptions
): AdministrationPort {
	const { checkSessionAlive, editorsCollectionExists, generateId, mailEnabled } = options;
	const editors = new Map(options.editors.map((account) => [account.id, { ...account }]));
	const backups = new Map(options.backups.map((backup) => [backup.key, { ...backup }]));
	let backupRunning = false;

	function assertEditorsCollection(): void {
		checkSessionAlive();
		if (!editorsCollectionExists()) {
			throw VegaError.notFound(`La colección "${VEGA_EDITORS_COLLECTION_NAME}" no existe`);
		}
	}

	function getEditor(id: string): EditorAccount {
		const account = editors.get(id);
		if (!account) throw VegaError.notFound(`Editor "${id}" no encontrado`);
		return account;
	}

	function assertPassword(password: string): void {
		if (password.length < DEFAULT_PASSWORD_MIN_LENGTH) {
			throw VegaError.validation({
				password: {
					code: PB_VALIDATION_CODES.minLength,
					message: `Must be at least ${DEFAULT_PASSWORD_MIN_LENGTH} character(s).`
				}
			});
		}
	}

	function assertMail(): void {
		if (!mailEnabled) {
			throw VegaError.backend('El servidor no tiene correo configurado: no se puede invitar.');
		}
	}

	function nextBackupKey(): string {
		const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
		let key = `vega_backup_${stamp}.zip`;
		for (let n = 2; backups.has(key); n += 1) key = `vega_backup_${stamp}_${n}.zip`;
		return key;
	}

	return {
		async listEditors() {
			assertEditorsCollection();
			return {
				editors: sortEditors([...editors.values()].map((account) => ({ ...account }))),
				passwordMinLength: DEFAULT_PASSWORD_MIN_LENGTH
			};
		},

		async mailEnabled() {
			checkSessionAlive();
			return mailEnabled;
		},

		async createEditor(email, access) {
			assertEditorsCollection();
			const normalized = email.trim();
			if (!EMAIL_PATTERN.test(normalized)) {
				throw VegaError.validation({
					email: { code: PB_VALIDATION_CODES.email, message: 'Must be a valid email address.' }
				});
			}
			const taken = [...editors.values()].some(
				(account) => account.email.toLowerCase() === normalized.toLowerCase()
			);
			if (taken) {
				throw VegaError.validation({
					email: { code: PB_VALIDATION_CODES.unique, message: 'Value must be unique.' }
				});
			}
			if (access.kind === 'password') assertPassword(access.password);
			else assertMail();

			const account: EditorAccount = {
				id: generateId(),
				email: normalized,
				verified: access.kind === 'password',
				created: new Date().toISOString()
			};
			editors.set(account.id, account);
			return { ...account };
		},

		async setEditorPassword(id, password) {
			assertEditorsCollection();
			const account = getEditor(id);
			assertPassword(password);
			account.verified = true;
		},

		async sendEditorInvitation(id) {
			assertEditorsCollection();
			getEditor(id);
			assertMail();
		},

		async removeEditor(id) {
			assertEditorsCollection();
			getEditor(id);
			editors.delete(id);
		},

		async listBackups() {
			checkSessionAlive();
			return sortBackups([...backups.values()].map((backup) => ({ ...backup })));
		},

		async createBackup() {
			checkSessionAlive();
			// Se comprueba y se marca en el mismo tick: dos llamadas simultáneas se ven como en PB,
			// una crea y la otra encuentra la copia en marcha.
			if (backupRunning) return 'busy';
			backupRunning = true;
			try {
				await new Promise((resolve) => setTimeout(resolve, options.backupDurationMs));
				const key = nextBackupKey();
				backups.set(key, { key, size: 22, modified: new Date().toISOString() });
				return 'created';
			} finally {
				backupRunning = false;
			}
		},

		async backupDownloadUrl(key) {
			checkSessionAlive();
			if (!backups.has(key)) throw VegaError.notFound(`La copia "${key}" no existe`);
			return EMPTY_ZIP_DATA_URI;
		}
	};
}
