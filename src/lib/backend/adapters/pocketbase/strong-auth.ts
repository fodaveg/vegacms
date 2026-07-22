/**
 * Cliente de la extensión de autenticación fuerte de PocketBase (L6): reutiliza el protocolo
 * probado por el admin bespoke de fodaveg, pero con una base de rutas configurable. La SPA sigue
 * funcionando contra PocketBase vanilla cuando esta extensión no se configura.
 */

import PocketBase, { ClientResponseError } from 'pocketbase';
import type {
	PasskeySummary,
	Session,
	StrongAuthLoginOutcome,
	StrongAuthStatus,
	TotpEnrollment
} from '../../types';
import type { StrongAuthPort } from '../../port';
import { VegaError } from '../../errors';
import { mapPocketBaseError } from './errors';

interface AuthResponse {
	token: string;
	record: { id: string; email?: string };
}

interface StrongAuthOptions {
	pb: PocketBase;
	authCollection: string;
	apiBasePath: string;
	acceptAuthResponse(response: AuthResponse): Session;
	persistRefreshedSession(): Session;
	onAuthExpired(): VegaError;
}

/** Crea el subpuerto de auth fuerte sobre las rutas Go instaladas en PocketBase. */
export function createPocketBaseStrongAuth(options: StrongAuthOptions): StrongAuthPort {
	const {
		pb,
		authCollection,
		apiBasePath,
		acceptAuthResponse,
		persistRefreshedSession,
		onAuthExpired
	} = options;

	async function request<T>(
		path: string,
		init: { method?: 'GET' | 'POST'; body?: unknown; login?: boolean } = {}
	): Promise<T> {
		try {
			return (await pb.send(`${apiBasePath}${path}`, {
				method: init.method ?? 'POST',
				body: init.body
			})) as T;
		} catch (err) {
			throw mapStrongAuthError(err, init.login ?? false, apiBasePath, onAuthExpired);
		}
	}

	function accept(value: unknown): Session {
		const response = value as Partial<AuthResponse> | null;
		if (
			!response ||
			typeof response.token !== 'string' ||
			!response.record ||
			typeof response.record.id !== 'string'
		) {
			throw VegaError.backend('La extensión de autenticación devolvió una sesión no válida.');
		}
		return acceptAuthResponse(response as AuthResponse);
	}

	async function refreshAuthRecord(): Promise<Session> {
		try {
			await pb.collection(authCollection).authRefresh();
			return persistRefreshedSession();
		} catch (err) {
			if (err instanceof ClientResponseError && err.status === 401) {
				throw onAuthExpired();
			}
			throw mapPocketBaseError(err, { hadSession: true });
		}
	}

	return {
		async loginWithPassword(credentials): Promise<StrongAuthLoginOutcome> {
			const result = await request<Record<string, unknown>>('/login/password', {
				body: credentials,
				login: true
			});
			if (result.mfa_required === true) {
				const pending = typeof result.pending === 'string' ? result.pending : '';
				const rawMethods = Array.isArray(result.methods) ? result.methods : [];
				const methods = rawMethods.filter(
					(method): method is 'totp' | 'recovery' => method === 'totp' || method === 'recovery'
				);
				if (!pending || methods.length === 0) {
					throw VegaError.backend('La extensión de autenticación devolvió un reto MFA no válido.');
				}
				return { kind: 'mfa-required', pending, methods };
			}
			return { kind: 'authenticated', session: accept(result) };
		},

		async loginWithTotp(pending, code) {
			return accept(await request('/login/totp', { body: { pending, code }, login: true }));
		},

		async loginWithRecovery(pending, code) {
			return accept(await request('/login/recovery', { body: { pending, code }, login: true }));
		},

		async loginWithPasskey() {
			try {
				assertWebAuthnAvailable();
				const begin = await request<{ publicKey?: PublicKeyCredentialRequestOptionsJSON }>(
					'/passkey/login/discoverable/begin',
					{ login: true }
				);
				if (!begin.publicKey) {
					throw VegaError.backend('La extensión de autenticación no devolvió opciones WebAuthn.');
				}
				const credential = (await navigator.credentials.get({
					publicKey: decodeRequestOptions(begin.publicKey)
				})) as PublicKeyCredential | null;
				if (!credential) throw VegaError.backend('No se obtuvo ninguna passkey.');
				return accept(
					await request('/passkey/login/discoverable/finish', {
						body: serializeAssertion(credential),
						login: true
					})
				);
			} catch (err) {
				throw mapStrongAuthError(err, true, apiBasePath, onAuthExpired);
			}
		},

		async getStatus(): Promise<StrongAuthStatus> {
			await refreshAuthRecord();
			const [passkeyResult, recoveryResult] = await Promise.all([
				request<{ passkeys?: PasskeySummary[] }>('/passkey/list', { method: 'GET' }),
				request<{ remaining?: number }>('/recovery/count', { method: 'GET' })
			]);
			const record = pb.authStore.record as unknown as Record<string, unknown> | null;
			return {
				totpEnabled: record?.totp_enabled === true,
				recoveryCodesRemaining:
					typeof recoveryResult.remaining === 'number' ? recoveryResult.remaining : 0,
				passkeys: Array.isArray(passkeyResult.passkeys) ? passkeyResult.passkeys : []
			};
		},

		async enrollTotp(): Promise<TotpEnrollment> {
			const result = await request<{ otpauth_url?: string; secret?: string }>('/totp/enroll');
			if (typeof result.otpauth_url !== 'string' || typeof result.secret !== 'string') {
				throw VegaError.backend('La extensión de autenticación devolvió un alta TOTP no válida.');
			}
			return { otpauthUrl: result.otpauth_url, secret: result.secret };
		},

		async verifyTotp(code) {
			await request('/totp/verify', { body: { code } });
			await refreshAuthRecord();
		},

		async disableTotp() {
			await request('/totp/disable');
			await refreshAuthRecord();
		},

		async generateRecoveryCodes() {
			const result = await request<{ codes?: string[] }>('/recovery/generate');
			if (!Array.isArray(result.codes) || result.codes.some((code) => typeof code !== 'string')) {
				throw VegaError.backend(
					'La extensión de autenticación devolvió códigos de recuperación no válidos.'
				);
			}
			return result.codes;
		},

		async registerPasskey(name) {
			try {
				assertWebAuthnAvailable();
				const begin = await request<{ publicKey?: PublicKeyCredentialCreationOptionsJSON }>(
					'/passkey/register/begin'
				);
				if (!begin.publicKey) {
					throw VegaError.backend('La extensión de autenticación no devolvió opciones WebAuthn.');
				}
				const credential = (await navigator.credentials.create({
					publicKey: decodeCreationOptions(begin.publicKey)
				})) as PublicKeyCredential | null;
				if (!credential) throw VegaError.backend('No se creó ninguna passkey.');
				await request(`/passkey/register/finish?name=${encodeURIComponent(name || 'Passkey')}`, {
					body: serializeAttestation(credential)
				});
			} catch (err) {
				throw mapStrongAuthError(err, false, apiBasePath, onAuthExpired);
			}
		},

		async deletePasskey(id) {
			await request('/passkey/delete', { body: { id } });
		}
	};
}

