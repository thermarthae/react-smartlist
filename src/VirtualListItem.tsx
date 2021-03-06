import React, {
	ElementType,
	Component,
	createElement,
} from 'react';
import {
	CallbackNode,
	unstable_scheduleCallback as scheduleCallback,
	unstable_cancelCallback as cancelCallback,
	unstable_UserBlockingPriority as UserBlockingPriority,
	unstable_LowPriority as LowPriority,
} from 'scheduler';

import { TItemID, TEntry } from './VirtualList';
import shallowDiffers from './shallowDiffers';

export type TSharedProps<P> = Omit<P, keyof TChildrenProps | 'children'>;
export type TChildrenProps<Item = unknown, Ref extends HTMLElement = HTMLElement> = {
	innerRef: React.Ref<Ref>;
	data: Item;
	itWasMeasured: boolean;
	rootElProps: {
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

export type TProps<I = unknown, C extends ElementType = ElementType> = {
	component: C;
	itemID: TItemID;
	itemData: I;
	itemIndex: number;
	nailPoint: number;
	itWasMeasured: boolean;
	onMeasure: (item: TEntry<I>) => void;
	sharedProps?: TSharedProps<React.ComponentPropsWithoutRef<C>>;
	isMeasurmentDisabled?: boolean;
};

class VirtualListItem<I, C extends ElementType> extends Component<TProps<I, C>> {
	private readonly itemElRef = React.createRef<HTMLElement>();

	private resizeObserver: ResizeObserver | null = null;

	private scheduledObserver: CallbackNode | null = null;

	public componentDidMount() {
		this.attachResizeObserver();
	}

	public shouldComponentUpdate(nextProps: TProps<I, C>) {
		if (this.props !== nextProps) {
			const { itemData: data, sharedProps: SP, ...prevRest } = this.props;
			const { itemData: nextData, sharedProps: nextSP, ...nextRest } = nextProps;

			if (
				shallowDiffers(prevRest, nextRest)
				|| shallowDiffers(data, nextData)
				|| shallowDiffers(SP, nextSP)
			) return true;
		}

		return false;
	}

	public componentDidUpdate(prevProps: TProps<I, C>) {
		if (prevProps.isMeasurmentDisabled !== this.props.isMeasurmentDisabled) {
			if (this.props.isMeasurmentDisabled) this.detachResizeObserver();
			else this.attachResizeObserver();
		}
	}

	public componentWillUnmount() {
		this.detachResizeObserver();
	}

	private readonly attachResizeObserver = () => {
		if (this.props.isMeasurmentDisabled) return;

		// Use lower priority for already cached items
		const priority = this.props.itWasMeasured ? LowPriority : UserBlockingPriority;
		this.scheduledObserver = scheduleCallback(priority, () => {
			if (!this.itemElRef.current) return;
			this.resizeObserver = new ResizeObserver(this.measureHeight);
			this.resizeObserver.observe(this.itemElRef.current);
		});
	};

	private readonly detachResizeObserver = () => {
		if (this.scheduledObserver) cancelCallback(this.scheduledObserver);
		this.resizeObserver?.disconnect();
		this.resizeObserver = null;
	};

	private readonly measureHeight: ResizeObserverCallback = ([entry]) => {
		const {
			onMeasure,
			itemID,
			itemIndex,
			itemData,
		} = this.props;

		const height = entry.borderBoxSize?.[0].blockSize ?? 0;
		if (height === 0) {
			return;
		}

		onMeasure({
			id: itemID,
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
				...(sharedProps ?? {}),
				data: itemData,
				innerRef: this.itemElRef,
				itWasMeasured,
				rootElProps: {
					'data-index': itemIndex,
					'data-measured': itWasMeasured,
					style: {
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
