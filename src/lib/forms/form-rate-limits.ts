/** Límite específico de una bandeja; nunca sustituye listas ajenas desde un snapshot viejo. */
import type { ServerSettingsPort } from '$lib/backend/port';
import type { ServerRateLimits, ServerRateLimitRule } from '$lib/backend/server-settings';

export function inboxRateLimit(
	limits: ServerRateLimits | undefined,
	name: string
): ServerRateLimitRule | null | undefined {
	if (!limits) return undefined;
	if (!limits.enabled) return null;
	return (
		limits.rules.find(
			(rule) =>
				rule.label === `${name}:create` && (rule.audience === '@guest' || rule.audience === '')
		) ?? null
	);
}

/** Relee la lista entera justo antes del PATCH, conservando reglas, exclusiones y extensiones. */
export async function enableInboxRateLimit(
	settings: ServerSettingsPort,
	name: string
): Promise<ServerRateLimits> {
	const current = (await settings.get()).rateLimits;
	if (!current) throw new Error('forms.rateUnknown');
	const rules = current.rules.some(
		(rule) => rule.label === `${name}:create` && rule.audience === '@guest'
	)
		? current.rules
		: [
				...current.rules,
				{ label: `${name}:create`, audience: '@guest', maxRequests: 5, duration: 60 }
			];
	return (await settings.update({ rateLimits: { ...current, enabled: true, rules } })).rateLimits!;
}
