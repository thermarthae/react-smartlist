import React from 'react';

import VirtualListItem from './VirtualListItem';

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

//

type TProps<Item, Component extends React.ElementType = React.ElementType> = {
	component: React.ElementType;
	items: readonly Item[];
	estimatedItemHeight: number;
	itemKey: (item: Item) => TItemID;
	overscanPadding?: number;
	className?: string;
	sharedProps?: Omit<React.ComponentPropsWithoutRef<Component>, 'data'>;
};

type TState = {
	HACK_itemHeightChange: number;
	isInView: boolean;
	nailPoints: readonly number[];
	listHeight: number;
	firstIndex: number;
	lastIndex: number;
	pivotIndex: number;
};

class VirtualList<I extends object, C extends React.ElementType> extends React.PureComponent<TProps<I, C>, TState> {
	public state: TState = {
		HACK_itemHeightChange: 0,
		isInView: true,
		nailPoints: this.props.items.map((_data, index) => index * this.props.estimatedItemHeight),
		listHeight: this.props.items.length * this.props.estimatedItemHeight,
		firstIndex: 0,
		lastIndex: 0,
		pivotIndex: 0,
	};

	private listElRef = React.createRef<HTMLDivElement>();

	private heightCache = new Map<I, number>();

	private lastWindowEdges: TEdges | null = null;

	public componentDidMount() {
		document.addEventListener('scroll', this.handleScroll);
		window.addEventListener('resize', this.handleScroll);
		this.handleScroll();
	}

	public getSnapshotBeforeUpdate(_prevProps: TProps<I, C>, prevState: TState) {
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

	public componentDidUpdate(prevProps: TProps<I, C>, _prevState: TState, snapshot?: TAnchor) {
		const { props } = this;
		if (prevProps.items !== props.items) {
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
			const isMovingBottom = this.lastWindowEdges?.scrollDiff || 1 >= 0;
			const initIndex = isMovingBottom ? state.lastIndex : state.firstIndex;

			let isMainSideDone = false;
			let direction = isMovingBottom ? 1 : -1;

			let newFirstIndex: null | number = null;
			let newLastIndex: null | number = null;
			let newPivotIndex: null | number = null;

			for (let i = initIndex; true; i += direction) { // eslint-disable-line no-constant-condition
				if (i < 0 || indexOfLastArrItem < i) {
					if (isMainSideDone) break;

					isMainSideDone = true;
					direction *= -1;
					i = initIndex;
				}

				if (this.isItemVisible(i)) {
					if (newFirstIndex === null || i < newFirstIndex) newFirstIndex = i;
					if (newLastIndex === null || i > newLastIndex) newLastIndex = i;

					if (!newPivotIndex && this.heightCache.has(items[i])) {
						newPivotIndex = i;
					}
				} else if (newFirstIndex !== null) {
					if (isMainSideDone) break;

					isMainSideDone = true;
					direction *= -1;
					i = initIndex;
				}
			}

			if (newFirstIndex === null || newLastIndex === null) {
				throw new Error('Bug! No visible items');
			}

			return {
				isInView: true,
				firstIndex: newFirstIndex,
				lastIndex: newLastIndex,
				pivotIndex: newPivotIndex ?? state.pivotIndex,
			};
		});
	};

	private handleMeasure = (item: { index: number, height: number, data: I; }) => {
		this.setState((state, { estimatedItemHeight, items }) => {
			if (this.heightCache.get(item.data) === item.height) return null;
			this.heightCache.set(item.data, item.height);

			if (item.height === estimatedItemHeight) {
				return {
					...state,
					HACK_itemHeightChange: state.HACK_itemHeightChange + 1,
				};
			}

			const arrLastIndex = items.length - 1;
			const newNailPoints = state.nailPoints.slice(0, item.index + 1);

			for (let i = item.index; i < arrLastIndex; i += 1) {
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

			let newLastIndex = state.lastIndex;
			while (newLastIndex < arrLastIndex) {
				const index = newLastIndex + 1;
				if (!this.isItemVisible(index, newNailPoints)) break;
				newLastIndex = index;
			}

			return {
				...state,
				listHeight,
				nailPoints: newNailPoints,
				firstIndex: newFirstIndex,
				lastIndex: newLastIndex,
			};
		});
	};

	private getItemHeight = (index: number) => {
		const item = this.props.items[index];
		return this.heightCache.get(item) ?? this.props.estimatedItemHeight;
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
			itemKey,
			className,
			sharedProps,
		} = this.props;
		const {
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
					height: listHeight,
				}}
			>
				{isInView && items.slice(firstIndex, lastIndex + 1).map((itemData, i) => {
					const itemID = itemKey(itemData);
					const index = firstIndex + i;
					return (
						<VirtualListItem
							key={itemID}
							itemIndex={index}
							component={component}
							itemData={itemData}
							itWasMeasured={this.heightCache.has(itemData)}
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
