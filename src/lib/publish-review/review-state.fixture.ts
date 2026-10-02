/**
 * Doble de `ReviewState` (`review-state.svelte.ts`) para los tests de componente de la tarjeta
 * (`ReviewCard.svelte.test.ts`) y del popover (`VisualPublishControl.svelte.test.ts`): el estado
 * se fija a mano, sin puerto ni carga, para poder montar cada estado de la lámina por separado.
 *
 * Reactivo de verdad: los valores viven en un `SvelteMap` (importable desde TypeScript llano, a
 * diferencia de las runas), así que `set(...)` desde el test repinta el componente ya montado —
 * es lo que permite medir «la carga termina con el popover abierto» sin remontar nada.
 */

import { SvelteMap } from 'svelte/reactivity';
import { vi, type Mock } from 'vitest';
import type { DictKey } from '$lib/i18n';
import type { MediaItemView } from '$lib/media/media-item';
import {
	CHECK_SEVERITY,
	type ReviewCheckId,
	type ReviewFinding,
	type ReviewGroup,
	type ReviewTarget
} from './publish-review';
import type { ReviewPhase, ReviewState } from './review-state.svelte';

export interface FakeReviewPatch {
	phase?: ReviewPhase;
	findings?: ReviewFinding[];
	skipped?: ReviewCheckId[];
	errorMessage?: string | null;
}

export interface FakeReviewState extends ReviewState {
	set(patch: FakeReviewPatch): void;
	reload: Mock<() => Promise<void>>;
	updateMedia: Mock<(item: MediaItemView) => void>;
}

export function fakeReviewState(
	initial: FakeReviewPatch & { groups?: ReviewGroup[]; enabled?: boolean } = {}
): FakeReviewState {
	const groups = initial.groups ?? ['seo', 'links', 'media'];
	const enabled = initial.enabled ?? true;
	const store = new SvelteMap<string, unknown>([
		['phase', initial.phase ?? 'ready'],
		['findings', initial.findings ?? []],
		['skipped', initial.skipped ?? []],
		['errorMessage', initial.errorMessage ?? null]
	]);
	const phase = () => store.get('phase') as ReviewPhase;
	const findings = () => store.get('findings') as ReviewFinding[];
	const skipped = () => store.get('skipped') as ReviewCheckId[];
	return {
		groups,
		enabled,
		get phase() {
			return phase();
		},
		get result() {
			return { findings: findings(), skipped: skipped() };
		},
		get errorMessage() {
			return store.get('errorMessage') as string | null;
		},
		get needsAttention() {
			return enabled && (phase() !== 'ready' || findings().length > 0 || skipped().length > 0);
		},
		reload: vi.fn<() => Promise<void>>(async () => {}),
		updateMedia: vi.fn<(item: MediaItemView) => void>(),
		set(patch) {
			for (const [key, value] of Object.entries(patch)) store.set(key, value);
		}
	};
}

/** Un hallazgo con la forma de `reviewRecord`, con los parámetros típicos de cada comprobación. */
export function finding(
	check: ReviewCheckId,
	target: ReviewTarget,
	over: Partial<Pick<ReviewFinding, 'params' | 'reason' | 'mediaId' | 'id'>> = {}
): ReviewFinding {
	const key: Record<ReviewCheckId, DictKey> = {
		'seo.description-empty': 'review.seo.descriptionEmpty',
		'seo.description-long': 'review.seo.descriptionLong',
		'seo.social-image-missing': 'review.seo.socialImageMissing',
		'seo.noindex': 'review.seo.noindex',
		'link.broken': 'review.link.notFound',
		'link.draft-target': 'review.link.draftTarget',
		'media.alt-missing': 'review.media.altMissing',
		'media.alt-missing-inline': 'review.media.altMissingInline'
	};
	// `link.broken` lleva tres motivos con tres mensajes (ver `publish-review.ts`).
	const brokenKey: Record<NonNullable<ReviewFinding['reason']>, DictKey> = {
		'not-found': 'review.link.notFound',
		'redirect-dead-end': 'review.link.redirectDeadEnd',
		'redirect-loop': 'review.link.redirectLoop'
	};
	const where =
		target.kind === 'field' ? `f.${target.field}` : `b.${target.blockId}.${target.field}`;
	return {
		id: over.id ?? `${check}:${where}:1`,
		check,
		severity: CHECK_SEVERITY[check],
		target,
		messageKey: check === 'link.broken' && over.reason ? brokenKey[over.reason] : key[check],
		params: over.params ?? {},
		...(over.reason ? { reason: over.reason } : {}),
		...(over.mediaId ? { mediaId: over.mediaId } : {})
	};
}

export const fieldTarget = (field: string, label: string): ReviewTarget => ({
	kind: 'field',
	field,
	label
});

export const blockTarget = (
	blockId: string,
	position: number,
	blockLabel: string,
	field: string,
	label: string
): ReviewTarget => ({
	kind: 'block',
	blockId,
	blockType: blockLabel.toLowerCase(),
	blockLabel,
	position,
	field,
	label
});
