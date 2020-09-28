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
	nailPoints: readonly number[];
	listHeight: number;
	firstIndex: number;
	lastIndex: number;
	pivotIndex: number;
};

class VirtualList<I extends object, C extends React.ElementType> extends React.PureComponent<TProps<I, C>, TState> {
	public state: TState = {
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

	public getSnapshotBeforeUpdate(prevProps: TProps<I, C>, prevState: TState) {
		const { state } = this;

		if (prevState.listHeight !== state.listHeight) {
			const { items } = prevProps;
			const { nailPoints, pivotIndex } = prevState;
			const { rawTopEdge = 0 } = this.lastWindowEdges || {};

			return {
				index: pivotIndex,
				offset: rawTopEdge - nailPoints[pivotIndex],
				height: this.getItemHeight(items[pivotIndex]),
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
		const edges = this.getWindowEdges();
		const { isInView } = edges;

		if (isInView) {
			this.getVisibleItems(edges);
		} else {
			let dummyIndex = 0;
			if (edges.topEdge !== 0) dummyIndex = this.props.items.length - 1;

			if (this.state.pivotIndex === dummyIndex) return;
			this.setState({
				firstIndex: dummyIndex,
				lastIndex: dummyIndex,
				pivotIndex: dummyIndex,
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
		const currentHeight = this.getItemHeight(this.props.items[index]);

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

	private getVisibleItems = (edges: TEdges) => {
		this.setState((state, { items }) => {
			const indexOfLastArrItem = items.length - 1;
			const isMovingBottom = edges.scrollDiff >= 0;

			let firstIndex: null | number = null;
			let lastIndex: null | number = null;

			{
				const { pivotIndex } = state;
				const lastVisible = isMovingBottom ? state.firstIndex : state.lastIndex;
				let isMainSideDone = false;
				let direction = isMovingBottom ? 1 : -1;

				for (let i = pivotIndex; true; i += direction) { // eslint-disable-line no-constant-condition
					if (i < 0 || i > indexOfLastArrItem) {
						if (isMainSideDone) break;

						isMainSideDone = true;
						direction *= -1;
						i = pivotIndex;
					}

					const nailPoint = state.nailPoints[i];
					const isVisible = this.getItemVisibility(items[i], nailPoint, edges);

					if (isVisible) {
						if (firstIndex === null || i < firstIndex) firstIndex = i;
						if (lastIndex === null || i > lastIndex) lastIndex = i;
					} else if (firstIndex !== null) {
						if (!isMainSideDone) {
							isMainSideDone = true;
							direction *= -1;
							i = pivotIndex;
						} else if ((isMovingBottom && i <= lastVisible) || (!isMovingBottom && i >= lastVisible)) {
							break;
						}
					}
				}

				if (firstIndex === null || lastIndex === null) throw new Error('Bug! No visible items');
			}


			let pivotIndex = isMovingBottom ? state.lastIndex : state.firstIndex;
			{
				const direction = isMovingBottom ? -1 : 1;

				while (
					!this.heightCache.has(items[pivotIndex])
					&& (firstIndex <= pivotIndex && pivotIndex <= lastIndex)
					&& (0 < pivotIndex && pivotIndex < indexOfLastArrItem)
				) {
					pivotIndex += direction;
				}
			}

			return {
				firstIndex,
				lastIndex,
				pivotIndex,
			};
		});
	};

	private handleMeasure = (item: { index: number, height: number, data: I }) => {
		this.setState((state, { items }) => {
			if (this.getItemHeight(item.data) === item.height) return null;

			const newNailPoints = [...state.nailPoints];
			this.heightCache.set(item.data, item.height);

			for (let i = item.index; i < newNailPoints.length - 1; i += 1) {
				const nailPoint = newNailPoints[i];
				const height = this.getItemHeight(items[i]);

				newNailPoints[i + 1] = nailPoint + height;
			}

			const lastIndex = newNailPoints.length - 1;
			const nailPoint = newNailPoints[lastIndex];
			const height = this.getItemHeight(items[lastIndex]);
			const listHeight = nailPoint + height;

			let newFirstIndex = state.firstIndex;
			while (newFirstIndex > 0) {
				const index = newFirstIndex - 1;
				if (!this.getItemVisibility(items[index], newNailPoints[index])) break;
				newFirstIndex = index;
			}

			let newLastIndex = state.lastIndex;
			while (newLastIndex < newNailPoints.length - 1) {
				const index = newLastIndex + 1;
				if (!this.getItemVisibility(items[index], newNailPoints[index])) break;
				newLastIndex = index;
			}

			return {
				listHeight,
				nailPoints: newNailPoints,
				firstIndex: newFirstIndex,
				lastIndex: newLastIndex,
			};
		});
	};

	private getItemHeight = (itemData: I) => {
		return this.heightCache.get(itemData) ?? this.props.estimatedItemHeight;
	};

	private getItemVisibility = (item: I, nailPoint: number, edges = this.lastWindowEdges) => {
		if (!edges) return false;
		const height = this.getItemHeight(item);

		const isVisible = (edges.topEdge <= nailPoint + height) && (nailPoint <= edges.bottomEdge);
		return isVisible;
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
					// height: listHeight,
					paddingBottom: listHeight,
				}}
			>
				{items.slice(firstIndex, lastIndex + 1).map((itemData, i) => {
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
