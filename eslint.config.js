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
		// Contrato Vega P3 §2.2: `$lib/nav/routes.ts` es el ÚNICO sitio del repo que sabe cómo se
		// ve una URL de Vega ("nadie más compone URLs a mano"); las capas de navegación consumen
		// el string ya construido (`NavApi`/`goto(url)`), justo lo OPUESTO al patrón que exige
		// esta regla (`resolve()` por call-site con el route id literal). Además varias rutas de
		// `nav/routes.ts` (`/c/[type]`, `/settings`, `/media`) aún no existen como ficheros de
		// ruta (llegan en P4/P5/P6), así que `resolve()` ni type-checkaría contra ellas.
		//
		// ACOTADA a las capas que navegan por diseño (rutas + shell + nav + list): fuera de ellas
		// la regla sigue ACTIVA, para cazar una navegación cruda accidental en cualquier otro sitio.
		// `src/lib/list/**` se sumó en la Fase 4c del contrato P4: la celda-título de
		// `RecordTable.svelte` es un `href` real hacia `recordRoute(type, id)` (L-P4.15, "toda fila
		// enlaza SIEMPRE"), mismo patrón y mismo motivo que `NavItem.svelte` en `shell/`.
		files: ['src/routes/**', 'src/lib/shell/**', 'src/lib/nav/**', 'src/lib/list/**'],
		rules: {
			'svelte/no-navigation-without-resolve': 'off'
		}
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
