import thermarthaeConfig from '@thermarthae/eslint-config';

/** @type {import('eslint').Linter.Config[]} */
const config = [
	...thermarthaeConfig,
	{
		ignores: ['node_modules/**/*', '.yarn/**/*', '.pnp.*', 'dist/**/*'],
	},
	{
		languageOptions: {
			parserOptions: {
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},
	{
		rules: {
			// FIXME: https://github.com/eslint-stylistic/eslint-stylistic/issues/915#issuecomment-3167381649
			'@stylistic/jsx-tag-spacing': 0,
		},
	},
];

export default config;
