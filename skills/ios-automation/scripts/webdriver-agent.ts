import { ActionableError, type Orientation, type ScreenElement, type ScreenSize, type SwipeDirection } from "./robot.ts";
import { logTiming } from "./timing-logger.ts";

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

const DEFAULT_REQUEST_TIMEOUT_MS = 15000;

export class WebDriverAgent {
	private readonly host: string;
	private readonly port: number;
	private readonly timeoutMs: number;

	public constructor(host: string, port: number, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS) {
		this.host = host;
		this.port = port;
		this.timeoutMs = timeoutMs;
	}

	private async fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs?: number): Promise<Response> {
		const timeout = timeoutMs ?? this.timeoutMs;
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeout);
		const urlPath = new URL(url).pathname;
		const start = performance.now();
		try {
			const response = await fetch(url, { ...options, signal: controller.signal });
			logTiming("webdriver-agent.ts", `fetch:${urlPath}`, performance.now() - start, "ok", `status=${response.status}`);
			return response;
		} catch (err: any) {
			const duration = performance.now() - start;
			if (err.name === "AbortError") {
				logTiming("webdriver-agent.ts", `fetch:${urlPath}`, duration, "error", `timeout=${timeout}ms`);
				throw new ActionableError(`WDA request timed out after ${timeout}ms: ${url}`);
			}
			logTiming("webdriver-agent.ts", `fetch:${urlPath}`, duration, "error", err.message?.slice(0, 100));
			throw err;
		} finally {
			clearTimeout(timer);
		}
	}

	private async fetchWithRetry(url: string, options: RequestInit = {}, retries = 2): Promise<Response> {
		let lastError: Error | undefined;
		for (let i = 0; i <= retries; i++) {
			try {
				return await this.fetchWithTimeout(url, options);
			} catch (err: any) {
				lastError = err;
				if (err.message?.includes("timed out") || i < retries) {
					await new Promise(resolve => setTimeout(resolve, 500 * (i + 1)));
					continue;
				}
				throw err;
			}
		}
		throw lastError!;
	}

	public async isRunning(): Promise<boolean> {
		const _t0 = performance.now();
		try {
			const response = await this.fetchWithTimeout(`http://${this.host}:${this.port}/status`, {}, 3000);
			const json = await response.json() as any;
			const ready = response.status === 200 && json.value?.ready === true;
			logTiming("webdriver-agent.ts", "isRunning", performance.now() - _t0, "ok", `ready=${ready}`);
			return ready;
		} catch {
			logTiming("webdriver-agent.ts", "isRunning", performance.now() - _t0, "ok", "ready=false");
			return false;
		}
	}

	public async createSession(): Promise<string> {
		const _t0 = performance.now();
		const response = await this.fetchWithRetry(`http://${this.host}:${this.port}/session`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ capabilities: { alwaysMatch: { platformName: "iOS" } } }),
		});

		if (!response.ok) {
			logTiming("webdriver-agent.ts", "createSession", performance.now() - _t0, "error", `status=${response.status}`);
			throw new ActionableError(`Failed to create WebDriver session: ${response.status} ${await response.text()}`);
		}

		const json = await response.json() as any;
		if (!json.value?.sessionId) {
			logTiming("webdriver-agent.ts", "createSession", performance.now() - _t0, "error", "no sessionId");
			throw new ActionableError(`Invalid session response: ${JSON.stringify(json)}`);
		}

		logTiming("webdriver-agent.ts", "createSession", performance.now() - _t0);
		return json.value.sessionId;
	}

	public async deleteSession(sessionId: string): Promise<void> {
		try {
			await this.fetchWithTimeout(`http://${this.host}:${this.port}/session/${sessionId}`, { method: "DELETE" });
		} catch {
			// Best effort - session will expire on the device anyway
		}
	}

	public async withinSession<T>(fn: (sessionUrl: string) => Promise<T>): Promise<T> {
		const _t0 = performance.now();
		const sessionId = await this.createSession();
		const sessionUrl = `http://${this.host}:${this.port}/session/${sessionId}`;
		try {
			const result = await fn(sessionUrl);
			logTiming("webdriver-agent.ts", "withinSession", performance.now() - _t0);
			return result;
		} catch (err: any) {
			logTiming("webdriver-agent.ts", "withinSession", performance.now() - _t0, "error", err.message?.slice(0, 100));
			throw err;
		} finally {
			await this.deleteSession(sessionId);
		}
	}

	public async getScreenSize(sessionUrl?: string): Promise<ScreenSize> {
		if (sessionUrl) {
			const response = await this.fetchWithTimeout(`${sessionUrl}/wda/screen`);
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
			await this.fetchWithRetry(`${sessionUrl}/wda/keys`, {
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
			throw new ActionableError(`Button "${button}" is not supported. Supported: ${Object.keys(supported).join(", ")}, ENTER`);
		}

		await this.withinSession(async sessionUrl => {
			await this.fetchWithRetry(`${sessionUrl}/wda/pressButton`, {
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
			await this.fetchWithTimeout(`${sessionUrl}/actions`, {
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
			await this.fetchWithTimeout(`${sessionUrl}/actions`, {
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
		const _t0 = performance.now();
		const response = await this.fetchWithTimeout(`http://${this.host}:${this.port}/source/?format=json`, {}, 20000);
		const result = await response.json() as SourceTree;
		logTiming("webdriver-agent.ts", "getPageSource", performance.now() - _t0);
		return result;
	}

	public async getElementsOnScreen(): Promise<ScreenElement[]> {
		const _t0 = performance.now();
		const source = await this.getPageSource();
		const elements = this.filterSourceElements(source.value);
		logTiming("webdriver-agent.ts", "getElementsOnScreen", performance.now() - _t0, "ok", `${elements.length} elements`);
		return elements;
	}

	public async openUrl(url: string): Promise<void> {
		await this.withinSession(async sessionUrl => {
			await this.fetchWithTimeout(`${sessionUrl}/url`, {
				method: "POST",
				body: JSON.stringify({ url }),
			});
		});
	}

	public async getScreenshot(): Promise<Buffer> {
		const _t0 = performance.now();
		const response = await this.fetchWithTimeout(`http://${this.host}:${this.port}/screenshot`, {}, 20000);
		const json = await response.json() as any;
		const buf = Buffer.from(json.value, "base64");
		logTiming("webdriver-agent.ts", "getScreenshot", performance.now() - _t0, "ok", `${buf.length} bytes`);
		return buf;
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
			await this.fetchWithTimeout(`${sessionUrl}/actions`, { method: "DELETE" });
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
			await this.fetchWithTimeout(`${sessionUrl}/orientation`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ orientation: orientation.toUpperCase() }),
			});
		});
	}

	public async getOrientation(): Promise<Orientation> {
		return this.withinSession(async sessionUrl => {
			const response = await this.fetchWithTimeout(`${sessionUrl}/orientation`);
			const json = await response.json() as any;
			return String(json.value).toLowerCase() === "landscape" ? "landscape" : "portrait";
		});
	}
}
