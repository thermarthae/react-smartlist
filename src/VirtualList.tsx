/* eslint-disable react-hooks/refs */
import {
	memo,
	useCallback,
	useEffect,
	useRef,
	useState,
} from 'react';
import { shallowEqualObjects } from 'shallow-equal';

import VirtualListItem, { type TItemProps, type TItemSharedProps } from './VirtualListItem.tsx';

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
	heightCache: Record<TID, number>;
	isInView: boolean;
	nailPoints: number[];
	listHeight: number;
	firstIndex: number;
	lastIndex: number;
};

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
	if (items.length === 0) return { nailPoints: [], listHeight: 0 };

	const nailPoints = (prevNailPoints.length > 0) ? prevNailPoints.slice(0, start + 1) : [0];
	for (let i = clampIntoArrRange(nailPoints, start); i < items.length - 1; i++) {
		const nailPoint = nailPoints[i];
		const height = getHeight(items[i].id);

		nailPoints.push(nailPoint + height);
	}

	const last = items.length - 1;
	const listHeight = nailPoints[last] + getHeight(items[last].id);

	return { nailPoints, listHeight };
};

const getPivotIndex = (first: number, last: number, items: TData[], heightCache: Record<TID, number>, offset = 0) => {
	if (items.length === 0) return 0;

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
	const [state, setState] = useState<TState>(() => ({
		items,
		estimatedItemHeight,
		overscanPadding,
		heightCache: {},
		isInView: items.length > 0,
		nailPoints: items.map((_data, i) => i * estimatedItemHeight),
		listHeight: items.length * estimatedItemHeight,
		firstIndex: 0,
		lastIndex: 0,
		...initState,
	}));
	const pendingState = useRef<TState>(state);
	const setBothStates = useCallback((nextState: TState) => {
		pendingState.current = nextState;
		setState(nextState);
	}, []);

	const handleItemMeasure = useCallback((entryIndex: number, entryHeight: number) => {
		const s = pendingState.current;
		const entryID = s.items[entryIndex].id;
		if (s.heightCache[entryID] === entryHeight) return;

		const heightCache = { ...s.heightCache, [entryID]: entryHeight };
		const getFreshHeight = (id: TID) => heightCache[id] ?? s.estimatedItemHeight;

		const { nailPoints, listHeight } = rebuildNailPoints(entryIndex, s.nailPoints, s.items, getFreshHeight);

		const offset = entryIndex === s.firstIndex ? 1 : 0;
		const pivotIndex = getPivotIndex(s.firstIndex, s.lastIndex, s.items, s.heightCache, offset);
		const isChangingAbovePivot = (entryIndex < pivotIndex || s.lastIndex <= pivotIndex);
		const isListShrinking = listHeight < s.listHeight;

		if (isChangingAbovePivot || isListShrinking) {
			const getHeight = (id: TID) => s.heightCache[id] ?? s.estimatedItemHeight;
			const pivotHeightDiff = getHeight(s.items[pivotIndex].id) - getFreshHeight(s.items[pivotIndex].id);
			const pivotNailPointDiff = s.nailPoints[pivotIndex] - nailPoints[pivotIndex];

			// Offset the difference to prevent the content from jumping around.
			document.documentElement.scrollTop -= pivotNailPointDiff + pivotHeightDiff;
		}

		const edges = getWindowEdges(listHeight, rootElRef.current?.offsetTop, s.overscanPadding);
		const indexes = getVisibleIndexes(pivotIndex, edges, nailPoints, s.items, getFreshHeight);

		setBothStates({ ...s, heightCache, nailPoints, listHeight, ...indexes });
	}, [setBothStates]);

	const handleWindowChange = useCallback(() => {
		const s = pendingState.current;
		if (!s.items[0]) return;

		const edges = getWindowEdges(s.listHeight, rootElRef.current?.offsetTop, s.overscanPadding);
		onScroll?.(edges);

		const getHeight = (id: TID) => s.heightCache[id] ?? s.estimatedItemHeight;
		const indexes = getVisibleIndexes(s.firstIndex, edges, s.nailPoints, s.items, getHeight);

		const nextState = { ...s, ...indexes };
		if (shallowEqualObjects(pendingState.current, nextState)) return;

		setBothStates(nextState);
	}, [onScroll, setBothStates]);

	// Recalculate the state once the DOM has been rendered
	useEffect(handleWindowChange, []); // eslint-disable-line react-hooks/exhaustive-deps

	useEffect(() => {
		document.addEventListener('scroll', handleWindowChange);
		window.addEventListener('resize', handleWindowChange);

		return () => {
			document.removeEventListener('scroll', handleWindowChange);
			window.removeEventListener('resize', handleWindowChange);
		};
	}, [handleWindowChange]);

	if (
		items !== state.items
		|| estimatedItemHeight !== state.estimatedItemHeight
		|| overscanPadding !== state.overscanPadding
	) {
		const getFreshHeight = (id: TID) => state.heightCache[id] ?? estimatedItemHeight;

		const firstIndex = clampIntoArrRange(items, state.firstIndex);
		const lastIndex = clampIntoArrRange(items, state.lastIndex);
		const pivotIndex = getPivotIndex(firstIndex, lastIndex, items, state.heightCache);
		const { nailPoints, listHeight } = rebuildNailPoints(0, state.nailPoints, items, getFreshHeight);
		const edges = getWindowEdges(listHeight, rootElRef.current?.offsetTop, overscanPadding);
		const indexes = getVisibleIndexes(pivotIndex, edges, nailPoints, items, getFreshHeight);

		setBothStates({
			...state,
			items,
			estimatedItemHeight,
			overscanPadding,
			nailPoints,
			listHeight,
			firstIndex,
			lastIndex,
			...indexes,
		});
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
						onMeasure={handleItemMeasure}
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
