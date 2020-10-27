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

export type TProps<I = {}, C extends ElementType = ElementType> = {
	component: C;
	items: readonly I[];
	estimatedItemHeight: number;
	itemKey: (item: I) => TItemID;
	overscanPadding?: number;
	className?: string;
	sharedProps?: TSharedProps<React.ComponentPropsWithoutRef<C>>;
	initState?: Partial<TState<I>>;
};

type TState<I = {}> = {
	/** @ignore */
	memoizedItemsArray: readonly I[];
	heightCache: Map<I, number>;
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
			const arrLastIndex = items.length - 1;
			const nailPoints = [0];

			for (let i = 0; i < arrLastIndex; i += 1) {
				const nailPoint = nailPoints[i];
				const height = heightCache.get(items[i]) ?? estimatedItemHeight;

				nailPoints.push(nailPoint + height);
			}

			const nailPoint = nailPoints[arrLastIndex];
			const height = heightCache.get(items[arrLastIndex]) ?? estimatedItemHeight;
			const listHeight = nailPoint + height;

			return {
				memoizedItemsArray: items,
				nailPoints,
				listHeight,
			};
		}
		return null;
	}

	public state: TState<I> = {
		memoizedItemsArray: this.props.items,
		heightCache: new Map<I, number>(),
		isInView: true,
		nailPoints: this.props.items.map((_data, index) => index * this.props.estimatedItemHeight),
		listHeight: this.props.items.length * this.props.estimatedItemHeight,
		firstIndex: 0,
		lastIndex: 0,
		pivotIndex: 0,
		...this.props.initState,
	};

	private listElRef = createRef<HTMLDivElement>();

	private keyCache = new Map<I, TItemID>();

	private lastWindowEdges: TEdges | null = null;

	public componentDidMount() {
		document.addEventListener('scroll', this.handleScroll);
		window.addEventListener('resize', this.handleScroll);
		this.handleScroll();
	}

	public getSnapshotBeforeUpdate(_prevProps: TProps<I, C>, prevState: TState<I>) {
		const { state } = this;

		if (prevState.listHeight !== state.listHeight) {
			const { nailPoints, pivotIndex } = prevState;
			const { rawTopEdge = 0 } = this.lastWindowEdges || {};

			return {
				index: pivotIndex,
				offset: rawTopEdge - nailPoints[pivotIndex],
				height: this.getItemHeight(pivotIndex),
			} as TAnchor;
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

	private handleScroll = () => {
		const { isInView, topEdge } = this.getWindowEdges();

		if (isInView) {
			this.getVisibleItems();
		} else {
			let dummyPivot = 0;
			if (topEdge !== 0) dummyPivot = this.props.items.length - 1;

			// Bailout if a state doesn't require an update to prevent empty render commit.
			// Every scroll event would be shown inside the React DevTools profiler, which could be confusing.
			if (this.state.pivotIndex === dummyPivot && this.state.isInView === false) return;

			this.setState({
				isInView: false,
				pivotIndex: dummyPivot,
			});
		}
	};

	private handleListHeightChange = (anchor: TAnchor) => {
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

	private getWindowEdges = (): TEdges => {
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

		const scrollDiff = rawTopEdge - (this.lastWindowEdges?.rawTopEdge || rawTopEdge);

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

	private getVisibleItems = () => {
		this.setState((state, { items }) => {
			const indexOfLastArrItem = items.length - 1;
			const initIndex = state.lastIndex;

			let isMainSideDone = false;
			let isVisible = false;
			let direction: 1 | -1 = 1;

			let firstIndex: null | number = null;
			let lastIndex: null | number = null;
			let pivotIndex: null | number = null;

			for (let i = initIndex; true; i += direction) { // eslint-disable-line no-constant-condition
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

			if (firstIndex === null || lastIndex === null) {
				throw new Error('Bug! No visible items');
			}

			return {
				isInView: true,
				firstIndex,
				lastIndex,
				pivotIndex: pivotIndex ?? state.pivotIndex,
			};
		});
	};

	private handleMeasure = (entry: TEntry<I>) => {
		this.setState((state, { items }) => {
			if (state.heightCache.get(entry.data) === entry.height) return null;

			const heightCache = new Map(state.heightCache);
			heightCache.set(entry.data, entry.height);

			const arrLastIndex = items.length - 1;
			const newNailPoints = state.nailPoints.slice(0, entry.index + 1);

			for (let i = entry.index; i < arrLastIndex; i += 1) {
				const nailPoint = newNailPoints[i];
				const height = this.getItemHeight(i, heightCache);

				newNailPoints.push(nailPoint + height);
			}

			const nailPoint = newNailPoints[arrLastIndex];
			const height = this.getItemHeight(arrLastIndex, heightCache);
			const listHeight = nailPoint + height;

			let newFirstIndex = state.firstIndex;
			while (newFirstIndex > 0) {
				const index = newFirstIndex - 1;
				if (!this.isItemVisible(index, newNailPoints)) break;
				newFirstIndex = index;
			}

			let newLastIndex = state.lastIndex;
			while (newLastIndex < arrLastIndex) {
				const index = newLastIndex + 1;
				if (!this.isItemVisible(index, newNailPoints)) break;
				newLastIndex = index;
			}

			return {
				...state,
				heightCache,
				listHeight,
				nailPoints: newNailPoints,
				firstIndex: newFirstIndex,
				lastIndex: newLastIndex,
			};
		});
	};

	private getItemHeight = (index: number, heightCache = this.state.heightCache) => {
		const item = this.props.items[index];
		return heightCache.get(item) ?? this.props.estimatedItemHeight;
	};

	private getItemKey = (itemData: I) => {
		const hasKey = this.keyCache.get(itemData);
		if (hasKey) return hasKey;

		const newKey = this.props.itemKey(itemData);
		this.keyCache.set(itemData, newKey);

		return newKey;
	};

	private isItemVisible = (index: number, nailPoints = this.state.nailPoints) => {
		const { topEdge = 0, bottomEdge = 0 } = this.lastWindowEdges || {};
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
							onMeasure={this.handleMeasure}
							sharedProps={sharedProps}
						/>
					);
				})}
			</div>
		);
	}
}

export default VirtualList;
