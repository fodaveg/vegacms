/**
 * Pure text transformations used by the assisted Markdown editor.
 *
 * Keeping selection math out of the Svelte component makes the toolbar deterministic and
 * testable: every command returns the complete next value plus the range that should remain
 * selected in the textarea. The raw Markdown is always the source of truth; no command parses or
 * reserializes the document behind the user's back.
 */

import type { MarkdownManager } from '@tiptap/markdown';
import { safeUri } from '$lib/richtext/safe-uri';

export type MarkdownCommand =
	| 'heading1'
	| 'heading2'
	| 'bold'
	| 'italic'
	| 'strike'
	| 'code'
	| 'codeBlock'
	| 'blockquote'
	| 'bulletList'
	| 'orderedList'
	| 'horizontalRule'
	| 'link'
	| 'image';

export interface MarkdownCommandPlaceholders {
	text: string;
	code: string;
	url: string;
	alt: string;
}

interface MarkdownEditResult {
	value: string;
	selectionStart: number;
	selectionEnd: number;
}

const DEFAULT_PLACEHOLDERS: MarkdownCommandPlaceholders = {
	text: 'text',
	code: 'code',
	url: 'https://',
	alt: 'alt'
};

function clampSelection(value: string, start: number, end: number): [number, number] {
	const safeStart = Math.max(0, Math.min(value.length, start));
	const safeEnd = Math.max(safeStart, Math.min(value.length, end));
	return [safeStart, safeEnd];
}

function replaceRange(
	value: string,
	start: number,
	end: number,
	replacement: string,
	selectionStart: number,
	selectionEnd: number
): MarkdownEditResult {
	return {
		value: value.slice(0, start) + replacement + value.slice(end),
		selectionStart: start + selectionStart,
		selectionEnd: start + selectionEnd
	};
}

function surround(
	value: string,
	start: number,
	end: number,
	before: string,
	after: string,
	placeholder: string
): MarkdownEditResult {
	const selected = value.slice(start, end) || placeholder;
	const replacement = `${before}${selected}${after}`;
	return replaceRange(
		value,
		start,
		end,
		replacement,
		before.length,
		before.length + selected.length
	);
}

type Prefixer = (line: string, index: number) => string;

function lineBlock(value: string, start: number, end: number): [number, number, string[]] {
	const blockStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
	const exclusiveEnd = end > start && value[end - 1] === '\n' ? end - 1 : end;
	const nextBreak = value.indexOf('\n', exclusiveEnd);
	const blockEnd = nextBreak === -1 ? value.length : nextBreak;
	return [blockStart, blockEnd, value.slice(blockStart, blockEnd).split('\n')];
}

function commonSuffixLength(left: string, right: string): number {
	let length = 0;
	while (
		length < left.length &&
		length < right.length &&
		left[left.length - 1 - length] === right[right.length - 1 - length]
	) {
		length += 1;
	}
	return length;
}

function prefixLines(
	value: string,
	start: number,
	end: number,
	matches: (line: string) => boolean,
	remove: Prefixer,
	add: Prefixer
): MarkdownEditResult {
	const [blockStart, blockEnd, lines] = lineBlock(value, start, end);
	const shouldRemove = lines.every(matches);
	const nextLines = lines.map(shouldRemove ? remove : add);
	const replacement = nextLines.join('\n');

	if (start === end) {
		const beforeCursor = value.slice(blockStart, start);
		const lineIndex = beforeCursor.split('\n').length - 1;
		const lineStart = beforeCursor.lastIndexOf('\n') + 1;
		const column = beforeCursor.length - lineStart;
		const currentLine = lines[lineIndex] ?? '';
		const nextLine = nextLines[lineIndex] ?? '';
		const suffixLength = commonSuffixLength(currentLine, nextLine);
		const currentPrefixLength = currentLine.length - suffixLength;
		const nextPrefixLength = nextLine.length - suffixLength;
		const mappedColumn =
			column <= currentPrefixLength
				? nextPrefixLength
				: nextPrefixLength + column - currentPrefixLength;
		const nextLineStart = nextLines
			.slice(0, lineIndex)
			.reduce((sum, line) => sum + line.length + 1, 0);
		const cursor = nextLineStart + mappedColumn;
		return replaceRange(value, blockStart, blockEnd, replacement, cursor, cursor);
	}

	return replaceRange(value, blockStart, blockEnd, replacement, 0, replacement.length);
}

/** Longest excerpt of an unsafe fragment that is quoted back to the author. */
const UNSAFE_FRAGMENT_MAX = 60;

/**
 * First piece of embedded HTML or dangerous link/image destination, as the author wrote it (one
 * line, trimmed, at most {@link UNSAFE_FRAGMENT_MAX} characters), or `null` when the Markdown is
 * safe. Same lexer and same rule as the preview, without reserializing the raw Markdown: HTML
 * inside a code span or block is code, not HTML, and does not count.
 *
 * The rule is a Vega guarantee, not a site option: a `markdown` field never gets HTML or a
 * `javascript:`-like destination written by Vega (the manifest has no key to allow it). Content
 * that already holds it is shown and can stay untouched; the save paths only reject it in a field
 * the author changed (`markdown-safety.ts`).
 */
