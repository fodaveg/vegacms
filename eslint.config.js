import prettier from 'eslint-config-prettier';
import path from 'node:path';
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import { defineConfig, includeIgnoreFile } from 'eslint/config';
import globals from 'globals';
import ts from 'typescript-eslint';

const gitignorePath = path.resolve(import.meta.dirname, '.gitignore');

export default defineConfig(
	includeIgnoreFile(gitignorePath),
	js.configs.recommended,
	ts.configs.recommended,
	svelte.configs.recommended,
	prettier,
	svelte.configs.prettier,
	{
		languageOptions: { globals: { ...globals.browser, ...globals.node } },
		rules: {
			// typescript-eslint strongly recommend that you do not use the no-undef lint rule on TypeScript projects.
			// see: https://typescript-eslint.io/troubleshooting/faqs/eslint/#i-get-errors-from-the-no-undef-rule-about-global-variables-not-being-defined-even-though-there-are-no-typescript-errors
			'no-undef': 'off',
			// Convención del repo: parámetro con prefijo `_` = intencionalmente no usado.
			'@typescript-eslint/no-unused-vars': [
				'error',
				{ argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
			]
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser
			}
		}
	},
	{
		// Override or add rule settings here, such as:
		// 'svelte/button-has-type': 'error'
		rules: {}
	},
	{
		// Ley L1 del contrato Vega P1: el SDK `pocketbase` SOLO puede importarse dentro de
		// src/lib/backend/adapters/pocketbase/ EN CÓDIGO DE PRODUCCIÓN. El puerto
		// (src/lib/backend/) y el resto de la app no pueden depender de él, ni siquiera
		// transitivamente. El harness de tests de Fase 2 (tests/contract/pb-harness/ y su
		// fichero de test) queda también excluido a propósito: es infraestructura que arranca
		// y siembra un PocketBase real para la suite de contrato, no el adaptador — no hay
		// forma de sembrar el fixture completo (select/relation/vistas…) a través del
		// vocabulario reducido de `ensureCollections`.
		files: ['**/*.{js,ts,svelte}'],
		ignores: [
			'src/lib/backend/adapters/pocketbase/**',
			'tests/contract/pb-harness/**',
			'tests/contract/pocketbase.contract.test.ts'
		],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					paths: [
						{
							name: 'pocketbase',
							message:
								'"pocketbase" solo puede importarse dentro de src/lib/backend/adapters/pocketbase/ (ley L1 del contrato Vega P1).'
						}
					]
				}
			]
		}
	}
);
