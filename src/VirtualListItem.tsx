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

export type TSharedProps<P> = Omit<P, keyof TChildrenProps | 'children'>;
export type TChildrenProps<Data extends object = object, El extends HTMLElement = HTMLElement> = {
	data: Data;
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

export type TProps<Data extends object = object, C extends ElementType = ElementType> = {
	component: C;
	itemData: Data;
	itemIndex: number;
	nailPoint: number;
	sharedProps?: TSharedProps<React.ComponentPropsWithoutRef<C>>;
	isAlreadyMeasured: boolean;
	isMeasurmentDisabled?: boolean;
	onMeasure: {
		/**  React memo helper to check whether `onMeasure` actually differs */
		key?: string;
		(height: number): void;
	};
};

function VirtualListItem<Data extends object, C extends ElementType>({
	component,
	itemData,
	itemIndex,
	nailPoint,
	sharedProps,
	isAlreadyMeasured,
	isMeasurmentDisabled,
	onMeasure,
}: TProps<Data, C>) {
	const ref = useRef<HTMLElement>(null);
	const observer = useRef<ResizeObserver | null>(null);

	const onMeasureRef = useRef(onMeasure); // TODO: mayby useEffectEvent?
	useEffect(() => { onMeasureRef.current = onMeasure; }, [onMeasure]);

	const handleResize = useCallback<ResizeObserverCallback>(([entry]) => {
		const height = entry.borderBoxSize[0].blockSize;
		if (height === 0) return;

		onMeasureRef.current(height);
	}, []);

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

	const Child = component as React.ComponentType<TChildrenProps<Data>>;
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
	const { itemData: data, sharedProps: SP, onMeasure, ...prevRest } = prev;
	const { itemData: nextData, sharedProps: nextSP, onMeasure: nextOnMeasure, ...nextRest } = next;

	if (
		onMeasure.key !== nextOnMeasure.key
		|| !shallowEqualObjects(prevRest, nextRest)
		|| !shallowEqualObjects(data, nextData)
		|| !shallowEqualObjects(SP, nextSP)
	) return false;

	return true;
});
