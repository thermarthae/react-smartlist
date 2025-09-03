import {
	act,
	render,
} from '@testing-library/react';
import {
	unstable_flushAll as flushAll,
	unstable_getCurrentPriorityLevel as getCurrentPriorityLevel,
	unstable_LowPriority as LowPriority,
	unstable_UserBlockingPriority as UserBlockingPriority,
} from 'scheduler/unstable_mock';
import {
	describe,
	expect,
	it,
	vi,
} from 'vitest';

import VirtualListItem, { TChildrenProps, TProps as TVirtualListItemProps } from '../VirtualListItem.tsx';

type TSharedProps = {
	title?: string;
};
type TItemData = { id: number; height: number };
type TItemComponentProps = TChildrenProps<TItemData, HTMLDivElement> & TSharedProps;
type TListItemProps = TVirtualListItemProps<TItemData, React.FC<TItemComponentProps>>;

vi.useFakeTimers();

describe('VirtualListItem', () => {
	const onMeasureFn = vi.fn();
	const ItemComponent = vi.fn(({ rootElProps, title, data }: TItemComponentProps) => (
		<div
			{...rootElProps}
			title={title}
			data-id={data.id}
			data-expected-height={data.height}
			children="ListItem"
		/>
	));
	const defaultProps: TListItemProps = {
		component: ItemComponent,
		isAlreadyMeasured: false,
		itemData: { id: 0, height: 10 },
		itemIndex: 0,
		nailPoint: 0,
		onMeasure: onMeasureFn,
	};

	const triggerMeasurement = () => act(() => {
		vi.runAllTimers();
		flushAll();
	});

	const observerConnect = vi.spyOn(ResizeObserver.prototype, 'observe');
	const observerDisconnect = vi.spyOn(ResizeObserver.prototype, 'disconnect');

	it('should render', () => {
		const { container } = render(<VirtualListItem {...defaultProps} />);

		expect(ItemComponent).toHaveBeenCalled();
		expect(container.firstChild).toMatchSnapshot();
	});

	it('should attach observers with correct priorities', () => {
		const fn = vi.fn(() => getCurrentPriorityLevel());

		// first render has an UserBlockingPriority:
		render(<VirtualListItem {...defaultProps} onMeasure={fn} />);
		triggerMeasurement();
		expect(fn).lastReturnedWith(UserBlockingPriority);

		// everything except the first render has LowPriority:
		render(<VirtualListItem {...defaultProps} onMeasure={fn} isAlreadyMeasured />);
		triggerMeasurement();
		expect(fn).lastReturnedWith(LowPriority);
	});

	it('should not attach observers when measurment is disabled', () => {
		render(<VirtualListItem {...defaultProps} isMeasurmentDisabled />);
		triggerMeasurement();
		expect(observerConnect).not.toBeCalled();
	});

	it('should attach observers when measurment is no longer disabled', () => {
		const { rerender } = render(<VirtualListItem {...defaultProps} isMeasurmentDisabled />);
		triggerMeasurement();
		expect(observerConnect).not.toBeCalled();

		rerender(<VirtualListItem {...defaultProps} isMeasurmentDisabled={false} />);
		triggerMeasurement();
		expect(observerConnect).toBeCalled();
	});

	it('should reuse the attached observer when rerendering', () => {
		const { rerender } = render(<VirtualListItem {...defaultProps} />);

		triggerMeasurement();
		expect(observerConnect).toBeCalled();

		observerConnect.mockClear();
		rerender(<VirtualListItem {...defaultProps} isAlreadyMeasured />);

		triggerMeasurement();
		expect(observerConnect).not.toBeCalled();
	});

	it('should abort an observer attachment at premature unmount', () => {
		const { unmount } = render(<VirtualListItem {...defaultProps} />);

		unmount();
		triggerMeasurement();
		expect(onMeasureFn).not.toBeCalled();
	});

	it('should disconnect from ResizeObserver when unmounting', () => {
		const { unmount } = render(<VirtualListItem {...defaultProps} />);
		triggerMeasurement();
		expect(observerDisconnect).not.toBeCalled();

		unmount();
		expect(observerDisconnect).toBeCalled();
	});

	it('should not trigger the onMeasure event when height is equal to 0', () => {
		render(<VirtualListItem {...defaultProps} itemData={{ id: 1, height: 0 }} />);

		// give a scheduler some time to attach the listener
		triggerMeasurement();

		expect(onMeasureFn).not.toHaveBeenCalled();
	});

	it('should trigger the onMeasure event', () => {
		const height = 3;
		render(<VirtualListItem {...defaultProps} itemData={{ id: 1, height }} />);

		// give a scheduler some time to attach the listener
		triggerMeasurement();

		expect(onMeasureFn).toHaveReturnedTimes(1);
		expect(onMeasureFn).toHaveBeenCalledWith(height);
	});

	it('should not rerender when it is unnecessary', () => {
		const makeMeasureFn = (key = '0') => Object.assign(() => 0, { key });

		let prevProps: TListItemProps = {
			...defaultProps,
			onMeasure: makeMeasureFn(),
			sharedProps: { title: '0' },
		};
		const { rerender } = render(<VirtualListItem {...prevProps} />);

		const testProps = (newProps: Partial<TListItemProps>, shouldRerender: boolean) => {
			ItemComponent.mockClear();
			prevProps = { ...prevProps, ...newProps };
			rerender(<VirtualListItem {...prevProps} />);

			expect(ItemComponent).toHaveBeenCalledTimes(shouldRerender ? 1 : 0);
		};

		testProps({}, false);
		testProps({ itemData: { ...prevProps.itemData } }, false);
		testProps({ itemData: { id: 52, height: 100 } }, true);
		testProps({ itemIndex: 43 }, true);
		testProps({ nailPoint: 91 }, true);
		testProps({ isAlreadyMeasured: !prevProps.isAlreadyMeasured }, true);
		testProps({ onMeasure: makeMeasureFn(prevProps.onMeasure.key) }, false);
		testProps({ onMeasure: makeMeasureFn('1') }, true);
		testProps({ sharedProps: { ...prevProps.sharedProps } }, false);
		testProps({ sharedProps: { title: '1' } }, true);
	});
});
