import {
	act,
	render,
} from '@testing-library/react';
import {
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from '@jest/globals';

import { TEntry } from '../VirtualList';
import {
	TChildrenProps,
	TProps as TVirtualListItemProps,
} from '../VirtualListItem';

type TItem = { id: number };

let React: typeof import('react');
let scheduler: typeof import('scheduler') & { unstable_flushAll: () => void };
let getFirstCallbackNode: typeof scheduler.unstable_getFirstCallbackNode;
let LowPriority: typeof scheduler.unstable_LowPriority;
let UserBlockingPriority: typeof scheduler.unstable_UserBlockingPriority;
let VirtualListItem: typeof import('../VirtualListItem').default;

jest.useFakeTimers();

describe('VirtualListItem', () => {
	let onMeasureFn: jest.Mock<(item: TEntry<TItem>) => void>;
	let ItemComponent: jest.Mock<React.FunctionComponent<TChildrenProps<TItem, HTMLDivElement> & {
		height?: number;
	}>>;
	let defaultProps: TVirtualListItemProps<TItem, typeof ItemComponent>;

	const triggerMeasurement = () => act(() => {
		jest.runAllTimers();
		scheduler.unstable_flushAll();
	});

	beforeEach(async () => {
		jest.resetModules();

		React = await import('react');
		scheduler = await import('scheduler') as unknown as typeof scheduler;
		getFirstCallbackNode = scheduler.unstable_getFirstCallbackNode;
		LowPriority = scheduler.unstable_LowPriority;
		UserBlockingPriority = scheduler.unstable_UserBlockingPriority;

		VirtualListItem = (await import('../VirtualListItem')).default;

		onMeasureFn = jest.fn();
		ItemComponent = jest.fn(({
			rootElProps,
			innerRef,
			height,
			...rest
		}) => (
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

		defaultProps = {
			component: ItemComponent,
			itWasMeasured: false,
			itemID: 0,
			itemData: { id: 0 },
			itemIndex: 0,
			nailPoint: 0,
			onMeasure: onMeasureFn,
		};
	});

	it('should render', () => {
		const { container } = render(<VirtualListItem {...defaultProps} />);

		expect(ItemComponent).toHaveBeenCalled();
		expect(container.firstChild).toMatchSnapshot();
	});

	it('should attach observers with correct priorities', () => {
		// first render has an UserBlockingPriority:
		render(<VirtualListItem {...defaultProps} />);
		expect(getFirstCallbackNode()?.priorityLevel).toBe(UserBlockingPriority);

		triggerMeasurement();

		// everything except the first render has LowPriority:
		render(<VirtualListItem {...defaultProps} itWasMeasured />);
		expect(getFirstCallbackNode()?.priorityLevel).toBe(LowPriority);
	});

	it('should not attach observers when measurment is disabled', () => {
		render(<VirtualListItem {...defaultProps} isMeasurmentDisabled />);
		expect(getFirstCallbackNode()).toBeNull();
	});

	it('should attach observers when measurment is no longer disabled', () => {
		const { rerender } = render(<VirtualListItem {...defaultProps} isMeasurmentDisabled />);
		expect(getFirstCallbackNode()).toBeNull();

		rerender(<VirtualListItem {...defaultProps} isMeasurmentDisabled={false} />);
		expect(getFirstCallbackNode()).toBeDefined();
	});

	it('should abort an observer attachment at premature unmount', () => {
		const { unmount } = render(<VirtualListItem {...defaultProps} />);

		expect(getFirstCallbackNode()?.callback).toBeDefined();
		unmount();
		expect(getFirstCallbackNode()?.callback).toBeNull();
	});

	it('should not trigger the onMeasure event when height is equal to 0', () => {
		render(<VirtualListItem {...defaultProps} sharedProps={{ height: 0 }} />);

		// give a scheduler some time to attach the listener
		expect(getFirstCallbackNode()).not.toBeNull();
		triggerMeasurement();
		expect(getFirstCallbackNode()).toBeNull();

		expect(onMeasureFn).not.toBeCalled();
	});

	it('should trigger the onMeasure event', () => {
		render(<VirtualListItem {...defaultProps} sharedProps={{ height: 1 }} />);

		// give a scheduler some time to attach the listener
		expect(getFirstCallbackNode()).not.toBeNull();
		triggerMeasurement();
		expect(getFirstCallbackNode()).toBeNull();

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
		const sCU = jest.spyOn(VirtualListItem.prototype, 'shouldComponentUpdate');
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
