import react from '@vitejs/plugin-react';
import { defineConfig, type UserConfig } from 'vite';

export default defineConfig({
	root: './src',
	cacheDir: '../.yarn/.cache/vite',
	plugins: [react()],
	experimental: {
		enableNativePlugin: false,
	},
	test: {
		clearMocks: true,
		environment: 'happy-dom',
		setupFiles: [
			'./tests/ReactTestingLibrary.setup.ts',
			'./tests/ResizeObserver.setup.ts',
			'./tests/SchedulerMock.setup.ts',
		],
	},
} as UserConfig);
