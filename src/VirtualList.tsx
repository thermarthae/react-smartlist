import React, {
	ElementType,
	Component,
	createRef,
} from 'react';

import VirtualListItem, { TSharedProps } from './VirtualListItem';
import shallowDiffers from './shallowDiffers';

type TItemID = string | number;

type TEdges = {
	bottomEdge: number;
	topEdge: number;
	rawTopEdge: number;
	scrollDiff: number;
	isInView: boolean;
};

type TAnchor = {
	index: number;
	offset: number;
	height: number;
};

export type TEntry<Item> = {
	index: number;
	height: number;
	data: Item;
};

//

export type TProps<I = unknown, C extends ElementType = ElementType> = {
	component: C;
	items: readonly I[];
	estimatedItemHeight: number;
	itemKey: (item: I) => TItemID;
	overscanPadding?: number;
	className?: string;
	sharedProps?: TSharedProps<React.ComponentPropsWithoutRef<C>>;
	initState?: Partial<TState<I>>;
};

type TState<I = unknown> = {
	/** @ignore */
	memoizedItemsArray: readonly I[];
	heightCache: Map<I, number>;
	heightCacheVersion: number;
	isInView: boolean;
	nailPoints: readonly number[];
	listHeight: number;
	firstIndex: number;
	lastIndex: number;
	pivotIndex: number;
};

class VirtualList<I, C extends ElementType> extends Component<TProps<I, C>, TState<I>> {
	public static getDerivedStateFromProps(props: TProps, state: TState): Partial<TState> | null {
		if (props.items !== state.memoizedItemsArray) {
			const { items, estimatedItemHeight } = props;
			const { heightCache } = state;
			const arrLastIndex = Math.max(0, items.length - 1); // HACK: `items` may be empty!
			const nailPoints = [0];

			for (let i = 0; i < arrLastIndex; i += 1) {
				const nailPoint = nailPoints[i];
				const height = heightCache.get(items[i]) ?? estimatedItemHeight;

				nailPoints.push(nailPoint + height);
			}

			const nailPoint = nailPoints[arrLastIndex];
			const height = !items[0] ? 0 : (heightCache.get(items[arrLastIndex]) ?? estimatedItemHeight);
			const listHeight = nailPoint + height;

			return {
				memoizedItemsArray: items,
				nailPoints,
				listHeight,
				isInView: !items[0] ? false : state.isInView, // Is it necessary? Just in case...
				// Fix indexes when out of bounds:
				firstIndex: Math.min(items.length, state.firstIndex),
				lastIndex: Math.min(items.length, state.lastIndex),
				pivotIndex: Math.min(items.length, state.pivotIndex),
			};
		}

		return null;
	}

	public state: TState<I> = {
		memoizedItemsArray: this.props.items,
		heightCache: new Map<I, number>(),
		heightCacheVersion: 0,
		isInView: true,
		nailPoints: this.props.items.map((_data, index) => index * this.props.estimatedItemHeight),
		listHeight: this.props.items.length * this.props.estimatedItemHeight,
		firstIndex: 0,
		lastIndex: 0,
		pivotIndex: 0,
		...this.props.initState,
	};

	private readonly listElRef = createRef<HTMLDivElement>();

	private readonly keyCache = new Map<I, TItemID>();

	private lastWindowEdges: TEdges | null = null;

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

