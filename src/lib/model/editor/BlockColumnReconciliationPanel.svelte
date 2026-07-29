<script lang="ts">
	/**
	 * Aviso de divergencia manifiesto↔esquema para las columnas físicas que los campos
	 * `blockTypes.*.fields[source=record]` necesitan en cada colección hija. Consume el
	 * diagnóstico y el generador canónicos de `backend/block-schema.ts`; no escribe en el puerto
	 * ni intenta aplicar la migración. `/settings` lo monta únicamente bajo `schemaBootstrap`.
	 *
	 * `types` es el descubrimiento fresco de esta visita a `/settings`; `model` aporta el
	 * vocabulario y los `ResolvedBlocksConfig` ya validados. Esta separación importa al volver
	 * después de aplicar una migración fuera de Vega: el esquema fresco hace desaparecer el aviso
	 * sin reconstruir ninguna configuración desde el JSON crudo.
	 */
	import type { CollectionFieldSpec, ContentType, Field, GeneratedMigration } from '$lib/backend';
	import {
		BlockRecordFieldConflictError,
		diagnoseBlockRecordFields,
		generateBlockReconciliationMigration,
		type BlockRecordFieldDiagnostic
	} from '$lib/backend/block-schema';
	import type { ContentModel, ResolvedBlocksConfig } from '$lib/model/types';
	import MigrationPanel from './MigrationPanel.svelte';

	interface Props {
		types: ContentType[];
		model: ContentModel;
		t: (key: string, params?: Record<string, string | number>) => string;
	}

	const { types, model, t }: Props = $props();

	type MissingDiagnostic = Extract<BlockRecordFieldDiagnostic, { status: 'missing' }>;
	type IncompatibleDiagnostic = Extract<BlockRecordFieldDiagnostic, { status: 'incompatible' }>;

	interface DiagnosticGroup {
		collection: string;
		blocks: ResolvedBlocksConfig;
		missing: MissingDiagnostic[];
		incompatible: IncompatibleDiagnostic[];
	}

	/**
	 * `deriveBlockRecordFieldsWithOwners` (bajo `diagnoseBlockRecordFields`) lanza
	 * `BlockRecordFieldConflictError` SÍNCRONAMENTE cuando el propio manifiesto es contradictorio:
	 * dos `blockTypes` con el mismo nombre `record` en formas incompatibles, o un nombre `record`
	 * que colisiona con un campo estructural (`parentField`/`orderField`/`typeField`/`dataField`).
	 * Ese conflicto vive en el manifiesto, no en el esquema físico descubierto, así que no hay
	 * `ModelWarning` previo que lo cubra. Degradar aquí a una tarjeta de aviso es la única forma de
	 * que una sola colección de bloques mal declarada no tire el render de toda `/settings`.
	 */
	interface ConflictGroup {
		collection: string;
		fieldName: string;
		declarations: readonly string[];
	}

	/**
	 * Una sola entrada por colección física. Dos tipos de contenido pueden compartir colección de
	 * bloques; diagnosticarla dos veces inflaría N y ofrecería dos ficheros para el mismo destino.
	 */
	const diagnosis = $derived.by((): { groups: DiagnosticGroup[]; conflicts: ConflictGroup[] } => {
		if (model.blockTypes.length === 0) return { groups: [], conflicts: [] };

		const blocksByCollection: ResolvedBlocksConfig[] = [];
		for (const type of model.types) {
			const blocks = type.blocks;
			if (
				blocks &&
				!blocksByCollection.some((current) => current.collection === blocks.collection)
			) {
				blocksByCollection.push(blocks);
			}
		}

		const result: DiagnosticGroup[] = [];
		const conflicts: ConflictGroup[] = [];
		for (const blocks of blocksByCollection) {
			const actual = types.find((type) => type.name === blocks.collection);
			// `resolveBlocks` ya impide este estado en un ContentModel real. Si el esquema fresco
			// cambió entre cargas, no se inventa una configuración ni una migración imposible.
			if (!actual) continue;

			let diagnostics: BlockRecordFieldDiagnostic[];
			try {
				diagnostics = diagnoseBlockRecordFields(model.blockTypes, blocks, actual.fields);
			} catch (error) {
				conflicts.push({
					collection: blocks.collection,
					fieldName: error instanceof BlockRecordFieldConflictError ? error.fieldName : '?',
					declarations:
						error instanceof BlockRecordFieldConflictError
							? error.declarations
							: [error instanceof Error ? error.message : String(error)]
				});
				continue;
			}

			const missing = diagnostics.filter(
				(diagnostic): diagnostic is MissingDiagnostic => diagnostic.status === 'missing'
			);
			const incompatible = diagnostics.filter(
				(diagnostic): diagnostic is IncompatibleDiagnostic => diagnostic.status === 'incompatible'
			);
			if (missing.length > 0 || incompatible.length > 0) {
				result.push({ collection: blocks.collection, blocks, missing, incompatible });
			}
		}
		return { groups: result, conflicts };
	});

	const groups = $derived(diagnosis.groups);
	const conflicts = $derived(diagnosis.conflicts);

	/**
	 * `blocks-invalid` con `/blocks/collection` es la única fuente segura cuando `resolveBlocks`
	 * devolvió `null`: avisa, pero nunca reconstruye un `ResolvedBlocksConfig` desde JSON crudo.
	 */
	const missingCollectionWarnings = $derived(
		model.blockTypes.length === 0
			? []
			: model.warnings.filter(
					(warning) =>
						warning.code === 'blocks-invalid' && warning.path?.endsWith('/blocks/collection')
				)
	);

	const missingCount = $derived(groups.reduce((sum, group) => sum + group.missing.length, 0));
	const incompatibleCount = $derived(
		groups.reduce((sum, group) => sum + group.incompatible.length, 0)
	);
	const visible = $derived(
		missingCount > 0 ||
			incompatibleCount > 0 ||
			missingCollectionWarnings.length > 0 ||
			conflicts.length > 0
	);

	let generatedByCollection = $state<Record<string, GeneratedMigration>>({});
	let lastGenerationSecond = $state<number | null>(null);

	/**
	 * Reemplaza el artefacto visible de la colección: pulsar dos veces no acumula paneles. El
	 * generador nombra por segundos; el pequeño reloj monótono garantiza dos nombres distintos
	 * incluso si el operador pulsa dos veces dentro del mismo segundo.
	 */
	function generate(group: DiagnosticGroup): void {
		const wallSecond = Math.floor(Date.now() / 1000);
		const generationSecond =
			lastGenerationSecond === null ? wallSecond : Math.max(wallSecond, lastGenerationSecond + 1);
		const migration = generateBlockReconciliationMigration(
			group.blocks,
			[...group.missing, ...group.incompatible],
			new Date(generationSecond * 1000)
		);
		if (!migration) return;
		lastGenerationSecond = generationSecond;
		generatedByCollection = {
			...generatedByCollection,
			[group.collection]: migration
		};
	}

	function bool(value: boolean): string {
		return t(value ? 'settings.blockColumns.value.yes' : 'settings.blockColumns.value.no');
	}

	function expectedRequired(spec: CollectionFieldSpec): boolean {
		return 'required' in spec ? (spec.required ?? false) : false;
	}

	function typeLabel(type: CollectionFieldSpec['type'] | Field['type']): string {
		return t(`settings.blockColumns.type.${type}`);
	}

	/** Razón localizada derivada exclusivamente de `expected`/`actual` (nunca `conflict.message`). */
	function incompatibilityReason(diagnostic: IncompatibleDiagnostic): string {
		const { expected, actual } = diagnostic;
		const reasons: string[] = [];

		if (expected.type !== actual.type) {
			reasons.push(
				t('settings.blockColumns.reason.type', {
					expected: typeLabel(expected.type),
					actual: typeLabel(actual.type)
				})
			);
		}
		if (expectedRequired(expected) !== actual.required) {
			reasons.push(
				t('settings.blockColumns.reason.required', {
					expected: bool(expectedRequired(expected)),
					actual: bool(actual.required)
				})
			);
		}
		if (actual.readonly) reasons.push(t('settings.blockColumns.reason.readonly'));
		if (actual.unique) reasons.push(t('settings.blockColumns.reason.unique'));

		switch (expected.type) {
			case 'text':
				if (actual.type === 'text') {
					if (
						actual.subtype !== 'plain' ||
						actual.minLength !== undefined ||
						actual.pattern !== undefined ||
						(expected.max ?? 0) !== (actual.maxLength ?? 0)
					) {
						reasons.push(
							t('settings.blockColumns.reason.textConstraints', {
								expectedMax: expected.max ?? 0,
								actualMax: actual.maxLength ?? 0
							})
						);
					}
				}
				break;
			case 'number':
				if (actual.type === 'number') {
					if (actual.integer || actual.min !== undefined || actual.max !== undefined) {
						reasons.push(t('settings.blockColumns.reason.numberConstraints'));
					}
				}
				break;
			case 'date':
				if (actual.type === 'date') {
					if (actual.min !== undefined || actual.max !== undefined) {
						reasons.push(t('settings.blockColumns.reason.dateConstraints'));
					}
				}
				break;
			case 'relation':
				if (actual.type === 'relation') {
					if (expected.target !== actual.target) {
						reasons.push(
							t('settings.blockColumns.reason.relationTarget', {
								expected: expected.target,
								actual: actual.target
							})
						);
					}
					if (
						expected.multiple !== actual.multiple ||
						actual.maxSelect !== (actual.multiple ? 99 : 1) ||
						actual.minSelect !== undefined
					) {
						reasons.push(t('settings.blockColumns.reason.cardinality'));
					}
					if ((expected.cascadeDelete ?? false) !== (actual.cascadeDelete ?? false)) {
						reasons.push(t('settings.blockColumns.reason.cascadeDelete'));
					}
				}
				break;
			case 'file':
				if (actual.type === 'file') {
					if (
						expected.multiple !== actual.multiple ||
						actual.maxSelect !== (actual.multiple ? 99 : 1)
					) {
						reasons.push(t('settings.blockColumns.reason.cardinality'));
					}
					if (
						(expected.maxSizeBytes ?? 0) !== (actual.maxSizeBytes ?? 0) ||
						JSON.stringify(expected.mimeTypes ?? []) !== JSON.stringify(actual.mimeTypes ?? []) ||
						actual.protected
					) {
						reasons.push(t('settings.blockColumns.reason.fileConstraints'));
					}
				}
				break;
			case 'bool':
			case 'json':
				break;
			case 'autodate':
				// El diagnóstico nunca deriva `autodate` desde un blockType; se mantiene
				// exhaustivo sobre CollectionFieldSpec para que cambios del contrato avisen.
				reasons.push(t('settings.blockColumns.reason.constraints'));
				break;
		}

		return reasons.length > 0 ? reasons.join('; ') : t('settings.blockColumns.reason.constraints');
	}
