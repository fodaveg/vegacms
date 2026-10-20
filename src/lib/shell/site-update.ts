/** Evidence available from the uncorrelated build status endpoint. A new timestamp identifies
 *  a newer observed result, never proves which trigger or records produced it. */
import type { BuildStatus } from '$lib/backend/build-client';

/** Una observación de build cambia cuando cambia el estado o una de sus marcas temporales.
 *  El aviso entre shell y portada transporta el estado del servidor, nunca una suposición de éxito. */
const STATUS_EVENT = 'vega:site-update-status';

export function siteUpdateStatusKey(status: BuildStatus): string {
	return JSON.stringify([
		status.state,
		status.startedAt,
		status.finishedAt,
		status.lastPublishedAt
	]);
}

export function announceSiteUpdateStatus(apiUrl: string, status: BuildStatus): void {
	window.dispatchEvent(new CustomEvent(STATUS_EVENT, { detail: { apiUrl, status } }));
}

/** La portada solo escucha el build de su instalación y deja de escuchar al desmontar. */
export function onSiteUpdateStatus(
	apiUrl: string,
	listener: (status: BuildStatus) => void
): () => void {
	const handle = (event: Event) => {
		const detail = (event as CustomEvent<{ apiUrl: string; status: BuildStatus }>).detail;
		if (detail?.apiUrl === apiUrl) listener(detail.status);
	};
	window.addEventListener(STATUS_EVENT, handle);
	return () => window.removeEventListener(STATUS_EVENT, handle);
}

export interface SiteUpdateObservation {
	baseline: BuildStatus;
	/** A new server start observed while running; the client clock is not publication evidence. */
	runningStartedAt: number | null;
}

function instant(value: string | null): number | null {
	const parsed = value === null ? NaN : Date.parse(value);
	return Number.isFinite(parsed) ? parsed : null;
}

/** Remember only a server start newer than the previous run (or the first observed start). */
export function observeSiteUpdate(
	observation: SiteUpdateObservation,
	status: BuildStatus
): SiteUpdateObservation {
	const startedAt = instant(status.startedAt);
	const previousStart = instant(observation.baseline.startedAt);
	return status.state === 'running' &&
		startedAt !== null &&
		(previousStart === null || startedAt > previousStart)
		? { ...observation, runningStartedAt: startedAt }
		: observation;
}

/** A repeated old terminal, changed detail, or running alone cannot confirm a new result. */
export function hasNewSiteUpdateResult(
	observation: SiteUpdateObservation,
	status: BuildStatus
): boolean {
	if (status.state !== 'ok' && status.state !== 'failed') return false;
	const finishedAt = instant(status.finishedAt);
	const previousFinish = instant(observation.baseline.finishedAt);
	if (finishedAt !== null && previousFinish !== null && finishedAt > previousFinish) return true;
	const publishedAt = instant(status.lastPublishedAt);
	const previousPublished = instant(observation.baseline.lastPublishedAt);
	if (
		status.state === 'ok' &&
		publishedAt !== null &&
		previousPublished !== null &&
		publishedAt > previousPublished
	)
		return true;
	return (
		observation.runningStartedAt !== null &&
		instant(status.startedAt) === observation.runningStartedAt &&
		finishedAt !== null &&
		finishedAt >= observation.runningStartedAt
	);
}
