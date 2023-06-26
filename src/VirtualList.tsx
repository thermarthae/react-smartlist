import {
	Component,
	createRef,
	ElementType,
} from 'react';
import { shallowEqualObjects } from 'shallow-equal';

import clampIntoArrRange from './clampIntoArrRange';
import VirtualListItem, { TSharedProps } from './VirtualListItem';

export type TItemID = string | number;

export type TWindowEdges = {
	topEdge: number;
	bottomEdge: number;
	rawTopEdge: number;
	rawBottomEdge: number;
	listScrollHeight: number;
	scrollDiff: number;
	isInView: boolean;
};

export type TEntry<Item> = {
	id: TItemID;
	index: number;
	height: number;
	data: Item;
};

//

export type TProps<I extends object = object, C extends ElementType = ElementType> = {
	/**
	 * Your component that is used to render a single list item.
	 */
	component: C;
	/**
	 * An array of actual data mapped to all children.
	 */
	items: readonly I[];
	/**
	 * The estimated height of a single rendered item.
	 *
	 * In a best-case scenario, the same as actual item height.
	 *
	 * Every item has its dimensions that are being used to calculate the height of a whole list.
	 * Thanks to that, the browser can allocate necessary space and display the scrollbars.
	 * It creates an illusion that all elements are present and visible at the same time.
	 *
	 * But how can we know the dimensions of an actual item before the initial render?
	 * Well, we don't. That's where `estimatedItemHeight` kicks in.
	 * We use a placeholder to compute all necessary values, then
	 * when the actual items are rendered, we measure them and repeats all calculations.
	 */
	estimatedItemHeight: number;
	/**
	 * A factory function that returns (extracts) an ID from the item.
	 *
	 * Every item in the list must be identified by its unique ID.
	 *
	 * Remember that this function will be called many times,
	 * so any fancy function may negatively affect your rendering performance.
	 */
	itemKey: (item: I) => TItemID;
	/**
	 * This value increases the overall viewport area.
	 * Defines how many pixels *beyond the horizon* should be overscaned.
	 *
	 * In other words, this is a value that allows you to render more elements than can be actually seen on the screen.
	 *
	 * Defaults to `20`.
	 */
	overscanPadding?: number;
	/**
	 * Custom CSS classname attached to a `VirtualList` root element.
	 */
	className?: string;
	/**
	 * Props passed to every rendered item.
	 */
	sharedProps?: TSharedProps<React.ComponentPropsWithoutRef<C>>;
	/**
	 * An advanced prop that can be used to overwrite the initial `VirtualList` state.
	 *
	 * Proceed with caution.
	 */
	initState?: Partial<TState<I>>;
	/**
	 * Disables the item measurements and sets `estimatedItemHeight` as an actual element height.
	 *
	 * Useful when your list consists of items with equal heights.
	 */
	disableMeasurment?: boolean;
	/**
	 * Function invoked at the scroll event.
	 *
	 * Keep this function as performant as possible.
	 */
	onScroll?: (windowEdges: TWindowEdges) => void;
};

type TState<I extends object = object> = {
	/** @ignore */
	memoizedItemsArray: readonly I[];
	heightCache: Map<TItemID, number>;
	heightCacheVersion: number;
	isInView: boolean;
	nailPoints: readonly number[];
	listHeight: number;
	firstIndex: number;
	lastIndex: number;
	pivotIndex: number;
};

class VirtualList<I extends object, C extends ElementType> extends Component<TProps<I, C>, TState<I>> {
	public static getDerivedStateFromProps(props: TProps, state: TState): Partial<TState> | null {
		if (props.items !== state.memoizedItemsArray) {
			const { items, estimatedItemHeight, itemKey } = props;
			const { heightCache } = state;
			const arrLastIndex = Math.max(0, items.length - 1); // HACK: `items` may be empty!
			const nailPoints = [0];
			const getHeight = (i: number) => heightCache.get(itemKey(items[i])) ?? estimatedItemHeight;

			for (let i = 0; i < arrLastIndex; i += 1) {
				const nailPoint = nailPoints[i];
				const height = getHeight(i);

				nailPoints.push(nailPoint + height);
			}

			const nailPoint = nailPoints[arrLastIndex];
			const height = !items[0] ? 0 : getHeight(arrLastIndex);
			const listHeight = nailPoint + height;

			return {
				memoizedItemsArray: items,
				nailPoints,
				listHeight,
				isInView: !items[0] ? false : state.isInView, // Is it necessary? Just in case...
				// Fix indexes when out of bounds:
				firstIndex: clampIntoArrRange(items, state.firstIndex),
				lastIndex: clampIntoArrRange(items, state.lastIndex),
				pivotIndex: clampIntoArrRange(items, state.pivotIndex),
			};
		}

		return null;
	}

