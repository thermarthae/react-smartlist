import {
	act,
	fireEvent,
	render,
} from '@testing-library/react';
import { unstable_flushAll as flushAll } from 'scheduler/unstable_mock';
import {
	describe,
	expect,
	it,
	vi,
} from 'vitest';

import VirtualList, { TProps as TVirtualListProps } from '../VirtualList.tsx';
import VirtualListItem, { TChildrenProps } from '../VirtualListItem.tsx';

type TSharedProps = {
	title?: string;
};
type TItemData = {
	id: number;
	height: number;
};
type TItemComponentProps = TChildrenProps<TItemData, HTMLDivElement> & TSharedProps;
type TListProps = TVirtualListProps<TItemData, React.FC<TItemComponentProps>>;

vi.useFakeTimers();

describe('VirtualList', () => {
	const estimatedItemHeight = 50;

	const genItemArray = (length: number): TItemData[] => [...Array(length) as unknown[]].map((_v, index) => ({
		id: index,
		height: (index % 10 === 0) ? 100 : 50,
	}));
	const genNailPoints = (arr = defaultProps.items) => arr.reduce(
		(prev, item, i) => [...prev, prev[i] + item.height],
		[0],
	).slice(0, arr.length);
	const simulateScroll = (scrollOffset: number) => {
		document.documentElement.scrollTop = scrollOffset;
		fireEvent.scroll(document);
	};

	const triggerMeasurement = () => act(() => {
		vi.runAllTimers();
		flushAll();
	});

	const ItemComponent = vi.fn(({ rootElProps, title, data }: TItemComponentProps) => (
		<div
			{...rootElProps}
			title={title}
			data-id={data.id}
			data-expected-height={data.height}
			children="ListItem"
		/>
	));
	const defaultProps: TListProps = {
		component: ItemComponent,
		items: genItemArray(50),
		estimatedItemHeight,
		overscanPadding: 0,
	};
	const estimatedNailPoints = defaultProps.items.map((_data, index) => index * estimatedItemHeight);

	it('should render an empty list', () => {
		render(<VirtualList {...defaultProps} items={[]} />);

		expect(ItemComponent).not.toHaveBeenCalled();
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
	});

	it('should correctly estimate a list height', () => {
		const { container } = render(<VirtualList {...defaultProps} />);
		const list = container.firstElementChild as HTMLElement;

		const estimatedListHeight = defaultProps.items.length * estimatedItemHeight;
		expect(list.style.height).toEqual(`${estimatedListHeight}px`);
	});

	it('should measure items and update the list height', () => {
		const { container, getAllByText } = render(<VirtualList {...defaultProps} />);
		const list = container.firstElementChild as HTMLElement;

		const nailPoints = genNailPoints();
		const estimatedListHeight = parseInt(list.style.height, 10);
		const expectedItemsCount = nailPoints.findIndex(i => i >= window.innerHeight);
		const expectedListHeight = nailPoints[expectedItemsCount]
			+ (nailPoints.length - expectedItemsCount) * estimatedItemHeight;

		const hasMeasuredItemsBefore = getAllByText(/ListItem/).every(el => el.dataset.measured === 'true');
		expect(hasMeasuredItemsBefore).toBeFalsy();

		triggerMeasurement();

		const hasMeasuredItemsAfter = getAllByText(/ListItem/).every(el => el.dataset.measured === 'true');
		expect(hasMeasuredItemsAfter).toBeTruthy();

		expect(list.childElementCount).toEqual(expectedItemsCount);
		expect(list.style.height).toEqual(`${expectedListHeight}px`);
		expect(estimatedListHeight).not.toEqual(expectedListHeight);
	});

	it('should handle `disableMeasurment` prop', () => {
		const { container } = render(<VirtualList {...defaultProps} disableMeasurment />);
		const list = container.firstElementChild as HTMLElement;
		const expectedItemsCount = estimatedNailPoints.findIndex(i => i >= window.innerHeight);
		const expectedListHeight = defaultProps.items.length * estimatedItemHeight;

		triggerMeasurement();

		expect(list.childElementCount).toEqual(expectedItemsCount);
		expect(list.style.height).toEqual(`${expectedListHeight}px`);
		expect(parseInt(list.style.height, 10)).toEqual(expectedListHeight);
	});

	it('should handle `items` prop change', () => {
		const initialItems = genItemArray(5); // 0,1,2,3,4
		const updatedItems = genItemArray(10).slice(5); // 5,6,7,8,9

		const { rerender } = render(<VirtualList {...defaultProps} items={initialItems} />);
		rerender(<VirtualList {...defaultProps} items={updatedItems} />);

		const calls = ItemComponent.mock.calls.map(item => item[0].data);
		expect(calls).toEqual([...initialItems, ...updatedItems]);
		expect(ItemComponent).toHaveBeenCalledTimes(10);
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

		const paddedWindow = window.innerHeight + padding;
		const expectedCount = estimatedNailPoints.findIndex(i => i >= paddedWindow);

		expect(list.childElementCount).toEqual(expectedCount);
	});

	it('should correctly overscan when items have measured heights', () => {
		const padding = 500;
		const { container } = render(<VirtualList {...defaultProps} overscanPadding={padding} />);
		const list = container.firstElementChild as HTMLElement;

		triggerMeasurement();

		const expectedCount = genNailPoints().findIndex(i => i >= (window.innerHeight + padding));
		expect(list.childElementCount).toEqual(expectedCount);
	});

	it('should handle `overscanPadding` prop change', () => {
		const initialPadding = 1000;
		const { container, rerender } = render(<VirtualList {...defaultProps} overscanPadding={initialPadding} />);
		const list = container.firstElementChild as HTMLElement;

		const initWindowHeight = window.innerHeight + initialPadding;
		const initCount = estimatedNailPoints.findIndex(i => i >= initWindowHeight);
		expect(list.childElementCount).toEqual(initCount);
		//
		const changedPadding = 500;
		rerender(<VirtualList {...defaultProps} overscanPadding={changedPadding} />);

		const newWindowHeight = window.innerHeight + changedPadding;
		const newCount = estimatedNailPoints.findIndex(i => i >= newWindowHeight);
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
		const { queryAllByText } = render(<VirtualList {...defaultProps} />);

		simulateScroll(-999999); // scroll above the list
		expect(queryAllByText(/ListItem/)).toEqual([]);

		simulateScroll(0); // scroll to the top of the list
		expect(queryAllByText(/ListItem/)).not.toEqual([]);

		simulateScroll(999999); // scroll below the list
		expect(queryAllByText(/ListItem/)).toEqual([]);
	});

	it('should invoke the `onScroll` event function', () => {
		const scrollHandler = vi.fn();
		render(<VirtualList {...defaultProps} onScroll={scrollHandler} />);

		scrollHandler.mockClear();

		expect(scrollHandler).not.toHaveBeenCalled();
		simulateScroll(100);
		expect(scrollHandler).toHaveBeenCalledTimes(1);
	});

	it('should handle instant top/bottom scrolling', () => {
		const { getAllByText, container } = render(<VirtualList {...defaultProps} />);
		const list = container.firstElementChild as HTMLElement;
		const listHeight = parseInt(list.style.height, 10);

		simulateScroll(listHeight - window.innerHeight);
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

	it('should not jump when measured item is larger than viewport', () => {
		const items: TItemData[] = [
			{ id: 0, height: window.innerHeight * 2 },
			...defaultProps.items.slice(1),
		];
		const { getAllByText } = render(<VirtualList {...defaultProps} items={items} />);

		const initRender = getAllByText(/ListItem/);
		expect(initRender).toHaveLength(Math.ceil(window.innerHeight / estimatedItemHeight));

		triggerMeasurement();

		const renderedItems = getAllByText(/ListItem/);
		expect(renderedItems).toHaveLength(1);
	});

	it('should not rerender when it is unnecessary', () => {
		let prevProps: TListProps = {
			...defaultProps,
			className: 'test1',
			sharedProps: { title: '0' },
			initState: {},
		};
		const listRender = vi.spyOn(VirtualList, 'type');
		const { rerender } = render(<VirtualList {...prevProps} />);

		const testProps = (newProps: Partial<TListProps>, shouldRerender: boolean) => {
			listRender.mockClear();
			prevProps = { ...prevProps, ...newProps };
			rerender(<VirtualList {...prevProps} />);

			if (shouldRerender) expect(listRender).toBeCalled();
			else expect(listRender).not.toBeCalled();
		};

		testProps({}, false);
		testProps({ items: genItemArray(3) }, true);
		testProps({ estimatedItemHeight: 90 }, true);
		testProps({ overscanPadding: 90 }, true);
		testProps({ className: 'test2' }, true);
		testProps({ sharedProps: { title: '1' } }, true);
		testProps({ sharedProps: { ...prevProps.sharedProps } }, false);
		testProps({ initState: { lastIndex: 3 } }, false);
	});

	it('should handle the measurement when item is no longer visible', () => {
		const ListItem = vi.spyOn(VirtualListItem, 'type');
		const { container, getAllByText } = render(<VirtualList {...defaultProps} estimatedItemHeight={1} />);
		const list = container.firstElementChild as HTMLElement;

		expect(ListItem).toBeCalled();
		const lastOfListItemProps = ListItem.mock.lastCall![0];

		triggerMeasurement();

		const firstlyRendered = getAllByText('ListItem').map(i => i.dataset.id);
		expect(firstlyRendered).not.toContain(lastOfListItemProps.itemData.id);

		const listHeightBefore = Number(list.style.height);
		const itemHeight = 10000;
		act(() => lastOfListItemProps.onMeasure(lastOfListItemProps.itemIndex, itemHeight));

		expect(getAllByText('ListItem').map(i => i.dataset.id)).toEqual(firstlyRendered);
		expect(Number(list.style.height)).toBe(listHeightBefore + (itemHeight - estimatedItemHeight));
	});

	it('should not rerender when `items` array has changed without changing its actual content', () => {
		let items = defaultProps.items.slice(0, 3);
		const { rerender } = render(<VirtualList {...defaultProps} items={items} />);
		triggerMeasurement();
		ItemComponent.mockClear();

		items = [...items];
		items[0] = { ...items[0] };
		rerender(<VirtualList {...defaultProps} items={items} />);
		triggerMeasurement();

		expect(ItemComponent).not.toHaveBeenCalled();
	});

	it('should not crash when rerender to a shorter list', () => {
		const {
			rerender,
			container,
			queryAllByText,
		} = render(<VirtualList {...defaultProps} items={genItemArray(500)} />);
		const list = container.firstElementChild as HTMLElement;
		triggerMeasurement();
		expect(queryAllByText(/ListItem/)).not.toHaveLength(0);

		const listHeight = parseInt(list.style.height, 10);
		simulateScroll(listHeight / 2);
		triggerMeasurement();
		expect(queryAllByText(/ListItem/)).not.toHaveLength(0);

		rerender(<VirtualList {...defaultProps} items={genItemArray(10)} />);
		triggerMeasurement();
		expect(queryAllByText(/ListItem/)).toHaveLength(0);

		simulateScroll(0);
		expect(queryAllByText(/ListItem/)).not.toHaveLength(0);
	});

	it('should handle items that shrink above the viewport', () => {
		const height = 100;
		const estimatedHeight = 1000;
		const items = [...Array(500) as unknown[]].map((_, id) => ({ id, height }));
		const docEl = document.documentElement;

		// init one pixel below the last item
		simulateScroll(items.length * estimatedHeight);
		const { queryAllByText } = render(
			<VirtualList
				{...defaultProps}
				items={items}
				estimatedItemHeight={estimatedHeight}
			/>,
		);
		expect(queryAllByText('ListItem')).toEqual([]);
		triggerMeasurement();
		expect(queryAllByText('ListItem')).toEqual([]);

		// scroll one pixel up to render the last item only
		simulateScroll(docEl.scrollTop - 1);
		const oneLastBefore = queryAllByText('ListItem').map(i => i.dataset.id);
		expect(oneLastBefore).toEqual(['499']);

		triggerMeasurement();
		const oneLastAfter = queryAllByText('ListItem').map(i => i.dataset.id);
		expect(oneLastAfter).toEqual(oneLastBefore);

		// scroll one item up to render last 2 items
		simulateScroll(docEl.scrollTop - height);
		const twoLastBefore = queryAllByText('ListItem').map(i => i.dataset.id);
		expect(twoLastBefore).toEqual(['498', '499']);

		triggerMeasurement();
		const twoLastAfter = queryAllByText('ListItem').map(i => i.dataset.id);
		expect(twoLastAfter).toEqual(twoLastBefore);
	});

	it('should handle items that grow above the viewport', () => {
		const height = 1000;
		const estimatedHeight = 100;
		const items = [...Array(500) as unknown[]].map((_, id) => ({ id, height }));
		const docEl = document.documentElement;

		// init one pixel below the last item
		simulateScroll(items.length * estimatedHeight);
		const { queryAllByText } = render(
			<VirtualList
				{...defaultProps}
				items={items}
				estimatedItemHeight={estimatedHeight}
			/>,
		);
		expect(queryAllByText('ListItem')).toEqual([]);
		triggerMeasurement();
		expect(queryAllByText('ListItem')).toEqual([]);

		// scroll one pixel up to render the last item only
		simulateScroll(docEl.scrollTop - 1);
		const oneLastBefore = queryAllByText('ListItem').map(i => i.dataset.id);
		expect(oneLastBefore).toEqual(['499']);

		triggerMeasurement();
		const oneLastAfter = queryAllByText('ListItem').map(i => i.dataset.id);
		expect(oneLastAfter).toEqual(oneLastBefore);

		// scroll one pixel below the last item again
		simulateScroll(docEl.scrollTop + 1);
		expect(queryAllByText('ListItem')).toEqual([]);
		triggerMeasurement();
		expect(queryAllByText('ListItem')).toEqual([]);

		// scroll one pixel up and item up to render last 2 items
		simulateScroll(docEl.scrollTop - 1 - height);
		const twoLastBefore = queryAllByText('ListItem').map(i => i.dataset.id);
		expect(twoLastBefore).toEqual(['498', '499']);

		triggerMeasurement();
		const twoLastAfter = queryAllByText('ListItem').map(i => i.dataset.id);
		expect(twoLastAfter).toEqual(twoLastBefore);

		// scroll item up to render 2 penultimate items
		simulateScroll(docEl.scrollTop - height);
		const twoPenultimateBefore = queryAllByText('ListItem').map(i => i.dataset.id);
		expect(twoPenultimateBefore).toStrictEqual(['497', '498']);

		triggerMeasurement();
		const twoPenultimateAfter = queryAllByText('ListItem').map(i => i.dataset.id);
		expect(twoPenultimateAfter).toStrictEqual(twoPenultimateBefore);
	});

	it('should handle instant scroll into the unmesured items', () => {
		const height = 1000;
		const estimatedHeight = 100;
		const items = [...Array(500) as undefined[]].map((_, id) => ({ id, height }));
		const docEl = document.documentElement;

		// init one pixel below the last item
		simulateScroll(items.length * estimatedHeight);
		const { queryAllByText } = render(
			<VirtualList
				{...defaultProps}
				items={items}
				estimatedItemHeight={estimatedHeight}
			/>,
		);
		expect(queryAllByText('ListItem')).toEqual([]);
		triggerMeasurement();
		expect(queryAllByText('ListItem')).toEqual([]);

		simulateScroll(docEl.scrollTop - 1 - height);
		const beforeResult = queryAllByText('ListItem').map(i => i.dataset.id);
		expect(beforeResult).toEqual(['489', '490', '491', '492', '493', '494', '495', '496', '497']);

		triggerMeasurement();
		const afterResult = queryAllByText('ListItem').map(i => i.dataset.id);
		expect(afterResult).toEqual(['489']);
	});
});
