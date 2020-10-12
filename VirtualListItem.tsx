import React, {
	ElementType,
	createElement,
} from 'react';
import {
	CallbackNode,
	unstable_scheduleCallback as scheduleCallback,
	unstable_cancelCallback as cancelCallback,
	unstable_UserBlockingPriority as UserBlockingPriority,
	unstable_LowPriority as LowPriority,
} from 'scheduler';

import { TEntry } from './VirtualList';

export type TSharedProps<P> = Omit<P, keyof TChildrenProps | 'children'>;
export type TChildrenProps<Item = {}, Ref extends HTMLElement = HTMLElement> = {
	innerRef: React.Ref<Ref>;
	data: Item;
	rootElProps: {
		'data-index': number;
		'data-measured': boolean;
		style: {
			opacity?: number;
			willChange?: 'transform';
			position: 'absolute';
			width: '100%';
			transform: string;
			contain: 'content',
		};
	};
};

type TProps<I = {}, C extends ElementType = ElementType> = {
	component: C;
	itemData: I;
	itemIndex: number;
	nailPoint: number;
	itWasMeasured: boolean;
	onMeasure: (item: TEntry<I>) => void;
	sharedProps?: TSharedProps<React.ComponentPropsWithoutRef<C>>;
};

class VirtualListItem<I, C extends ElementType> extends React.PureComponent<TProps<I, C>> {
	private itemElRef = React.createRef<HTMLElement>();

	private resizeObserver: ResizeObserver | null = null;

	private scheduledObserver: CallbackNode | null = null;

	public componentDidMount() {
		this.attachResizeObserver();
	}

	public componentWillUnmount() {
		this.detachResizeObserver();
	}

	private attachResizeObserver = () => {
		const priority = !this.props.itWasMeasured ? UserBlockingPriority : LowPriority;
		this.scheduledObserver = scheduleCallback(priority, () => {
			if (!this.itemElRef.current) return;
			this.resizeObserver = new ResizeObserver(this.measureHeight);
			this.resizeObserver.observe(this.itemElRef.current);
		});
	};

	private detachResizeObserver = () => {
		if (this.scheduledObserver) cancelCallback(this.scheduledObserver);
		this.resizeObserver?.disconnect();
		this.resizeObserver = null;
	};

	private measureHeight: ResizeObserverCallback = ([entry]) => {
		const { onMeasure, itemIndex, itemData } = this.props;

		const height = entry.borderBoxSize[0].blockSize;
		if (height === 0) {
			return;
		}
		onMeasure({
			index: itemIndex,
			data: itemData,
			height,
		});
	};

	public render() {
		const {
			component,
			itemData,
			sharedProps,
			itWasMeasured,
			nailPoint,
			itemIndex,
		} = this.props;

		return createElement(
			component,
			{
				...(sharedProps || {}),
				data: itemData,
				innerRef: this.itemElRef,
				rootElProps: {
					'data-index': itemIndex,
					'data-measured': itWasMeasured,
					style: {
						opacity: itWasMeasured ? undefined : 0.5,
						willChange: itWasMeasured ? undefined : 'transform',
						position: 'absolute',
						width: '100%',
						transform: `translateY(${nailPoint}px)`,
						contain: 'content',
					},
				},
			} as TChildrenProps<I>,
		);
	}
}

export default VirtualListItem;
