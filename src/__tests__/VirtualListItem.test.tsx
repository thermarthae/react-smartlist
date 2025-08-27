import {
	act,
	render,
} from '@testing-library/react';
import scheduler, {
	CallbackNode,
	unstable_hasPendingWork as hasPendingWork,
	unstable_LowPriority as LowPriority,
	unstable_scheduleCallback as scheduleCallback,
	unstable_UserBlockingPriority as UserBlockingPriority,
} from 'scheduler/unstable_mock';
import {
	describe,
	expect,
	it,
	vi,
} from 'vitest';

import type { TEntry } from '../VirtualList.tsx';
import VirtualListItem, { TChildrenProps, TProps as TVirtualListItemProps } from '../VirtualListItem.tsx';

type TItem = { id: number };

vi.useFakeTimers();

describe('VirtualListItem', () => {
	const getLastScheduledNode = () => vi.mocked(scheduleCallback).mock
		.results.at(-1)?.value as CallbackNode | undefined;

	const onMeasureFn = vi.fn<(item: TEntry<TItem>) => void>();
	const ItemComponent = vi.fn(({
		rootElProps,
		innerRef,
		height,
		...rest
	}: TChildrenProps<TItem, HTMLDivElement> & { height?: number }) => (
		<div
			{...rootElProps}
			style={{
				...rootElProps.style,
				height,
			}}
			ref={innerRef}
			children={JSON.stringify(rest)}
		/>
	));
	const defaultProps: TVirtualListItemProps<TItem, typeof ItemComponent> = {
		component: ItemComponent,
		itWasMeasured: false,
		itemID: 0,
		itemData: { id: 0 },
		itemIndex: 0,
		nailPoint: 0,
		onMeasure: onMeasureFn,
	};

	const triggerMeasurement = () => act(() => {
		vi.runAllTimers();
		scheduler.unstable_flushAll();
	});

	it('should render', () => {
		const { container } = render(<VirtualListItem {...defaultProps} />);

		expect(ItemComponent).toHaveBeenCalled();
		expect(container.firstChild).toMatchSnapshot();
	});

	it('should attach observers with correct priorities', () => {
		// first render has an UserBlockingPriority:
		render(<VirtualListItem {...defaultProps} />);
		expect(getLastScheduledNode()?.priorityLevel).toBe(UserBlockingPriority);

		triggerMeasurement();

		// everything except the first render has LowPriority:
		render(<VirtualListItem {...defaultProps} itWasMeasured />);
		expect(getLastScheduledNode()?.priorityLevel).toBe(LowPriority);
	});

	it('should not attach observers when measurment is disabled', () => {
		render(<VirtualListItem {...defaultProps} isMeasurmentDisabled />);
		expect(hasPendingWork()).toBeFalsy();
	});

	it('should attach observers when measurment is no longer disabled', () => {
		const { rerender } = render(<VirtualListItem {...defaultProps} isMeasurmentDisabled />);
		expect(hasPendingWork()).toBeFalsy();

		rerender(<VirtualListItem {...defaultProps} isMeasurmentDisabled={false} />);
		expect(hasPendingWork()).toBeTruthy();
	});

	it('should abort an observer attachment at premature unmount', () => {
		const { unmount } = render(<VirtualListItem {...defaultProps} />);

		const node = getLastScheduledNode()!;
		expect(node.callback).toBeDefined();

		unmount();
		expect(node.callback).toBeNull();
	});

	it('should not trigger the onMeasure event when height is equal to 0', () => {
		render(<VirtualListItem {...defaultProps} sharedProps={{ height: 0 }} />);

		// give a scheduler some time to attach the listener
		triggerMeasurement();

		expect(onMeasureFn).not.toHaveBeenCalled();
	});

	it('should trigger the onMeasure event', () => {
		render(<VirtualListItem {...defaultProps} sharedProps={{ height: 1 }} />);

		// give a scheduler some time to attach the listener
		triggerMeasurement();

		expect(onMeasureFn).toHaveReturnedTimes(1);
		expect(onMeasureFn).toHaveBeenCalledWith({
			id: defaultProps.itemID,
			index: defaultProps.itemIndex,
			data: defaultProps.itemData,
			height: 1,
		});
	});

	it('should not rerender when it is unnecessary', () => {
		let prevProps: TVirtualListItemProps<TItem> = {
			...defaultProps,
			sharedProps: {},
		};
		const sCU = vi.spyOn(VirtualListItem.prototype, 'shouldComponentUpdate');
		const { rerender } = render(<VirtualListItem {...prevProps} />);

		const testProps = (newProps: Partial<typeof prevProps>, shouldRerender: boolean) => {
			sCU.mockClear();
			prevProps = { ...prevProps, ...newProps };
			rerender(<VirtualListItem {...prevProps} />);

			expect(sCU).toHaveNthReturnedWith(1, shouldRerender);
		};

		testProps({}, false);
		testProps({ itemData: { ...prevProps.itemData } }, false);
		testProps({ itemData: { id: 52 } }, true);
		testProps({ itemIndex: 43 }, true);
		testProps({ nailPoint: 91 }, true);
		testProps({ itWasMeasured: !prevProps.itWasMeasured }, true);
		testProps({ onMeasure: () => 0 }, true);
		testProps({ sharedProps: { ...prevProps.sharedProps } }, false);
		testProps({ sharedProps: { x: 2 } }, true);
	});
});
