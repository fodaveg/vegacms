import type { VegaConfig } from './backend-config';

export const PROJECT_DISCOVERY_PATH = '/api/vega/discovery';
export const PROJECT_DISCOVERY_VERSION = 1;

export interface ProjectDiscovery {
	protocolVersion: 1;
	project: {
		key: string;
		name: string;
	};
	auth: {
		collection: string;
		apiBasePath: string | null;
	};
	manifest: {
		collection: 'vega';
		key: string;
		schemaVersion: number;
	};
	siteSettings: {
		collection: string;
		key: string;
	} | null;
}

function object(value: unknown): Record<string, unknown> | null {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function nonEmptyString(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function apiPath(value: unknown): string | null {
	if (value === null || value === undefined || value === '') return null;
	const path = nonEmptyString(value)?.replace(/\/+$/, '') ?? null;
	return path && path.startsWith('/api/') && !path.startsWith('//') ? path : null;
}

/**
 * Valida el contrato público que expone el PocketBase conectado. Un documento
 * desconocido o incompleto se trata como ausencia para conservar compatibilidad
 * con servidores PocketBase que todavía no conocen Vega.
 */
export function parseProjectDiscovery(raw: unknown): ProjectDiscovery | null {
	const root = object(raw);
	if (!root || root.protocolVersion !== PROJECT_DISCOVERY_VERSION) return null;

	const project = object(root.project);
	const auth = object(root.auth);
	const manifest = object(root.manifest);
	if (!project || !auth || !manifest) return null;

	const projectKey = nonEmptyString(project.key);
	const projectName = nonEmptyString(project.name);
	const authCollection = nonEmptyString(auth.collection);
	const manifestCollection = nonEmptyString(manifest.collection);
	const manifestKey = nonEmptyString(manifest.key);
	const schemaVersion = manifest.schemaVersion;
	if (
		!projectKey ||
		!projectName ||
		!authCollection ||
		manifestCollection !== 'vega' ||
		!manifestKey ||
		typeof schemaVersion !== 'number' ||
		!Number.isInteger(schemaVersion) ||
		schemaVersion < 1
	) {
		return null;
	}

	let siteSettings: ProjectDiscovery['siteSettings'] = null;
	if (root.siteSettings !== null && root.siteSettings !== undefined) {
		const site = object(root.siteSettings);
		const collection = nonEmptyString(site?.collection);
		const key = nonEmptyString(site?.key);
		if (!collection || !key) return null;
		siteSettings = { collection, key };
	}

	return {
		protocolVersion: 1,
		project: { key: projectKey, name: projectName },
		auth: { collection: authCollection, apiBasePath: apiPath(auth.apiBasePath) },
		manifest: { collection: 'vega', key: manifestKey, schemaVersion },
		siteSettings
	};
}

export async function fetchProjectDiscovery(
	backendUrl: string,
	fetcher: typeof fetch = fetch
): Promise<ProjectDiscovery | null> {
	try {
		const endpoint = new URL(PROJECT_DISCOVERY_PATH, `${backendUrl.replace(/\/+$/, '')}/`);
		const response = await fetcher(endpoint, {
			cache: 'no-store',
			headers: { Accept: 'application/json' }
		});
		if (!response.ok) return null;
		return parseProjectDiscovery(await response.json());
	} catch {
		return null;
	}
}

/** La configuración del servidor gana a la estática para todo lo que describe
 * al proyecto. `backendUrl` no se toca: ya fue necesario para descubrirlo. */
export function applyProjectDiscovery(
	config: VegaConfig | null,
	discovery: ProjectDiscovery | null
): VegaConfig | null {
	if (!discovery) return config;
	return {
		...(config ?? {}),
		authCollection: discovery.auth.collection,
		authApiBasePath: discovery.auth.apiBasePath ?? undefined,
		manifestKey: discovery.manifest.key
	};
}
