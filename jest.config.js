module.exports = {
	testEnvironment: 'jsdom',
	setupFiles: [
		'./tests/ResizeObserver.setup.ts',
		'./tests/SchedulerMock.setup.ts',
	],
	transform: {
		'^.+\\.(t|j)sx?$': ['@swc/jest'],
	},
};
