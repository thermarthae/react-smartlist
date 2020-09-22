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

	private anchorItem: {
		index: number;
		offset: number;
		height: number;
	} | null = null;

	public componentDidMount() {
		document.addEventListener('scroll', this.handleScroll);
		window.addEventListener('resize', this.handleResize);
		this.handleScroll();
	}

	public componentDidUpdate(prevProps: TProps<I, C>, prevState: TState) {
		const { props, state } = this;
		if (prevProps.items !== props.items) {
			this.handleScroll();
		}

		if (prevState.listHeight !== state.listHeight) {
			this.handleListHeightChange();
		}
	}

	public componentWillUnmount() {
		document.removeEventListener('scroll', this.handleScroll);
		window.removeEventListener('resize', this.handleResize);
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

	private handleResize = () => {
		this.heightCache.clear();
		this.handleScroll();
	};

	private handleListHeightChange = () => {
		const anchor = this.anchorItem;
		const listEl = this.listElRef.current;
		if (!anchor || !listEl) return;

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

	private getVisibleItems = ({ scrollDiff, topEdge, bottomEdge }: TEdges) => {
		this.setState((state, { items }) => {
			const { pivotIndex } = state;
			const indexOfLastArrItem = items.length - 1;
			const isMovingBottom = scrollDiff >= 0;

			let firstIndex: null | number = null;
			let lastIndex: null | number = null;
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

				const item = items[i];
				const nailPoint = state.nailPoints[i];
				const height = this.getItemHeight(item);
				const isVisible = (topEdge <= nailPoint + height) && (nailPoint <= bottomEdge);

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

			this.anchorItem = {
				index: firstIndex,
				offset: topEdge - state.nailPoints[firstIndex],
				height: this.getItemHeight(items[firstIndex]),
			};

			return {
				firstIndex,
				lastIndex,
				pivotIndex: firstIndex + Math.floor((lastIndex - firstIndex) / 2),
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

			return {
				listHeight,
				nailPoints: newNailPoints,
			};
		});
	};

	private getItemHeight = (itemData: I) => {
		return this.heightCache.get(itemData) ?? this.props.estimatedItemHeight;
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
