class ResizeObserverHack implements ResizeObserver {
	private callback: ResizeObserverCallback;

	private observer: MutationObserver | null = null;

	private lastHeight?: string;

	private target?: HTMLElement;

	constructor(fn: ResizeObserverCallback) {
		this.callback = fn;
	}

	public disconnect() {
		this.observer?.disconnect();
		this.observer = null;
	}

	public unobserve() {
		this.observer?.disconnect();
		this.observer = null;
	}

	public handleCallback = () => {
		if (!this.target) throw new Error('no target');

		const { expectedHeight } = this.target.dataset;
		if (!expectedHeight) throw new Error('no expectedHeight');

		if (this.lastHeight === expectedHeight) return;
		this.lastHeight = expectedHeight;

		const blockSize = parseInt(expectedHeight, 10);
		this.callback([{ borderBoxSize: [{ blockSize }] } as unknown as ResizeObserverEntry], this);
	};

	public observe(target: HTMLElement) {
		this.target = target;
		this.handleCallback();

		if (!this.observer) {
			this.observer = new MutationObserver(() => this.handleCallback());

			this.observer.observe(target, {
				attributes: true,
				childList: true,
				characterData: true,
				subtree: true,
			});
		}
	}
}

window.ResizeObserver = ResizeObserverHack;