	public state: TState<I> = (() => {
		const {
			items,
			itemKey,
			disableMeasurment,
			estimatedItemHeight,
			initState,
		} = this.props;

		return {
			memoizedItemsArray: items,
			heightCache: new Map(
				!disableMeasurment
					? undefined
					: items.map(item => [itemKey(item), estimatedItemHeight]),
			),
			heightCacheVersion: 0,
			isInView: true,
			nailPoints: items.map((_data, index) => index * estimatedItemHeight),
			listHeight: items.length * estimatedItemHeight,
			firstIndex: 0,
			lastIndex: 0,
			pivotIndex: 0,
			...initState,
		};
	})();

	private readonly listElRef = createRef<HTMLDivElement>();

	private lastWindowEdges: TWindowEdges | null = null;

	public componentDidMount() {
		document.addEventListener('scroll', this.handleScroll);
		window.addEventListener('resize', this.handleScroll);
		this.handleScroll();
	}

	public shouldComponentUpdate(nextProps: TProps<I, C>, nextState: TState<I>) {
		if (this.props !== nextProps) {
			// `initState` is used only at the component init, so it shouldn't rerender the list
			const { initState: a, ...prevRest } = this.props;
			const { initState: b, ...nextRest } = nextProps;

			if (!shallowEqualObjects(prevRest, nextRest)) return true;
		}

		return !shallowEqualObjects(this.state, nextState);
	}

	public componentDidUpdate(prevProps: TProps<I, C>) {
		if (prevProps !== this.props) {
			this.handleScroll();
		}
	}

	public componentWillUnmount() {
		document.removeEventListener('scroll', this.handleScroll);
		window.removeEventListener('resize', this.handleScroll);
	}

	private readonly handleScroll = () => {
		if (!this.props.items[0]) return;

		const { state } = this;
		const edges = this.getWindowEdges();
		const { isInView, topEdge } = edges;

		this.props.onScroll?.(edges);

		if (isInView) {
			const next = this.getVisibleItems();

			// Bailout if a state doesn't require an update to prevent empty render commit.
			// Every scroll event would be shown inside the React DevTools profiler, which could be confusing.
			if (
				next.firstIndex !== state.firstIndex
				|| next.lastIndex !== state.lastIndex
				|| next.pivotIndex !== state.pivotIndex
				|| next.isInView !== state.isInView
			) this.setState(next);
		} else {
			let pivotIndex = 0;
			if (topEdge !== 0) pivotIndex = this.props.items.length - 1;

			// Bailout if a state doesn't require an update to prevent empty render commit.
			// Every scroll event would be shown inside the React DevTools profiler, which could be confusing.
			if (isInView !== state.isInView || pivotIndex !== state.pivotIndex) {
				this.setState({ isInView, pivotIndex });
			}
		}
	};

	private readonly getWindowEdges = (): TWindowEdges => {
		if (!this.listElRef.current) throw new Error('Bug! No list ref');
		const { offsetTop, scrollHeight } = this.listElRef.current;
		const { overscanPadding = 20 } = this.props;

		const rawTopEdge = (document.documentElement.scrollTop - offsetTop);
		const rawBottomEdge = (rawTopEdge + window.innerHeight);

		const overscanedTopEdge = rawTopEdge - overscanPadding;
		const overscanedBottomEdge = rawBottomEdge + overscanPadding;

		const bottomEdge = overscanedBottomEdge > 0 ? Math.min(scrollHeight, overscanedBottomEdge) : 0;
		const topEdge = overscanedTopEdge > 0 ? Math.min(overscanedTopEdge, bottomEdge) : 0;

		const scrollDiff = rawTopEdge - (this.lastWindowEdges?.rawTopEdge ?? rawTopEdge);


		const edges: TWindowEdges = {
			topEdge,
			bottomEdge,
			rawTopEdge,
			rawBottomEdge,
			listScrollHeight: scrollHeight,
			scrollDiff,
			isInView: bottomEdge !== topEdge,
		};

		this.lastWindowEdges = edges;
		return edges;
	};

