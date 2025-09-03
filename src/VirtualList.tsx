import {
	Component,
	createRef,
	ElementType,
} from 'react';
import { shallowEqualObjects } from 'shallow-equal';

import VirtualListItem, { TSharedProps } from './VirtualListItem.tsx';

export type TID = string | number;
export type TData = {
	id: TID;
	[key: PropertyKey]: unknown;
};

export type TWindowEdges = {
	top: number;
	bottom: number;
	rawTop: number;
	rawBottom: number;
	listHeight: number;
	isInView: boolean;
};

export type TProps<D extends TData = TData, C extends ElementType = ElementType> = {
	/**
	 * Your component that is used to render a single list item.
	 */
	component: C;
	/**
	 * An array of actual data mapped to all children.
	 */
	items: readonly D[];
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
	initState?: Partial<TState<D>>;
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
	/**
	 * Custom CSS styles attached to a `VirtualList` root element.
	 */
	style?: React.CSSProperties | undefined;
};

type TState<D extends TData = TData> = {
	/** @ignore */
	memoizedItemsArray: readonly D[];
	heightCache: Map<TID, number>;
	heightCacheVersion: number;
	isInView: boolean;
	nailPoints: readonly number[];
	listHeight: number;
	firstIndex: number;
	lastIndex: number;
};

class VirtualList<D extends TData, C extends ElementType> extends Component<TProps<D, C>, TState<D>> {
	public static getDerivedStateFromProps(props: TProps, state: TState): Partial<TState> | null {
		if (props.items !== state.memoizedItemsArray) {
			const { items, estimatedItemHeight } = props;
			const { heightCache } = state;
			const arrLastIndex = Math.max(0, items.length - 1); // HACK: `items` may be empty!
			const nailPoints = [0];
			const getHeight = (i: number) => heightCache.get(items[i].id) ?? estimatedItemHeight;

			for (let i = 0; i < arrLastIndex; i += 1) {
				const nailPoint = nailPoints[i];
				const height = getHeight(i);

				nailPoints.push(nailPoint + height);
			}

			const nailPoint = nailPoints[arrLastIndex];
			const height = !items[0] ? 0 : getHeight(arrLastIndex);
			const listHeight = nailPoint + height;

			const clampIntoArrRange = (value: number) => Math.min(Math.max(0, value), items.length - 1);

			return {
				memoizedItemsArray: items,
				nailPoints,
				listHeight,
				isInView: !items[0] ? false : state.isInView, // Is it necessary? Just in case...
				// Fix indexes when out of bounds:
				firstIndex: clampIntoArrRange(state.firstIndex),
				lastIndex: clampIntoArrRange(state.lastIndex),
			};
		}

		return null;
	}

	public state: TState<D> = (() => {
		const {
			items,
			disableMeasurment,
			estimatedItemHeight,
			initState,
		} = this.props;

		return {
			memoizedItemsArray: items,
			heightCache: new Map(
				!disableMeasurment
					? undefined
					: items.map(item => [item.id, estimatedItemHeight]),
			),
			heightCacheVersion: 0,
			isInView: true,
			nailPoints: items.map((_data, index) => index * estimatedItemHeight),
			listHeight: items.length * estimatedItemHeight,
			firstIndex: 0,
			lastIndex: 0,
			...initState,
		};
	})();

	private readonly listElRef = createRef<HTMLDivElement>();

	public componentDidMount() {
		document.addEventListener('scroll', this.handleScroll);
		window.addEventListener('resize', this.handleScroll);
		this.handleScroll();
	}

	public shouldComponentUpdate(nextProps: TProps<D, C>, nextState: TState<D>) {
		if (this.props !== nextProps) {
			// `initState` is used only at the component init, so it shouldn't rerender the list
			const { initState: a, sharedProps: SP, ...prevRest } = this.props;
			const { initState: b, sharedProps: nextSP, ...nextRest } = nextProps;

			if (!shallowEqualObjects(SP, nextSP) || !shallowEqualObjects(prevRest, nextRest)) return true;
		}

		return !shallowEqualObjects(this.state, nextState);
	}

	public componentDidUpdate(prevProps: TProps<D, C>) {
		if (prevProps !== this.props) {
			this.handleScroll();
		}
	}

	public componentWillUnmount() {
		document.removeEventListener('scroll', this.handleScroll);
		window.removeEventListener('resize', this.handleScroll);
	}

	private readonly getPivot = (s = this.state) => {
		const pivot = s.firstIndex;

		for (let i = s.firstIndex + 1; i <= s.lastIndex; i += 1) {
			const id = this.props.items[i].id;
			if (s.heightCache.has(id)) return i;
		}

		return pivot;
	};

	private readonly handleScroll = () => {
		if (!this.props.items[0]) return;

		const edges = this.getWindowEdges();
		this.props.onScroll?.(edges);

		const prev = this.state;
		const next = {
			firstIndex: prev.firstIndex,
			lastIndex: prev.lastIndex,
			...this.getVisibleIndexes(prev.nailPoints, edges),
		};

		// Bailout if a state doesn't require an update to prevent empty render commit.
		// Every scroll event would be shown inside the React DevTools profiler, which could be confusing.
		if (
			next.firstIndex !== prev.firstIndex
			|| next.lastIndex !== prev.lastIndex
			|| next.isInView !== prev.isInView
		) this.setState(next);
	};

