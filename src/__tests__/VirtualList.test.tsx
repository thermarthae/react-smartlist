import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import VirtualList, { TProps as TVirtualListProps } from '../VirtualList';
import { TChildrenProps } from '../VirtualListItem';
import '../../tests/ResizeObserverHack';

type TItem = {
	id: number;
	height: number;
};
type TSharedProps = {
	title?: string;
};

jest.useFakeTimers();
const triggerMeasurement = () => jest.advanceTimersByTime(1);

describe('VirtualList', () => {
	let itemKeyFn: jest.Mock<number, [item: TItem]>;
	let ItemComponent: jest.Mock<JSX.Element, [TChildrenProps<TItem, HTMLDivElement> & TSharedProps]>;
	let defaultProps: TVirtualListProps<TItem>;
	let estimatedNailPoints: number[];

	const estimatedItemHeight = 50;
	const windowInnerHeight = 768; // Jest sets 768px as a default `window.innerHeight` value

	const genItemArray = (length: number): TItem[] => [...Array(length)].map((_v, index) => ({
		id: index,
		height: (index % 10 === 0) ? 100 : 50,
	}));
	const genNailPoints = (arr = defaultProps.items) => arr.reduce(
		(prev, item, i) => [...prev, prev[i] + item.height],
		[0],
	);
	const simulateScroll = (scrollOffset: number) => {
		document.documentElement.scrollTop = scrollOffset;
		fireEvent.scroll(document);
	};

	beforeEach(() => {
		itemKeyFn = jest.fn((item: TItem) => item.id);

		ItemComponent = jest.fn(({
			rootElProps,
			innerRef,
			data,
			title,
		}) => (
			<div
				{...rootElProps}
				ref={innerRef}
				style={{ ...rootElProps.style, height: data.height }}
				title={title}
				data-id={data.id}
				data-height={data.height}
				children="ListItem"
			/>
		));

		defaultProps = {
			component: ItemComponent,
			items: genItemArray(50),
			estimatedItemHeight,
			itemKey: itemKeyFn,
			overscanPadding: 0,
		};
		estimatedNailPoints ??= defaultProps.items.map((_data, index) => index * estimatedItemHeight);

		// JSdom does not do actual layout and so doesn't return meaningful values here.
		// For the purposes of our tests though, we can mock out semi-meaningful values.
		// This mock is required for e.g. "onScroll" tests to work properly.
		Object.defineProperties(HTMLElement.prototype, {
			scrollHeight: {
				configurable: true,
				get: () => Number.MAX_SAFE_INTEGER,
			},
		});
	});

	it('should render an empty list', () => {
		render(<VirtualList {...defaultProps} items={[]} />);

		expect(ItemComponent).not.toHaveBeenCalled();
		expect(itemKeyFn).not.toHaveBeenCalled();
	});

	it('should render a simple list', () => {
		const { container } = render(
			<VirtualList
				{...defaultProps}
				items={defaultProps.items.slice(0, 3)}
			/>,
		);
		const list = container.firstElementChild as HTMLElement;

		expect(list.childElementCount).toEqual(3);
		expect(ItemComponent).toHaveBeenCalledTimes(3);
		expect(itemKeyFn).toHaveBeenCalledTimes(3);
	});

	it('should correctly estimate a list height', () => {
		const { container } = render(<VirtualList {...defaultProps} />);
		const list = container.firstElementChild as HTMLElement;

		const estimatedListHeight = defaultProps.items.length * estimatedItemHeight;
		expect(list.style.height).toEqual(`${estimatedListHeight}px`);
	});

	it('should measure items and update the list height', () => {
		const { container } = render(<VirtualList {...defaultProps} />);
		const list = container.firstElementChild as HTMLElement;

		const nailPoints = genNailPoints();
		const estimatedListHeight = parseInt(list.style.height, 10);
		const expectedItemsCount = nailPoints.findIndex(i => i >= windowInnerHeight)!;
		const expectedListHeight = nailPoints[expectedItemsCount]
			+ (nailPoints.length - expectedItemsCount - 1) * estimatedItemHeight;

		triggerMeasurement();

		expect(list.childElementCount).toEqual(expectedItemsCount);
		expect(list.style.height).toEqual(`${expectedListHeight}px`);
		expect(estimatedListHeight).not.toEqual(expectedListHeight);
	});

	it('should handle `items` prop change', () => {
		const initialItems = genItemArray(5); // 1,2,3,4,5
		const updatedItems = genItemArray(5).reverse(); // 5,4,3,2,1

		const { rerender, getAllByText } = render(<VirtualList {...defaultProps} items={initialItems} />);
		const initialOrder = getAllByText(/ListItem/).map(el => el.dataset.id);

		rerender(<VirtualList {...defaultProps} items={updatedItems} />);
		const updatedOrder = getAllByText(/ListItem/).map(el => el.dataset.id);

		expect(updatedOrder).toStrictEqual(initialOrder.reverse());
		expect(ItemComponent).toHaveBeenCalledTimes(10);
		expect(itemKeyFn).toHaveBeenCalledTimes(10);
	});

	it('should support a `className` prop', () => {
		const customClassName = Math.random().toString();
		const { container } = render(<VirtualList {...defaultProps} className={customClassName} />);
		const list = container.firstElementChild as HTMLElement;

		expect(list.className).toBe(customClassName);
	});

	it('should correctly pass the shared props', () => {
		const title = 'Shared works!';
		const { container, getAllByTitle } = render(<VirtualList {...defaultProps} sharedProps={{ title }} />);
		const list = container.firstElementChild as HTMLElement;
		const listItems = getAllByTitle(title);

		expect(listItems).toHaveLength(list.childElementCount);
	});

	it('should support custom initial state', () => {
		const initState = {
			listHeight: 2137,
		};
		const { container } = render(<VirtualList {...defaultProps} initState={initState} />);
		const list = container.firstElementChild as HTMLElement;

		expect(list.style.height).toEqual(`${initState.listHeight}px`);
	});

	it('should correctly overscan when items heights are estimated', () => {
		const padding = 1000;
		const { container } = render(<VirtualList {...defaultProps} overscanPadding={padding} />);
		const list = container.firstElementChild as HTMLElement;

		const paddedWindow = windowInnerHeight + padding;
		const expectedCount = estimatedNailPoints.findIndex(i => i >= paddedWindow)!;

		expect(list.childElementCount).toEqual(expectedCount);
	});

	it('should correctly overscan when items have measured heights', () => {
		const padding = 500;
		const { container } = render(<VirtualList {...defaultProps} overscanPadding={padding} />);
		const list = container.firstElementChild as HTMLElement;

		triggerMeasurement();

		const expectedCount = genNailPoints().findIndex(i => i >= (windowInnerHeight + padding))!;
		expect(list.childElementCount).toEqual(expectedCount);
	});

	it('should handle `overscanPadding` prop change', () => {
		const initialPadding = 1000;
		const { container, rerender } = render(<VirtualList {...defaultProps} overscanPadding={initialPadding} />);
		const list = container.firstElementChild as HTMLElement;

		const initWindowHeight = windowInnerHeight + initialPadding;
		const initCount = estimatedNailPoints.findIndex(i => i >= initWindowHeight)!;
		expect(list.childElementCount).toEqual(initCount);
		//
		const changedPadding = 500;
		rerender(<VirtualList {...defaultProps} overscanPadding={changedPadding} />);

		const newWindowHeight = windowInnerHeight + changedPadding;
		const newCount = estimatedNailPoints.findIndex(i => i >= newWindowHeight)!;
		expect(list.childElementCount).toEqual(newCount);
		expect(initCount).not.toEqual(newCount);
	});

	it('should render only the visible items', () => {
		const index = 25;
		const expectedFirstVisibleID = defaultProps.items[index].id.toString();

		const { getAllByText } = render(<VirtualList {...defaultProps} />);
		const initFirstVisibleID = getAllByText(/ListItem/)[0].dataset.id;

		simulateScroll(estimatedNailPoints[index] + 1);

		const firstVisibleID = getAllByText(/ListItem/)[0].dataset.id;
		expect(firstVisibleID).not.toEqual(initFirstVisibleID);
		expect(firstVisibleID).toEqual(expectedFirstVisibleID);
	});

	it('should not render any items when scrolled out of bounds', () => {
		const { queryAllByText, container } = render(<VirtualList {...defaultProps} />);
		const list = container.firstElementChild as HTMLElement;
		const listHeight = parseInt(list.style.height, 10);

		simulateScroll(0 - windowInnerHeight - 10); // above the list
		expect(queryAllByText(/ListItem/)).toHaveLength(0);

		simulateScroll(0);
		expect(queryAllByText(/ListItem/)).not.toHaveLength(0);

		simulateScroll(listHeight + 10); // below the list
		expect(queryAllByText(/ListItem/)).toHaveLength(0);
	});

	it('should handle instant top/bottom scrolling', () => {
		const { getAllByText, container } = render(<VirtualList {...defaultProps} />);
		const list = container.firstElementChild as HTMLElement;
		const listHeight = parseInt(list.style.height, 10);

		simulateScroll(listHeight - windowInnerHeight);
		const bottomItems = getAllByText(/ListItem/);

		simulateScroll(0);
		const topItems = getAllByText(/ListItem/);

		const [firstTopItem] = topItems;
		const [lastBottomItem] = bottomItems.slice(-1);

		expect(topItems).toHaveLength(bottomItems.length);
		expect(topItems[0]).not.toBe(bottomItems[0]);
		expect(firstTopItem.dataset.id).toEqual(defaultProps.items[0].id.toString());
		expect(lastBottomItem.dataset.id).toEqual(defaultProps.items.slice(-1)[0].id.toString());
	});
});