function assertWebAuthnAvailable(): void {
	if (typeof navigator === 'undefined' || !navigator.credentials) {
		throw VegaError.backend('Este navegador no ofrece WebAuthn/passkeys.');
	}
}

/** Mapeo de error deliberadamente neutro en login: nunca revela si una cuenta existe. */
function mapStrongAuthError(
	err: unknown,
	login: boolean,
	apiBasePath: string,
	onAuthExpired: () => VegaError
): VegaError {
	if (err instanceof VegaError) return err;
	if (err instanceof DOMException) {
		return VegaError.backend(
			err.name === 'NotAllowedError'
				? 'La operación con la passkey se canceló o caducó.'
				: 'No se pudo completar la operación con la passkey.',
			err
		);
	}
	if (err instanceof ClientResponseError) {
		if (err.status === 404) {
			return VegaError.backend(
				`La extensión de autenticación no está disponible en ${apiBasePath}.`,
				err
			);
		}
		if (err.status === 429) {
			return VegaError.backend('Demasiados intentos. Espera unos minutos e inténtalo de nuevo.');
		}
		if (login && (err.status === 400 || err.status === 401 || err.status === 403)) {
			return VegaError.forbidden('Credenciales o código no válidos.');
		}
		if (!login && err.status === 401) {
			// El admin legacy devuelve 401 también para un TOTP de alta incorrecto. Ese caso NO
			// caduca la sesión; cualquier otro 401 de una ruta autenticada sí debe pasar por el
			// mismo latch central que el resto del adaptador.
			const response = err.response as Record<string, unknown> | undefined;
			if (response?.error === 'invalid_code') {
				return VegaError.forbidden('El código no es válido.');
			}
			return onAuthExpired();
		}
	}
	return mapPocketBaseError(err, { hadSession: !login });
}

function b64urlToBuffer(value: string): ArrayBuffer {
	let normalized = value.replace(/-/g, '+').replace(/_/g, '/');
	while (normalized.length % 4) normalized += '=';
	const binary = atob(normalized);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
	return bytes.buffer;
}

function bufferToB64url(value: ArrayBuffer): string {
	let binary = '';
	for (const byte of new Uint8Array(value)) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeRequestOptions(
	options: PublicKeyCredentialRequestOptionsJSON
): PublicKeyCredentialRequestOptions {
	return {
		...options,
		challenge: b64urlToBuffer(options.challenge),
		allowCredentials: options.allowCredentials?.map((credential) => ({
			...credential,
			type: 'public-key' as const,
			id: b64urlToBuffer(credential.id),
			transports: credential.transports as AuthenticatorTransport[] | undefined
		}))
	} as unknown as PublicKeyCredentialRequestOptions;
}

function decodeCreationOptions(
	options: PublicKeyCredentialCreationOptionsJSON
): PublicKeyCredentialCreationOptions {
	return {
		...options,
		challenge: b64urlToBuffer(options.challenge),
		user: { ...options.user, id: b64urlToBuffer(options.user.id) },
		excludeCredentials: options.excludeCredentials?.map((credential) => ({
			...credential,
			type: 'public-key' as const,
			id: b64urlToBuffer(credential.id),
			transports: credential.transports as AuthenticatorTransport[] | undefined
		}))
	} as unknown as PublicKeyCredentialCreationOptions;
}

function serializeAssertion(credential: PublicKeyCredential): Record<string, unknown> {
	const response = credential.response as AuthenticatorAssertionResponse;
	return {
		id: credential.id,
		rawId: bufferToB64url(credential.rawId),
		type: credential.type,
		response: {
			clientDataJSON: bufferToB64url(response.clientDataJSON),
			authenticatorData: bufferToB64url(response.authenticatorData),
			signature: bufferToB64url(response.signature),
			userHandle: response.userHandle ? bufferToB64url(response.userHandle) : null
		}
	};
}

function serializeAttestation(credential: PublicKeyCredential): Record<string, unknown> {
	const response = credential.response as AuthenticatorAttestationResponse;
	return {
		id: credential.id,
		rawId: bufferToB64url(credential.rawId),
		type: credential.type,
		response: {
			clientDataJSON: bufferToB64url(response.clientDataJSON),
			attestationObject: bufferToB64url(response.attestationObject)
		}
	};
}