export function findUnsafeMarkdown(value: string, manager: MarkdownManager): string | null {
	let fragment: string | null = null;
	const tokens = manager.instance.lexer(value);
	manager.instance.walkTokens(tokens, (token) => {
		if (fragment !== null) return;
		if (token.type === 'html') {
			fragment = excerpt(token.raw);
			return;
		}
		if (token.type !== 'link' && token.type !== 'image') return;
		const href = 'href' in token && typeof token.href === 'string' ? token.href : '';
		if (href.trim() !== '' && safeUri(href) === '') fragment = excerpt(token.raw);
	});
	return fragment;
}

function excerpt(raw: string): string {
	const line = raw.replace(/\s+/g, ' ').trim();
	return line.length > UNSAFE_FRAGMENT_MAX ? `${line.slice(0, UNSAFE_FRAGMENT_MAX - 1)}…` : line;
}

/** Rejects embedded HTML and dangerous link/image schemes without reserializing raw Markdown. */
export function hasUnsafeMarkdownContent(value: string, manager: MarkdownManager): boolean {
	return findUnsafeMarkdown(value, manager) !== null;
}

function insertBlock(
	value: string,
	start: number,
	end: number,
	block: string,
	innerStart: number,
	innerEnd: number
): MarkdownEditResult {
	const leadingBreak = start > 0 && value[start - 1] !== '\n' ? '\n' : '';
	const trailingBreak =
		!block.endsWith('\n') && end < value.length && value[end] !== '\n' ? '\n' : '';
	const replacement = `${leadingBreak}${block}${trailingBreak}`;
	return replaceRange(
		value,
		start,
		end,
		replacement,
		leadingBreak.length + innerStart,
		leadingBreak.length + innerEnd
	);
}

/** Applies one toolbar command to a raw Markdown string. */
export function applyMarkdownCommand(
	value: string,
	selectionStart: number,
	selectionEnd: number,
	command: MarkdownCommand,
	placeholders: MarkdownCommandPlaceholders = DEFAULT_PLACEHOLDERS
): MarkdownEditResult {
	const [start, end] = clampSelection(value, selectionStart, selectionEnd);

	switch (command) {
		case 'heading1':
			return prefixLines(
				value,
				start,
				end,
				(line) => line.startsWith('# '),
				(line) => line.slice(2),
				(line) => `# ${line}`
			);
		case 'heading2':
			return prefixLines(
				value,
				start,
				end,
				(line) => line.startsWith('## '),
				(line) => line.slice(3),
				(line) => `## ${line}`
			);
		case 'bold':
			return surround(value, start, end, '**', '**', placeholders.text);
		case 'italic':
			return surround(value, start, end, '*', '*', placeholders.text);
		case 'strike':
			return surround(value, start, end, '~~', '~~', placeholders.text);
		case 'code':
			return surround(value, start, end, '`', '`', placeholders.code);
		case 'blockquote':
			return prefixLines(
				value,
				start,
				end,
				(line) => line.startsWith('> '),
				(line) => line.slice(2),
				(line) => `> ${line}`
			);
		case 'bulletList':
			return prefixLines(
				value,
				start,
				end,
				(line) => /^[-*+] /.test(line),
				(line) => line.replace(/^[-*+] /, ''),
				(line) => `- ${line.replace(/^(?:[-*+] |\d+\. )/, '')}`
			);
		case 'orderedList':
			return prefixLines(
				value,
				start,
				end,
				(line) => /^\d+\. /.test(line),
				(line) => line.replace(/^\d+\. /, ''),
				(line, index) => `${index + 1}. ${line.replace(/^(?:[-*+] |\d+\. )/, '')}`
			);
		case 'horizontalRule':
			return insertBlock(value, start, end, '---\n', 4, 4);
		case 'codeBlock': {
			const selected = value.slice(start, end) || placeholders.code;
			const block = `\`\`\`\n${selected}\n\`\`\`\n`;
			return insertBlock(value, start, end, block, 4, 4 + selected.length);
		}
		case 'link': {
			const label = value.slice(start, end) || placeholders.text;
			const replacement = `[${label}](${placeholders.url})`;
			const urlStart = label.length + 3;
			return replaceRange(
				value,
				start,
				end,
				replacement,
				urlStart,
				urlStart + placeholders.url.length
			);
		}
		case 'image': {
			const alt = value.slice(start, end) || placeholders.alt;
			const replacement = `![${alt}](${placeholders.url})`;
			const urlStart = alt.length + 4;
			return replaceRange(
				value,
				start,
				end,
				replacement,
				urlStart,
				urlStart + placeholders.url.length
			);
		}
	}
}

/** Counts whitespace-delimited words for the unobtrusive editor footer. */
export function countMarkdownWords(value: string): number {
	const trimmed = value.trim();
	return trimmed ? trimmed.split(/\s+/u).length : 0;
}
