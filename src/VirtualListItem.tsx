import {
	ElementType,
	memo,
	useCallback,
	useEffect,
	useRef,
} from 'react';
import {
	unstable_cancelCallback as cancelCallback,
	unstable_LowPriority as LowPriority,
	unstable_scheduleCallback as scheduleCallback,
	unstable_UserBlockingPriority as UserBlockingPriority,
} from 'scheduler';
import { shallowEqualObjects } from 'shallow-equal';

import type { TData } from './VirtualList.tsx';

export type TSharedProps<P> = Omit<P, keyof TChildrenProps | 'children'>;
export type TChildrenProps<D extends TData = TData, El extends HTMLElement = HTMLElement> = {
	data: D;
	isAlreadyMeasured: boolean;
	rootElProps: {
		ref: React.Ref<El>;
		'data-index': number;
		'data-measured': boolean;
		style: {
			position: 'absolute';
			width: '100%';
			transform: string;
			contain: 'content';
		};
	};
};

export type TProps<D extends TData = TData, C extends ElementType = ElementType> = {
	component: C;
	itemData: D;
	itemIndex: number;
	nailPoint: number;
	sharedProps?: TSharedProps<React.ComponentPropsWithoutRef<C>>;
	isAlreadyMeasured: boolean;
	isMeasurmentDisabled?: boolean;
	onMeasure: (index: number, height: number) => void;
};

function VirtualListItem<D extends TData, C extends ElementType>({
	component,
	itemData,
	itemIndex,
	nailPoint,
	sharedProps,
	isAlreadyMeasured,
	isMeasurmentDisabled,
	onMeasure,
}: TProps<D, C>) {
	const ref = useRef<HTMLElement>(null);
	const observer = useRef<ResizeObserver | null>(null);

	const handleResize = useCallback<ResizeObserverCallback>(([entry]) => {
		const height = entry.borderBoxSize[0].blockSize;
		if (height === 0) return;

		onMeasure(itemIndex, height);
	}, [onMeasure, itemIndex]);

	useEffect(() => {
		if (!isMeasurmentDisabled) return () => {
			observer.current?.disconnect();
			observer.current = null;
		};
	}, [isMeasurmentDisabled, handleResize]);

	useEffect(() => {
		if (isMeasurmentDisabled || observer.current) return;

		// Use lower priority for already cached items
		const priority = isAlreadyMeasured ? LowPriority : UserBlockingPriority;
		const node = scheduleCallback(priority, () => {
			if (!ref.current) return;
			observer.current = new ResizeObserver(handleResize);
			observer.current.observe(ref.current);
		});

		return () => cancelCallback(node);
	}, [isMeasurmentDisabled, isAlreadyMeasured, handleResize]);

	const Child = component as React.ComponentType<TChildrenProps<D>>;
	return (
		<Child
			{...{
				...sharedProps,
				data: itemData,
				isAlreadyMeasured,
				rootElProps: {
					ref,
					'data-index': itemIndex,
					'data-measured': isAlreadyMeasured,
					style: {
						position: 'absolute',
						width: '100%',
						transform: `translateY(${nailPoint}px)`,
						contain: 'content',
					},
				},
			}}
		/>
	);
}

export default memo(VirtualListItem, (prev, next) => {
	const { itemData: data, ...rest } = prev;
	const { itemData: nextData, ...nextRest } = next;

	if (!shallowEqualObjects(rest, nextRest) || !shallowEqualObjects(data, nextData)) return false;
	return true;
});
