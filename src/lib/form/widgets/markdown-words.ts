/**
 * Word count for the Markdown editor footer. It lives apart from `markdown-commands.ts` because the
 * footer needs it on first paint, while the toolbar commands and the unsafe-content check are only
 * usable once the preview has loaded, so `Markdown.svelte` fetches them on demand with TipTap and
 * keeps them out of the record editors' static bundle (`scripts/check-bundle-budget.mjs`).
 */

/** Counts whitespace-delimited words for the unobtrusive editor footer. */
export function countMarkdownWords(value: string): number {
	const trimmed = value.trim();
	return trimmed ? trimmed.split(/\s+/u).length : 0;
}
