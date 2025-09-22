import {
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

export type TItemProps<D extends TData = TData> = {
	data: D;
	isAlreadyMeasured: boolean;
	rootElProps: {
		ref: React.Ref<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
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
export type TItemSharedProps<P> = Omit<P, keyof TItemProps | 'children'>;

export type TProps<P extends TItemProps> = {
	component: React.ComponentType<P>;
	itemData: TData;
	itemIndex: number;
	nailPoint: number;
	sharedProps?: TItemSharedProps<P>;
	isAlreadyMeasured: boolean;
	isMeasurmentDisabled?: boolean;
	onMeasure: (index: number, height: number) => void;
};

function VirtualListItem<P extends TItemProps>({
	component,
	itemData,
	itemIndex,
	nailPoint,
	sharedProps,
	isAlreadyMeasured,
	isMeasurmentDisabled,
	onMeasure,
}: TProps<P>) {
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

	const Item = component as React.ComponentType<TItemProps>;
	return (
		<Item
			{...sharedProps}
			data={itemData}
			isAlreadyMeasured={isAlreadyMeasured}
			rootElProps={{
				ref,
				'data-index': itemIndex,
				'data-measured': isAlreadyMeasured,
				style: {
					position: 'absolute',
					width: '100%',
					transform: `translateY(${nailPoint}px)`,
					contain: 'content',
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
}) as typeof VirtualListItem;
