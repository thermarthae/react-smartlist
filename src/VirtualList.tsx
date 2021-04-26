import React, {
	ElementType,
	PureComponent,
	createRef,
} from 'react';

import VirtualListItem, { TSharedProps } from './VirtualListItem';

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

class VirtualList<I, C extends ElementType> extends PureComponent<TProps<I, C>, TState<I>> {
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

		const { isInView, topEdge } = this.getWindowEdges();

		if (isInView) {
			this.getVisibleItems();
		} else {
			let dummyPivot = 0;
			if (topEdge !== 0) dummyPivot = this.props.items.length - 1;

			// Bailout if a state doesn't require an update to prevent empty render commit.
			// Every scroll event would be shown inside the React DevTools profiler, which could be confusing.
			if (this.state.pivotIndex === dummyPivot && !this.state.isInView) return;

			this.setState({
				isInView: false,
				pivotIndex: dummyPivot,
			});
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

	private readonly getVisibleItems = () => {
		this.setState((state, { items }) => {
			const indexOfLastArrItem = items.length - 1;
			const initIndex = state.lastIndex;

			let isMainSideDone = false;
			let isVisible = false;
			let direction: 1 | -1 = 1;

			let firstIndex: null | number = null;
			let lastIndex: null | number = null;
			let pivotIndex: null | number = null;

			// eslint-disable-next-line no-constant-condition
			for (let i = initIndex; true; i += direction) {
				if (i < 0 || indexOfLastArrItem < i || (!isVisible && firstIndex !== null)) {
					if (isMainSideDone) break;

					isMainSideDone = true;
					direction *= -1;
					i = initIndex;
				}

				isVisible = this.isItemVisible(i);
				if (isVisible) {
					if (firstIndex === null || i < firstIndex) firstIndex = i;
					if (lastIndex === null || i > lastIndex) lastIndex = i;

					if (!pivotIndex && state.heightCache.has(items[i])) {
						pivotIndex = i;
					}
				}
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
		});
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
			const newNailPoints = state.nailPoints.slice(0, entry.index + 1);

			for (let i = entry.index; i < arrLastIndex; i += 1) {
				const nailPoint = newNailPoints[i];
				const height = this.getItemHeight(i);

				newNailPoints.push(nailPoint + height);
			}

			const nailPoint = newNailPoints[arrLastIndex];
			const height = this.getItemHeight(arrLastIndex);
			const listHeight = nailPoint + height;

			let newFirstIndex = state.firstIndex;
			while (newFirstIndex > 0) {
				const index = newFirstIndex - 1;
				if (!this.isItemVisible(index, newNailPoints)) break;
				newFirstIndex = index;
			}
			if (!this.isItemVisible(newFirstIndex, newNailPoints)) {
				for (let index = newFirstIndex + 1; index < arrLastIndex; index += 1) {
					if (this.isItemVisible(index, newNailPoints)) {
						newFirstIndex = index;
						break;
					}
				}
			}

			let newLastIndex = state.lastIndex;
			while (newLastIndex < arrLastIndex) {
				const index = newLastIndex + 1;
				if (!this.isItemVisible(index, newNailPoints)) break;
				newLastIndex = index;
			}
			if (!this.isItemVisible(newLastIndex, newNailPoints)) {
				for (let index = newLastIndex - 1; index > 0; index -= 1) {
					if (this.isItemVisible(index, newNailPoints)) {
						newLastIndex = index;
						break;
					}
				}
			}

			return {
				...state,
				heightCacheVersion,
				listHeight,
				nailPoints: newNailPoints,
				firstIndex: newFirstIndex,
				lastIndex: newLastIndex,
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
