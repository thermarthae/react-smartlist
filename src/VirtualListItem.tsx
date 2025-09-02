import {
	Component,
	createRef,
	ElementType,
} from 'react';
import {
	CallbackNode,
	unstable_cancelCallback as cancelCallback,
	unstable_LowPriority as LowPriority,
	unstable_scheduleCallback as scheduleCallback,
	unstable_UserBlockingPriority as UserBlockingPriority,
} from 'scheduler';
import { shallowEqualObjects } from 'shallow-equal';

export type TSharedProps<P> = Omit<P, keyof TChildrenProps | 'children'>;
export type TChildrenProps<Item extends object = object, Ref extends HTMLElement = HTMLElement> = {
	data: Item;
	isAlreadyMeasured: boolean;
	rootElProps: {
		ref: React.Ref<Ref>;
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

export type TProps<I extends object = object, C extends ElementType = ElementType> = {
	component: C;
	itemData: I;
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

class VirtualListItem<I extends object, C extends ElementType> extends Component<TProps<I, C>> {
	private readonly itemElRef = createRef<HTMLElement>();

	private resizeObserver: ResizeObserver | null = null;

	private scheduledObserver: CallbackNode | null = null;

	public componentDidMount() {
		this.attachResizeObserver();
	}

	public shouldComponentUpdate(nextProps: TProps<I, C>) {
		if (this.props !== nextProps) {
			const { itemData: data, sharedProps: SP, onMeasure, ...prevRest } = this.props;
			const { itemData: nextData, sharedProps: nextSP, onMeasure: nextOnMeasure, ...nextRest } = nextProps;

			if (
				onMeasure.key !== nextOnMeasure.key
				|| !shallowEqualObjects(prevRest, nextRest)
				|| !shallowEqualObjects(data, nextData)
				|| !shallowEqualObjects(SP, nextSP)
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
		const priority = this.props.isAlreadyMeasured ? LowPriority : UserBlockingPriority;
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
		const height = entry.borderBoxSize?.[0].blockSize ?? 0;
		if (height === 0) return;

		this.props.onMeasure(height);
	};

	public render() {
		const {
			component,
			itemData,
			sharedProps,
			isAlreadyMeasured,
			nailPoint,
			itemIndex,
		} = this.props;

		const Child = component as React.ComponentType<TChildrenProps<I>>;
		return (
			<Child
				{...{
					...sharedProps,
					data: itemData,
					isAlreadyMeasured,
					rootElProps: {
						ref: this.itemElRef,
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
}

export default VirtualListItem;
