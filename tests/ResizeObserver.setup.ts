class ResizeObserverHack implements ResizeObserver {
	private callback: ResizeObserverCallback;

	constructor(fn: ResizeObserverCallback) {
		this.callback = fn;
	}

	// eslint-disable-next-line class-methods-use-this
	public disconnect() { }

	// eslint-disable-next-line class-methods-use-this
	public unobserve() { }

	public observe(target: HTMLElement) {
		const height = parseInt(target.style.height, 10) ?? -1;
		const entry = {
			borderBoxSize: [{ blockSize: height }],
		};

		this.callback([entry as any as ResizeObserverEntry], null as never);
	}
}

window.ResizeObserver = ResizeObserverHack;
