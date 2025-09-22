import {
	memo,
	useCallback,
	useEffect,
	useReducer,
	useRef,
} from 'react';
import { shallowEqualObjects } from 'shallow-equal';

import VirtualListItem, { TItemProps, TItemSharedProps } from './VirtualListItem.tsx';

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

export type TProps<P extends TItemProps> = {
	/**
	 * Your component that is used to render a single list item.
	 */
	component: React.ComponentType<P>;
	/**
	 * An array of actual data mapped to all children.
	 */
	items: Array<P['data']>;
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
	sharedProps?: TItemSharedProps<P>;
	/**
	 * An advanced prop that can be used to overwrite the initial `VirtualList` state.
	 *
	 * Proceed with caution.
	 */
	initState?: Partial<TState>;
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

type TState = {
	items: TData[];
	estimatedItemHeight: number;
	overscanPadding: number;
	rootElRef: React.RefObject<HTMLDivElement | null>;
	heightCache: Record<TID, number>;
	isInView: boolean;
	nailPoints: number[];
	listHeight: number;
	firstIndex: number;
	lastIndex: number;
};

type TAction = (
	| { type: 'scroll' }
	| { type: 'init' }
	| { type: 'measure'; index: number; height: number }
	| {
		type: 'props-update';
		items: TData[];
		estimatedItemHeight: number;
		overscanPadding: number;
	}
);

const getWindowEdges = (listHeight: number, rootElOffsetTop = 0, overscanPadding: number): TWindowEdges => {
	const rawTop = document.documentElement.scrollTop - rootElOffsetTop;
	const rawBottom = rawTop + window.innerHeight;

	const bottom = Math.max(0, Math.min(rawBottom + overscanPadding, listHeight));
	const top = Math.max(0, Math.min(rawTop - overscanPadding, bottom));
	const isInView = bottom !== top;

	return {
		isInView,
		top,
		bottom,
		rawTop,
		rawBottom,
		listHeight,
	};
};

const getVisibleIndexes = (
	pivot: number,
	edges: TWindowEdges,
	nailPoints: number[],
	items: TData[],
	getHeight: (id: TID) => number,
) => {
	const { isInView } = edges;
	if (!isInView) return { isInView };

	let firstIndex = NaN;
	let lastIndex = NaN;

	const isIndexVisible = (i: number) => {
		const nP = nailPoints[i];
		const height = getHeight(items[i].id);
		const isStillNotFound = Number.isNaN(firstIndex);

		const isVisible = edges.top <= nP + height && nP <= edges.bottom;
		if (!isVisible) return isStillNotFound; // if not visible but found index in a scan before - break the loop

		if (isStillNotFound || i < firstIndex) firstIndex = i;
		if (isStillNotFound || i > lastIndex) lastIndex = i;

		return true; // `i` visible, check next one
	};
	for (let i = pivot; i >= 0 && isIndexVisible(i); i--) { /* empty */ }
	for (let i = pivot + 1; i < items.length && isIndexVisible(i); i++) { /* empty */ }

	return { isInView, firstIndex, lastIndex };
};

const rebuildNailPoints = (
	start: number,
	prevNailPoints: number[],
	items: TData[],
	getHeight: (id: TID) => number,
) => {
	const nailPoints = prevNailPoints.slice(0, start + 1);
	for (let i = start; i < items.length - 1; i++) {
		const nailPoint = nailPoints[i];
		const height = getHeight(items[i].id);

		nailPoints.push(nailPoint + height);
	}

	const last = Math.max(0, items.length - 1); // `items` may be empty
	const listHeight = nailPoints[last] + getHeight(items[last].id);

	return { nailPoints, listHeight };
};

const getPivotIndex = (first: number, last: number, items: TData[], heightCache: Record<TID, number>, offset = 0) => {
	let index = first;
	for (let i = first + offset; i <= last; i++) {
		if (heightCache[items[i].id]) {
			index = i;
			break;
		}
	}

	return index;
};

const clampIntoArrRange = (arr: unknown[], value: number) => Math.max(0, Math.min(value, arr.length - 1));

let prevAction: TAction | null = null;
const isReactStrictModeDuplicate = (action: TAction) => {
	if (Object.is(action, prevAction)) return true;
	prevAction = action;

	return false;
};

const reducer = (state: TState, action: TAction): TState => {
	const rootElOffsetTop = state.rootElRef.current?.offsetTop;
	const getHeight = (id: TID) => state.heightCache[id] ?? state.estimatedItemHeight;

	if (action.type === 'scroll' || action.type === 'init') {
		if (!state.items[0]) return state;

		const edges = getWindowEdges(state.listHeight, rootElOffsetTop, state.overscanPadding);
		const indexes = getVisibleIndexes(state.firstIndex, edges, state.nailPoints, state.items, getHeight);

		// Bailout if a state doesn't require an update to prevent empty render commit.
		// Every scroll event would be shown inside the React DevTools profiler, which could be confusing.
		const nextState = { ...state, ...indexes };
		if (shallowEqualObjects(state, nextState)) return state;
		return nextState;
	}

	if (action.type === 'measure') {
		const { index: entryIndex, height: entryHeight } = action;
		const entryID = state.items[entryIndex].id;

		if (state.heightCache[entryID] === entryHeight) return state;
		const heightCache = { ...state.heightCache, [entryID]: entryHeight };
		const getFreshHeight = (id: TID) => heightCache[id] ?? state.estimatedItemHeight;

		const { nailPoints, listHeight } = rebuildNailPoints(entryIndex, state.nailPoints, state.items, getFreshHeight);

		const offset = entryIndex === state.firstIndex ? 1 : 0;
		const pivotIndex = getPivotIndex(state.firstIndex, state.lastIndex, state.items, state.heightCache, offset);
		const isChangingAbovePivot = (entryIndex < pivotIndex || state.lastIndex <= pivotIndex);
		const isListShrinking = listHeight < state.listHeight;

		if (!isReactStrictModeDuplicate(action) && (isChangingAbovePivot || isListShrinking)) {
			const pivotHeightDiff = getHeight(state.items[pivotIndex].id) - getFreshHeight(state.items[pivotIndex].id);
			const pivotNailPointDiff = state.nailPoints[pivotIndex] - nailPoints[pivotIndex];

			// Offset the difference to prevent the content from jumping around.
			document.documentElement.scrollTop -= pivotNailPointDiff + pivotHeightDiff;
		}

		const edges = getWindowEdges(listHeight, rootElOffsetTop, state.overscanPadding);
		const indexes = getVisibleIndexes(pivotIndex, edges, nailPoints, state.items, getFreshHeight);

		return { ...state, heightCache, nailPoints, listHeight, ...indexes };
	}

	if (action.type === 'props-update') {
		const { items, estimatedItemHeight, overscanPadding } = action;
		const getFreshHeight = (id: TID) => state.heightCache[id] ?? estimatedItemHeight;

		const firstIndex = clampIntoArrRange(items, state.firstIndex);
		const lastIndex = clampIntoArrRange(items, state.lastIndex);
		const pivotIndex = getPivotIndex(firstIndex, lastIndex, items, state.heightCache);
		const { nailPoints, listHeight } = rebuildNailPoints(0, state.nailPoints, items, getFreshHeight);
		const edges = getWindowEdges(listHeight, rootElOffsetTop, overscanPadding);
		const indexes = getVisibleIndexes(pivotIndex, edges, nailPoints, items, getFreshHeight);

		return {
			...state,
			items,
			estimatedItemHeight,
			overscanPadding,
			nailPoints,
			listHeight,
			firstIndex,
			lastIndex,
			...indexes,
		};
	}

	return state;
};

function VirtualList<P extends TItemProps>({
	component,
	items,
	estimatedItemHeight,
	overscanPadding = 20,
	className,
	sharedProps,
	initState,
	disableMeasurment,
	onScroll,
	style,
}: TProps<P>) {
	const rootElRef = useRef<HTMLDivElement>(null);
	const [state, dispatch] = useReducer(reducer, 0, () => ({
		rootElRef,
		items,
		estimatedItemHeight,
		overscanPadding,
		heightCache: {},
		isInView: true,
		nailPoints: items.map((_data, i) => i * estimatedItemHeight),
		listHeight: items.length * estimatedItemHeight,
		firstIndex: 0,
		lastIndex: 0,
		...initState,
	}));
	const onMeasure = useCallback((index: number, height: number) => dispatch({ type: 'measure', index, height }), []);

	useEffect(() => dispatch({ type: 'init' }), []);

	useEffect(() => {
		const handleScroll = () => {
			onScroll?.(getWindowEdges(state.listHeight, rootElRef.current?.offsetTop, overscanPadding));

			dispatch({ type: 'scroll' });
		};

		document.addEventListener('scroll', handleScroll);
		window.addEventListener('resize', handleScroll);

		return () => {
			document.removeEventListener('scroll', handleScroll);
			window.removeEventListener('resize', handleScroll);
		};
	}, [state.listHeight, overscanPadding, onScroll]);

	if (
		items !== state.items
		|| estimatedItemHeight !== state.estimatedItemHeight
		|| overscanPadding !== state.overscanPadding
	) {
		dispatch({ type: 'props-update', items, estimatedItemHeight, overscanPadding });
		return null;
	}

	return (
		<div
			ref={rootElRef}
			className={className}
			style={{
				position: 'relative',
				contain: 'strict',
				width: '100%',
				...style,
				height: state.listHeight,
			}}
		>
			{state.isInView && items.slice(state.firstIndex, state.lastIndex + 1).map((itemData, i) => {
				const index = state.firstIndex + i;

				return (
					<VirtualListItem
						key={itemData.id}
						itemIndex={index}
						component={component}
						itemData={itemData}
						isAlreadyMeasured={!!state.heightCache[itemData.id]}
						nailPoint={state.nailPoints[index]}
						sharedProps={sharedProps}
						onMeasure={onMeasure}
						isMeasurmentDisabled={disableMeasurment}
					/>
				);
			})}
		</div>
	);
};

export default memo(VirtualList, (prev, next) => {
	// `initState` is used only at the component init, so it shouldn't rerender the list
	const { initState: a, sharedProps: SP, ...prevRest } = prev;
	const { initState: b, sharedProps: nextSP, ...nextRest } = next;

	if (!shallowEqualObjects(SP, nextSP) || !shallowEqualObjects(prevRest, nextRest)) return false;
	return true;
}) as typeof VirtualList;
