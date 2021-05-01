/* eslint-disable @typescript-eslint/no-var-requires */
import React from 'react';
import { render } from '@testing-library/react';
import {
	unstable_LowPriority as LowPriority,
	unstable_UserBlockingPriority as UserBlockingPriority,
} from 'scheduler';

import '../../tests/ResizeObserverHack';
import { TEntry } from '../VirtualList';
import {
	TProps as TVirtualListItemProps,
	TChildrenProps,
} from '../VirtualListItem';

type TScheduler = typeof import('scheduler');
type TItem = { id: number };

jest.useFakeTimers();
const triggerMeasurement = () => jest.advanceTimersByTime(1);

let getFirstCallbackNode: TScheduler['unstable_getFirstCallbackNode'];
let VirtualListItem: typeof import('../VirtualListItem').default;

describe('VirtualListItem', () => {
	let onMeasureFn: jest.Mock<void, [item: TEntry<TItem>]>;
	let ItemComponent: jest.Mock<JSX.Element, [TChildrenProps<TItem, HTMLDivElement> & {
		height?: number;
	}]>;
	let defaultProps: TVirtualListItemProps<TItem, typeof ItemComponent>;

	beforeEach(async () => {
		jest.resetModules();

		const Scheduler = await import('scheduler');
		getFirstCallbackNode = Scheduler.unstable_getFirstCallbackNode;

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
