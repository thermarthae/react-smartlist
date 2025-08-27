import {
	reset,
	unstable_flushAllWithoutAsserting as flushAllWithoutAsserting,
} from 'scheduler/unstable_mock';
import { beforeEach, vi } from 'vitest';

vi.mock('scheduler/unstable_mock', { spy: true });
vi.mock('scheduler', async () => import('scheduler/unstable_mock'));

beforeEach(() => {
	flushAllWithoutAsserting();
	reset();
});