	private readonly getVisibleItems = (nailPoints?: number[]) => {
		const { items } = this.props;
		const { state } = this;
		const { heightCache, pivotIndex: oldPivot } = state;

		let firstIndex: null | number = null;
		let lastIndex: null | number = null;
		let pivotIndex: null | number = null;

		// returns `true` when a for loop should break
		const scanIndex = (i: number) => {
			// `firstIndex` and `lastIndex` have always the same type at given time (null or number)
			if (!this.isItemVisible(i, nailPoints)) return firstIndex !== null;

			if (firstIndex !== null && lastIndex !== null) {
				if (i < firstIndex) firstIndex = i;
				if (i > lastIndex) lastIndex = i;
			} else {
				firstIndex = i;
				lastIndex = i;
			}
			if (pivotIndex === null && heightCache.has(this.getIndexKey(i))) pivotIndex = i;
		};

		for (let i = oldPivot; i >= 0; i -= 1) {
			if (scanIndex(i)) break;
		}
		for (let i = oldPivot + 1; i < items.length; i += 1) {
			if (scanIndex(i)) break;
		}

		const isInView = firstIndex !== null && lastIndex !== null;
		firstIndex ??= state.firstIndex;
		lastIndex ??= state.lastIndex;
		pivotIndex ??= Math.min(Math.max(firstIndex, state.pivotIndex), lastIndex);

		return {
			isInView,
			firstIndex,
			lastIndex,
			pivotIndex,
		};
	};

	private readonly handleMeasure = (entry: TEntry<I>) => {
		this.setState((state, { items }) => {
			if (state.heightCache.get(entry.id) === entry.height) return null;

			const prevPivotHeight = this.getIndexHeight(state.pivotIndex);

			// To update the height of an item, we are *mutating* the `heightCache` map.
			// Unluckily, React will not detect our direct change.
			// To let him know about the change, we are just bumping a dummy `heightCacheVersion` state.
			// We could create a new map, but bumping is more performant - O(1) vs. O(n).
			state.heightCache.set(entry.id, entry.height);
			const heightCacheVersion = state.heightCacheVersion + 1;

			const arrLastIndex = items.length - 1;
			const nailPoints = state.nailPoints.slice(0, entry.index + 1);

			for (let i = entry.index; i < arrLastIndex; i += 1) {
				const nailPoint = nailPoints[i];
				const height = this.getIndexHeight(i);

				nailPoints.push(nailPoint + height);
			}

			const listHeight = nailPoints[arrLastIndex] + this.getIndexHeight(arrLastIndex);

			// If the list shrinks, offset the difference to prevent the content from scrolling up.
			if (listHeight < state.listHeight) {
				const prevItemEdge = state.nailPoints[state.pivotIndex] + prevPivotHeight;
				const nextItemEdge = nailPoints[state.pivotIndex] + this.getIndexHeight(state.pivotIndex);

				document.documentElement.scrollTop -= prevItemEdge - nextItemEdge;
				this.getWindowEdges();
			}

			return {
				...state,
				heightCacheVersion,
				listHeight,
				nailPoints,
				...this.getVisibleItems(nailPoints),
			};
		});
	};

	private readonly getIndexHeight = (index: number) => {
		const key = this.getIndexKey(index);
		return this.state.heightCache.get(key) ?? this.props.estimatedItemHeight;
	};

	private readonly getIndexKey = (index: number) => {
		const itemData = this.props.items[index];
		return this.props.itemKey(itemData);
	};

	private readonly isItemVisible = (index: number, nailPoints = this.state.nailPoints) => {
		const { isInView, topEdge = 0, bottomEdge = 0 } = this.lastWindowEdges ?? {};
		if (!isInView) return false;

		const nailPoint = nailPoints[index];
		const height = this.getIndexHeight(index);

		return (topEdge <= nailPoint + height) && (nailPoint <= bottomEdge);
	};

	public render() {
		const {
			component,
			items,
			className,
			sharedProps,
			disableMeasurment,
		} = this.props;
		const {
			heightCache,
			isInView,
			firstIndex,
			lastIndex,
			nailPoints,
			listHeight,
		} = this.state;

		return (
			<div
				ref={this.listElRef}
				className={className}
				style={{
					position: 'relative',
					contain: 'strict',
					width: '100%',
					height: listHeight,
				}}
			>
				{isInView && items.slice(firstIndex, lastIndex + 1).map((itemData, i) => {
					const index = firstIndex + i;
					const itemID = this.getIndexKey(index);

					return (
						<VirtualListItem
							key={itemID}
							itemID={itemID}
							itemIndex={index}
							component={component}
							itemData={itemData}
							itWasMeasured={heightCache.has(itemID)}
							nailPoint={nailPoints[index]}
							sharedProps={sharedProps}
							onMeasure={this.handleMeasure}
							isMeasurmentDisabled={disableMeasurment}
						/>
					);
				})}
			</div>
		);
	}
}

export default VirtualList;
