import { jest } from '@jest/globals';

jest.mock('scheduler', () => {
	const scheduler = jest.requireActual<typeof import('scheduler')>('scheduler/unstable_mock');

	return {
		...scheduler,
		unstable_scheduleCallback: jest.fn(scheduler.unstable_scheduleCallback),
	};
});