			if (shallowDiffers(prevRest, nextRest)) return true;
		}

		return shallowDiffers(this.state, nextState);
	}

	public getSnapshotBeforeUpdate(_prevProps: TProps<I, C>, prevState: TState<I>): TAnchor | null {
		const { props, state } = this;

		if (props.items[0] && prevState.listHeight !== state.listHeight) {
			const { nailPoints, pivotIndex } = prevState;
			const { rawTopEdge = 0 } = this.lastWindowEdges ?? {};

			return {
				index: pivotIndex,
				offset: rawTopEdge - nailPoints[pivotIndex],
				height: this.getItemHeight(pivotIndex),
			};
		}

		return null;
	}

	public componentDidUpdate(prevProps: TProps<I, C>, _prevState: TState<I>, snapshot?: TAnchor) {
		if (prevProps !== this.props) {
			this.handleScroll();
		}

		if (snapshot) {
			this.handleListHeightChange(snapshot);
		}
	}

	public componentWillUnmount() {
		document.removeEventListener('scroll', this.handleScroll);
		window.removeEventListener('resize', this.handleScroll);
	}

	private readonly handleScroll = () => {
		if (!this.props.items[0]) return;

		const { state } = this;
		const { isInView, topEdge } = this.getWindowEdges();

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

	private readonly handleListHeightChange = (anchor: TAnchor) => {
		const listEl = this.listElRef.current;
		if (!listEl) return;

		const { nailPoints } = this.state;
		const {
			index,
			offset,
			height,
		} = anchor;
		const { offsetTop } = listEl;
		const nailPoint = nailPoints[index];
		const currentHeight = this.getItemHeight(index);

		const newScrollTop = offsetTop + nailPoint + ((offset - height) + currentHeight);
		if (newScrollTop <= offsetTop) return;

		document.documentElement.scrollTop = newScrollTop;
	};

	private readonly getWindowEdges = (): TEdges => {
		if (!this.listElRef.current) throw new Error('Bug! No list ref');
		const { offsetTop, scrollHeight } = this.listElRef.current;
		const {
			overscanPadding = 10,
		} = this.props;

		const rawTopEdge = (document.documentElement.scrollTop - offsetTop);
		const rawBottomEdge = (rawTopEdge + window.innerHeight);

		const overscanedTopEdge = rawTopEdge - overscanPadding;
		const overscanedBottomEdge = rawBottomEdge + overscanPadding;

		const bottomEdge = overscanedBottomEdge > 0 ? Math.min(scrollHeight, overscanedBottomEdge) : 0;
		const topEdge = overscanedTopEdge > 0 ? Math.min(overscanedTopEdge, bottomEdge) : 0;

		const scrollDiff = rawTopEdge - (this.lastWindowEdges?.rawTopEdge ?? rawTopEdge);

		const edges = {
			bottomEdge,
			topEdge,
			rawTopEdge,
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
			if (pivotIndex === null && heightCache.has(items[i])) pivotIndex = i;
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
		pivotIndex ??= state.pivotIndex;

		return {
			isInView,
			firstIndex,
			lastIndex,
			pivotIndex,
		};
	};

	private readonly handleMeasure = (entry: TEntry<I>) => {
		this.setState((state, { items }) => {
			if (state.heightCache.get(entry.data) === entry.height) return null;

			// To update the height of an item, we are *mutating* the `heightCache` map.
			// Unluckily, React will not detect our direct change.
			// To let him know about the change, we are just bumping a dummy `heightCacheVersion` state.
			// We could create a new map, but bumping is more performant - O(1) vs. O(n).
			state.heightCache.set(entry.data, entry.height);
			const heightCacheVersion = state.heightCacheVersion + 1;

			const arrLastIndex = items.length - 1;
			const nailPoints = state.nailPoints.slice(0, entry.index + 1);

			for (let i = entry.index; i < arrLastIndex; i += 1) {
				const nailPoint = nailPoints[i];
				const height = this.getItemHeight(i);

				nailPoints.push(nailPoint + height);
			}

			const listHeight = nailPoints[arrLastIndex] + this.getItemHeight(arrLastIndex);

			return {
				...state,
				heightCacheVersion,
				listHeight,
				nailPoints,
				...this.getVisibleItems(nailPoints),
			};
		});
	};

	private readonly getItemHeight = (index: number) => {
		const item = this.props.items[index];
		return this.state.heightCache.get(item) ?? this.props.estimatedItemHeight;
	};

	private readonly getItemKey = (itemData: I) => {
		const hasKey = this.keyCache.get(itemData);
		if (hasKey !== undefined) return hasKey;

		const newKey = this.props.itemKey(itemData);
		this.keyCache.set(itemData, newKey);

		return newKey;
	};

	private readonly isItemVisible = (index: number, nailPoints = this.state.nailPoints) => {
		const { topEdge = 0, bottomEdge = 0 } = this.lastWindowEdges ?? {};
		const nailPoint = nailPoints[index];
		const height = this.getItemHeight(index);

		return (topEdge <= nailPoint + height) && (nailPoint <= bottomEdge);
	};

	public render() {
		const {
			component,
			items,
			className,
			sharedProps,
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
					const itemID = this.getItemKey(itemData);
					const index = firstIndex + i;
					return (
						<VirtualListItem
							key={itemID}
							itemIndex={index}
							component={component}
							itemData={itemData}
							itWasMeasured={heightCache.has(itemData)}
							nailPoint={nailPoints[index]}
							sharedProps={sharedProps}
							onMeasure={this.handleMeasure}
						/>
					);
				})}
			</div>
		);
	}
}

export default VirtualList;
