import React from 'react';
import {
	CallbackNode,
	unstable_scheduleCallback as scheduleCallback,
	unstable_cancelCallback as cancelCallback,
	unstable_UserBlockingPriority as UserBlockingPriority,
	unstable_LowPriority as LowPriority,
} from 'scheduler';

import { TEntry } from './VirtualList';

export type TItemProps<Item extends object = {}, Ref extends HTMLElement = HTMLElement> = {
	ref: React.Ref<Ref>;
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

type TProps<Component extends React.ElementType, Item extends object = {}> = {
	component: React.ElementType;
	itemData: Item;
	itemIndex: number;
	nailPoint: number;
	itWasMeasured: boolean;
	onMeasure: (item: TEntry<Item>) => void;
	sharedProps?: Omit<React.ComponentPropsWithoutRef<Component>, 'data'>;
};

class VirtualListItem<C extends React.ElementType, I extends object> extends React.PureComponent<TProps<C, I>> {
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
			component: Component,
			itemData,
			sharedProps = {},
			itWasMeasured,
			nailPoint,
			itemIndex,
		} = this.props;

		const childProps: TItemProps<I> = {
			...sharedProps,
			data: itemData,
			ref: this.itemElRef,
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
		};

		return <Component {...childProps} />;
	}
}

export default VirtualListItem;
