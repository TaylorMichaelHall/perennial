import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import ts from 'typescript-eslint';

export default ts.config(
	{ ignores: ['.svelte-kit/', 'build/', 'data/', 'test-results/', 'playwright-report/'] },
	js.configs.recommended,
	ts.configs.recommended,
	svelte.configs.recommended,
	{
		languageOptions: {
			globals: { ...globals.browser, ...globals.node }
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts'],
		languageOptions: {
			parserOptions: { parser: ts.parser }
		},
		// TypeScript already reports undefined names, and knows the DOM's types.
		rules: { 'no-undef': 'off' }
	}
);
