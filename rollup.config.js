import dts from 'rollup-plugin-dts';
import { swc } from 'rollup-plugin-swc3';

import pkg from './package.json' with { type: 'json' };

/**  @type {import('rollup').RollupOptions} */
const commonConfig = {
	input: './src/index.ts',
	external: [
		'react/jsx-runtime',
		...Object.keys(pkg.dependencies),
		...Object.keys(pkg.peerDependencies),
	],
	output: {
		dir: './dist',
		preserveModules: true,
		sourcemap: true,
	},
	plugins: [
		swc({
			jsc: {
				target: 'es2022',
			},
		}),
	],
};

/**  @type {import('rollup').RollupOptions[]} */
export default [
	// *.js
	{
		...commonConfig,
		output: {
			...commonConfig.output,
			format: 'esm',
		},
	},
	// *.cjs
	{
		...commonConfig,
		output: {
			...commonConfig.output,
			format: 'cjs',
			entryFileNames: '[name].cjs',
		},
	},
	// *.d.ts
	{
		...commonConfig,
		output: {
			...commonConfig.output,
			sourcemap: false,
		},
		plugins: [dts()],
	},
];
