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
];

export default config;
