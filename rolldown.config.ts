import { defineConfig } from 'rolldown';
import { dts } from 'rolldown-plugin-dts';

import pkg from './package.json' with { type: 'json' };

export default defineConfig({
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
