import { ActionableError, type Orientation, type ScreenElement, type ScreenSize, type SwipeDirection } from "./robot.ts";

export interface SourceTreeElementRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface SourceTreeElement {
	type: string;
	label?: string;
	name?: string;
	value?: string;
	rawIdentifier?: string;
	rect: SourceTreeElementRect;
	isVisible?: string;
	children?: SourceTreeElement[];
}

export interface SourceTree {
	value: SourceTreeElement;
}

export class WebDriverAgent {
	private readonly host: string;
	private readonly port: number;

	public constructor(host: string, port: number) {
		this.host = host;
		this.port = port;
	}

	public async isRunning(): Promise<boolean> {
		try {
			const response = await fetch(`http://${this.host}:${this.port}/status`);
			const json = await response.json() as any;
			return response.status === 200 && json.value?.ready === true;
		} catch {
			return false;
		}
	}

	public async createSession(): Promise<string> {
		const response = await fetch(`http://${this.host}:${this.port}/session`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ capabilities: { alwaysMatch: { platformName: "iOS" } } }),
		});

		if (!response.ok) {
			throw new ActionableError(`Failed to create WebDriver session: ${response.status} ${await response.text()}`);
		}

		const json = await response.json() as any;
		if (!json.value?.sessionId) {
			throw new ActionableError(`Invalid session response: ${JSON.stringify(json)}`);
		}

		return json.value.sessionId;
	}

	public async deleteSession(sessionId: string): Promise<void> {
		await fetch(`http://${this.host}:${this.port}/session/${sessionId}`, { method: "DELETE" });
	}

	public async withinSession<T>(fn: (sessionUrl: string) => Promise<T>): Promise<T> {
		const sessionId = await this.createSession();
		const sessionUrl = `http://${this.host}:${this.port}/session/${sessionId}`;
		try {
			return await fn(sessionUrl);
		} finally {
			await this.deleteSession(sessionId);
		}
	}

	public async getScreenSize(sessionUrl?: string): Promise<ScreenSize> {
		if (sessionUrl) {
			const response = await fetch(`${sessionUrl}/wda/screen`);
			const json = await response.json() as any;
			return {
				width: json.value.screenSize.width,
				height: json.value.screenSize.height,
				scale: json.value.scale || 1,
			};
		}

		return this.withinSession(async innerUrl => this.getScreenSize(innerUrl));
	}

	public async sendKeys(keys: string): Promise<void> {
		await this.withinSession(async sessionUrl => {
			await fetch(`${sessionUrl}/wda/keys`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ value: [keys] }),
			});
		});
	}

	public async pressButton(button: string): Promise<void> {
		const supported = {
			HOME: "home",
			VOLUME_UP: "volumeup",
			VOLUME_DOWN: "volumedown",
		};

		if (button === "ENTER") {
			await this.sendKeys("\n");
			return;
		}

		if (!(button in supported)) {
			throw new ActionableError(`Button "${button}" is not supported`);
		}

		await this.withinSession(async sessionUrl => {
			await fetch(`${sessionUrl}/wda/pressButton`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: button }),
			});
		});
	}

	public async tap(x: number, y: number): Promise<void> {
		await this.pointerAction(x, y, x, y, 100);
	}

	public async doubleTap(x: number, y: number): Promise<void> {
		await this.withinSession(async sessionUrl => {
			await fetch(`${sessionUrl}/actions`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					actions: [{
						type: "pointer",
						id: "finger1",
						parameters: { pointerType: "touch" },
						actions: [
							{ type: "pointerMove", duration: 0, x, y },
							{ type: "pointerDown", button: 0 },
							{ type: "pause", duration: 50 },
							{ type: "pointerUp", button: 0 },
							{ type: "pause", duration: 100 },
							{ type: "pointerDown", button: 0 },
							{ type: "pause", duration: 50 },
							{ type: "pointerUp", button: 0 },
						],
					}],
				}),
			});
		});
	}

	public async longPress(x: number, y: number, duration: number): Promise<void> {
		await this.pointerAction(x, y, x, y, duration);
	}

	private async pointerAction(x0: number, y0: number, x1: number, y1: number, duration: number): Promise<void> {
		await this.withinSession(async sessionUrl => {
			await fetch(`${sessionUrl}/actions`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					actions: [{
						type: "pointer",
						id: "finger1",
						parameters: { pointerType: "touch" },
						actions: [
							{ type: "pointerMove", duration: 0, x: x0, y: y0 },
							{ type: "pointerDown", button: 0 },
							{ type: "pointerMove", duration, x: x1, y: y1 },
							{ type: "pointerUp", button: 0 },
						],
					}],
				}),
			});
		});
	}

	private isVisible(rect: SourceTreeElementRect): boolean {
		return rect.x >= 0 && rect.y >= 0;
	}

	private filterSourceElements(source: SourceTreeElement): ScreenElement[] {
		const output: ScreenElement[] = [];
		const acceptedTypes = ["TextField", "Button", "Switch", "Icon", "SearchField", "StaticText", "Image"];

		if (acceptedTypes.includes(source.type) && source.isVisible === "1" && this.isVisible(source.rect)) {
			if (source.label !== null || source.name !== null || source.rawIdentifier !== null) {
				output.push({
					type: source.type,
					label: source.label,
					name: source.name,
					value: source.value,
					identifier: source.rawIdentifier,
					rect: { ...source.rect },
				});
			}
		}

		for (const child of source.children || []) {
			output.push(...this.filterSourceElements(child));
		}

		return output;
	}

	public async getPageSource(): Promise<SourceTree> {
		const response = await fetch(`http://${this.host}:${this.port}/source/?format=json`);
		return await response.json() as SourceTree;
	}

	public async getElementsOnScreen(): Promise<ScreenElement[]> {
		const source = await this.getPageSource();
		return this.filterSourceElements(source.value);
	}

	public async openUrl(url: string): Promise<void> {
		await this.withinSession(async sessionUrl => {
			await fetch(`${sessionUrl}/url`, {
				method: "POST",
				body: JSON.stringify({ url }),
			});
		});
	}

	public async getScreenshot(): Promise<Buffer> {
		const response = await fetch(`http://${this.host}:${this.port}/screenshot`);
		const json = await response.json() as any;
		return Buffer.from(json.value, "base64");
	}

	public async swipe(direction: SwipeDirection): Promise<void> {
		await this.withinSession(async sessionUrl => {
			const screenSize = await this.getScreenSize(sessionUrl);
			const verticalDistance = Math.floor(screenSize.height * 0.6);
			const horizontalDistance = Math.floor(screenSize.width * 0.6);
			const centerX = Math.floor(screenSize.width / 2);
			const centerY = Math.floor(screenSize.height / 2);

			let x0 = centerX;
			let x1 = centerX;
			let y0 = centerY + Math.floor(verticalDistance / 2);
			let y1 = centerY - Math.floor(verticalDistance / 2);

			switch (direction) {
				case "up":
					break;
				case "down":
					y0 = centerY - Math.floor(verticalDistance / 2);
					y1 = centerY + Math.floor(verticalDistance / 2);
					break;
				case "left":
					y0 = y1 = centerY;
					x0 = centerX + Math.floor(horizontalDistance / 2);
					x1 = centerX - Math.floor(horizontalDistance / 2);
					break;
				case "right":
					y0 = y1 = centerY;
					x0 = centerX - Math.floor(horizontalDistance / 2);
					x1 = centerX + Math.floor(horizontalDistance / 2);
					break;
			}

			await this.pointerAction(x0, y0, x1, y1, 1000);
			await fetch(`${sessionUrl}/actions`, { method: "DELETE" });
		});
	}

	public async swipeFromCoordinate(x: number, y: number, direction: SwipeDirection, distance = 400): Promise<void> {
		let x1 = x;
		let y1 = y;
		switch (direction) {
			case "up":
				y1 = y - distance;
				break;
			case "down":
				y1 = y + distance;
				break;
			case "left":
				x1 = x - distance;
				break;
			case "right":
				x1 = x + distance;
				break;
		}

		await this.pointerAction(x, y, x1, y1, 1000);
	}

	public async setOrientation(orientation: Orientation): Promise<void> {
		await this.withinSession(async sessionUrl => {
			await fetch(`${sessionUrl}/orientation`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ orientation: orientation.toUpperCase() }),
			});
		});
	}

	public async getOrientation(): Promise<Orientation> {
		return this.withinSession(async sessionUrl => {
			const response = await fetch(`${sessionUrl}/orientation`);
			const json = await response.json() as any;
			return String(json.value).toLowerCase() === "landscape" ? "landscape" : "portrait";
		});
	}
}