</script>

{#if visible}
	<section
		class="vega-block-columns"
		aria-labelledby="vega-block-columns-title"
		data-block-column-divergence
	>
		<h2 id="vega-block-columns-title">{t('settings.blockColumns.title')}</h2>

		{#if missingCount > 0}
			<p class="vega-block-columns-summary" role="status">
				{t('settings.blockColumns.missingSummary', { count: missingCount })}
			</p>
			<p>{t('settings.blockColumns.migrationPerCollection')}</p>
		{/if}

		{#each missingCollectionWarnings as warning (warning.path)}
			<div class="vega-block-columns-collection-missing" role="alert">
				<h3>{t('settings.blockColumns.collectionMissingTitle')}</h3>
				<p>
					{t('settings.blockColumns.collectionMissingBody', {
						collection: warning.collection ?? ''
					})}
				</p>
			</div>
		{/each}

		{#each conflicts as conflict (conflict.collection + ':' + conflict.fieldName)}
			<div class="vega-block-columns-conflict" role="alert">
				<h3>{t('settings.blockColumns.conflictTitle')}</h3>
				<p>
					{t('settings.blockColumns.conflictBody', {
						collection: conflict.collection,
						field: conflict.fieldName,
						declarations: conflict.declarations.join(' <> ')
					})}
				</p>
			</div>
		{/each}

		{#each groups as group (group.collection)}
			{#if group.missing.length > 0}
				<div class="vega-block-columns-group">
					<h3>{group.collection}</h3>
					<p>
						{t('settings.blockColumns.collectionMissingCount', {
							count: group.missing.length,
							collection: group.collection
						})}
					</p>
					<ul>
						{#each group.missing as diagnostic (diagnostic.expected.name)}
							<li><code>{diagnostic.expected.name}</code></li>
						{/each}
					</ul>
					<button type="button" onclick={() => generate(group)}>
						{t('settings.blockColumns.generate', { collection: group.collection })}
					</button>
					{#if generatedByCollection[group.collection]}
						<MigrationPanel
							migration={generatedByCollection[group.collection]}
							{t}
							migrationState="pending"
						/>
					{/if}
				</div>
			{/if}
		{/each}

		{#if incompatibleCount > 0}
			<div class="vega-block-columns-incompatible">
				<h3>{t('settings.blockColumns.incompatibleTitle', { count: incompatibleCount })}</h3>
				<p>{t('settings.blockColumns.incompatibleBody')}</p>
				<ul>
					{#each groups as group (group.collection)}
						{#each group.incompatible as diagnostic (diagnostic.expected.name)}
							<li>
								<code>{group.collection}.{diagnostic.expected.name}</code>
								<span>{incompatibilityReason(diagnostic)}</span>
							</li>
						{/each}
					{/each}
				</ul>
			</div>
		{/if}
	</section>
{/if}

<style>
	.vega-block-columns {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 1rem 1.2rem;
		border: 1px solid var(--line);
		border-radius: 8px;
		background: var(--surface-2);
	}

	.vega-block-columns h2,
	.vega-block-columns h3,
	.vega-block-columns p,
	.vega-block-columns ul {
		margin: 0;
	}

	.vega-block-columns h2 {
		font-size: 1.1rem;
	}

	.vega-block-columns h3 {
		font-size: 0.9rem;
	}

	.vega-block-columns p,
	.vega-block-columns li {
		font-size: 0.85rem;
	}

	.vega-block-columns-summary {
		color: var(--ink);
		font-weight: 600;
	}

	.vega-block-columns-group,
	.vega-block-columns-incompatible,
	.vega-block-columns-collection-missing,
	.vega-block-columns-conflict {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.75rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface);
	}

	.vega-block-columns ul {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		padding-left: 1.25rem;
	}

	.vega-block-columns-incompatible li {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}

	.vega-block-columns code {
		overflow-wrap: anywhere;
		font-family: var(--mono);
	}

	.vega-block-columns button {
		align-self: flex-start;
		padding: 0.4rem 0.9rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface-2);
		color: var(--ink);
		cursor: pointer;
	}

	@media (pointer: coarse) {
		.vega-block-columns button {
			min-height: 44px;
		}
	}
</style>
