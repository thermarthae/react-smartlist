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

		if (this.lastHeight === this.target.style.height) return;

		this.lastHeight = this.target.style.height;
		const height = parseInt(this.target.style.height, 10);

		if (Number.isFinite(height)) {
			this.callback([{ borderBoxSize: [{ blockSize: height }] } as unknown as ResizeObserverEntry], this);
		}
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