	private readonly getWindowEdges = (nextListHeight?: number): TWindowEdges => {
		const offsetTop = this.listElRef?.current?.offsetTop ?? 0;
		const { overscanPadding = 20 } = this.props;

		const rawTop = document.documentElement.scrollTop - offsetTop;
		const rawBottom = rawTop + window.innerHeight;
		const listHeight = nextListHeight ?? this.state.listHeight;

		const bottom = Math.max(0, Math.min(listHeight, rawBottom + overscanPadding));
		const top = Math.max(0, Math.min(bottom, rawTop - overscanPadding));

		return {
			isInView: bottom !== top,
			top,
			bottom,
			rawTop,
			rawBottom,
			listHeight,
		};
	};

	private readonly getVisibleIndexes = (nailPoints: readonly number[], edges = this.getWindowEdges()) => {
		const { isInView } = edges;
		if (!isInView) return { isInView };

		const { items } = this.props;

		let firstIndex = NaN;
		let lastIndex = NaN;

		// returns `true` when a for loop should break
		const scanIndex = (i: number) => {
			const nP = nailPoints[i];
			const height = this.getItemHeight(items[i]);
			const isStillNotFound = Number.isNaN(firstIndex);

			const isVisible = (edges.top <= (nP + height)) && (nP <= edges.bottom);
			if (!isVisible) return !isStillNotFound; // if not visible but found index in a scan before - break the loop

			if (isStillNotFound || i < firstIndex) firstIndex = i;
			if (isStillNotFound || i > lastIndex) lastIndex = i;

			return false; // `i` visible, check next one
		};

		const pivot = this.getPivot();
		for (let i = pivot; i >= 0; i -= 1) {
			if (scanIndex(i)) break;
		}
		for (let i = pivot + 1; i < items.length; i += 1) {
			if (scanIndex(i)) break;
		}

		return { isInView, firstIndex, lastIndex };
	};

	private readonly handleMeasure = (id: TID, entryIndex: number, entryHeight: number) => {
		this.setState((state, { items }) => {
			if (state.heightCache.get(id) === entryHeight) return null;

			const pivotIndex = this.getPivot();
			const pivot = items[pivotIndex];
			const prevPivotHeight = this.getItemHeight(pivot);

			// To update the height of an item, we are *mutating* the `heightCache` map.
			// Unluckily, React will not detect our direct change.
			// To let him know about the change, we are just bumping a dummy `heightCacheVersion` state.
			state.heightCache.set(id, entryHeight);
			const heightCacheVersion = state.heightCacheVersion + 1;

			const nailPoints = state.nailPoints.slice(0, entryIndex + 1);

			for (let i = entryIndex; i < items.length - 1; i += 1) {
				const nailPoint = nailPoints[i];
				const height = this.getItemHeight(items[i]);

				nailPoints.push(nailPoint + height);
			}

			const listHeight = nailPoints.at(-1)! + this.getItemHeight(items.at(-1)!);
			const changeAbovePivot = (entryIndex < pivotIndex || state.lastIndex <= pivotIndex);
			const listShrinks = listHeight < state.listHeight;

			if (changeAbovePivot || listShrinks) {
				const prevPivotEdge = state.nailPoints[pivotIndex] + prevPivotHeight;
				const nextPivotEdge = nailPoints[pivotIndex] + this.getItemHeight(pivot);

				// Offset the difference to prevent the content from jumping around.
				document.documentElement.scrollTop -= prevPivotEdge - nextPivotEdge;
			}

			return {
				...state,
				heightCacheVersion,
				listHeight,
				nailPoints,
				...this.getVisibleIndexes(nailPoints, this.getWindowEdges(listHeight)),
			};
		});
	};

	private readonly getItemHeight = (item: D) => {
		return this.state.heightCache.get(item.id) ?? this.props.estimatedItemHeight;
	};

	public render() {
		const p = this.props;
		const s = this.state;

		return (
			<div
				ref={this.listElRef}
				className={p.className}
				style={{
					position: 'relative',
					contain: 'strict',
					width: '100%',
					...p.style,
					height: s.listHeight,
				}}
			>
				{s.isInView && p.items.slice(s.firstIndex, s.lastIndex + 1).map((itemData, i) => {
					const index = s.firstIndex + i;
					const onMeasure = (height: number) => this.handleMeasure(itemData.id, index, height);
					onMeasure.key = `${itemData.id} ${index}`;

					return (
						<VirtualListItem
							key={itemData.id}
							itemIndex={index}
							component={p.component}
							itemData={itemData}
							isAlreadyMeasured={s.heightCache.has(itemData.id)}
							nailPoint={s.nailPoints[index]}
							sharedProps={p.sharedProps}
							onMeasure={onMeasure}
							isMeasurmentDisabled={p.disableMeasurment}
						/>
					);
				})}
			</div>
		);
	}
}

export default VirtualList;
