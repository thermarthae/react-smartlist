import { defineConfig } from 'rolldown';
import { dts } from 'rolldown-plugin-dts';

import pkg from './package.json' with { type: 'json' };

const commonConfig = defineConfig({
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
	plugins: [dts({ sourcemap: true })],
});

export default defineConfig([
	// *.js && *.d.ts
	commonConfig,
	// *.cjs
	{
		...commonConfig,
		output: {
			...commonConfig.output,
			format: 'cjs',
			entryFileNames: '[name].cjs',
		},
		plugins: [],
	},
]);
