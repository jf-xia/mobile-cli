import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

import { ActionableError, type Button, type InstalledApp, type Orientation, type Robot, type ScreenElement, type ScreenElementRect, type ScreenSize, type SwipeDirection } from "./robot.ts";
import { validateLocale, validatePackageName } from "./utils.ts";

export interface AndroidDevice {
	deviceId: string;
	deviceType: "tv" | "mobile";
}

interface UiAutomatorNode {
	class?: string;
	text?: string;
	bounds?: string;
	hint?: string;
	focused?: string;
	checkable?: string;
	"content-desc"?: string;
	"resource-id"?: string;
}

const TIMEOUT = 30000;
const MAX_BUFFER_SIZE = 1024 * 1024 * 8;

const BUTTON_MAP: Record<Button, string> = {
	BACK: "KEYCODE_BACK",
	HOME: "KEYCODE_HOME",
	VOLUME_UP: "KEYCODE_VOLUME_UP",
	VOLUME_DOWN: "KEYCODE_VOLUME_DOWN",
	ENTER: "KEYCODE_ENTER",
	DPAD_CENTER: "KEYCODE_DPAD_CENTER",
	DPAD_UP: "KEYCODE_DPAD_UP",
	DPAD_DOWN: "KEYCODE_DPAD_DOWN",
	DPAD_LEFT: "KEYCODE_DPAD_LEFT",
	DPAD_RIGHT: "KEYCODE_DPAD_RIGHT",
};

const getAdbPath = (): string => {
	const exeName = process.platform === "win32" ? "adb.exe" : "adb";
	if (process.env.ANDROID_HOME) {
		return path.join(process.env.ANDROID_HOME, "platform-tools", exeName);
	}

	if (process.platform === "win32" && process.env.LOCALAPPDATA) {
		const windowsAdbPath = path.join(process.env.LOCALAPPDATA, "Android", "Sdk", "platform-tools", exeName);
		if (existsSync(windowsAdbPath)) {
			return windowsAdbPath;
		}
	}

	if (process.platform === "darwin" && process.env.HOME) {
		const defaultAndroidSdk = path.join(process.env.HOME, "Library", "Android", "sdk", "platform-tools", exeName);
		if (existsSync(defaultAndroidSdk)) {
			return defaultAndroidSdk;
		}
	}

	return exeName;
};

const decodeXml = (value: string): string => {
	return value
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&amp;/g, "&");
};

const parseUiAutomatorNodes = (dump: string): UiAutomatorNode[] => {
	const nodes: UiAutomatorNode[] = [];
	const nodeRegex = /<node\b([^>]*)\/?>/g;
	for (const match of dump.matchAll(nodeRegex)) {
		const attributes = match[1] || "";
		const node: UiAutomatorNode = {};
		for (const attributeMatch of attributes.matchAll(/([A-Za-z0-9:_-]+)="([^"]*)"/g)) {
			const key = attributeMatch[1] as keyof UiAutomatorNode;
			node[key] = decodeXml(attributeMatch[2]) as never;
		}
		nodes.push(node);
	}

	return nodes;
};

export class AndroidRobot implements Robot {
	private readonly deviceId: string;

	public constructor(deviceId: string) {
		this.deviceId = deviceId;
	}

	public adb(...args: string[]): Buffer {
		return execFileSync(getAdbPath(), ["-s", this.deviceId, ...args], {
			timeout: TIMEOUT,
			maxBuffer: MAX_BUFFER_SIZE,
		});
	}

	public silentAdb(...args: string[]): Buffer {
		return execFileSync(getAdbPath(), ["-s", this.deviceId, ...args], {
			timeout: TIMEOUT,
			maxBuffer: MAX_BUFFER_SIZE,
			stdio: ["pipe", "pipe", "pipe"],
		});
	}

	public getSystemFeatures(): string[] {
		return this.adb("shell", "pm", "list", "features")
			.toString()
			.split("\n")
			.map(line => line.trim())
			.filter(line => line.startsWith("feature:"))
			.map(line => line.substring("feature:".length));
	}

	public async getScreenSize(): Promise<ScreenSize> {
		const screenSize = this.adb("shell", "wm", "size").toString().split(" ").pop();
		if (!screenSize) {
			throw new ActionableError("Failed to get Android screen size");
		}

		const [width, height] = screenSize.split("x").map(Number);
		return { width, height, scale: 1 };
	}

	public async listApps(): Promise<InstalledApp[]> {
		return this.adb("shell", "cmd", "package", "query-activities", "-a", "android.intent.action.MAIN", "-c", "android.intent.category.LAUNCHER")
			.toString()
			.split("\n")
			.map(line => line.trim())
			.filter(line => line.startsWith("packageName="))
			.map(line => line.substring("packageName=".length))
			.filter((value, index, self) => self.indexOf(value) === index)
			.map(packageName => ({ packageName, appName: packageName }));
	}

	private async listPackages(): Promise<string[]> {
		return this.adb("shell", "pm", "list", "packages")
			.toString()
			.split("\n")
			.map(line => line.trim())
			.filter(line => line.startsWith("package:"))
			.map(line => line.substring("package:".length));
	}

	public async launchApp(packageName: string, locale?: string): Promise<void> {
		validatePackageName(packageName);
		if (locale) {
			validateLocale(locale);
			try {
				this.silentAdb("shell", "cmd", "locale", "set-app-locales", packageName, "--locales", locale);
			} catch {
				// older Android versions do not support this command
			}
		}

		try {
			this.silentAdb("shell", "monkey", "-p", packageName, "-c", "android.intent.category.LAUNCHER", "1");
		} catch {
			throw new ActionableError(`Failed launching app with package name "${packageName}", please make sure it exists`);
		}
	}

	public async terminateApp(packageName: string): Promise<void> {
		validatePackageName(packageName);
		this.adb("shell", "am", "force-stop", packageName);
	}

	public async installApp(installPath: string): Promise<void> {
		try {
			this.adb("install", "-r", installPath);
		} catch (error: any) {
			const stdout = error.stdout ? error.stdout.toString() : "";
			const stderr = error.stderr ? error.stderr.toString() : "";
			throw new ActionableError((stdout + stderr).trim() || error.message);
		}
	}

	public async uninstallApp(bundleId: string): Promise<void> {
		try {
			this.adb("uninstall", bundleId);
		} catch (error: any) {
			const stdout = error.stdout ? error.stdout.toString() : "";
			const stderr = error.stderr ? error.stderr.toString() : "";
			throw new ActionableError((stdout + stderr).trim() || error.message);
		}
	}

	private escapeShellText(text: string): string {
		return text.replace(/[\\'"` \t\n\r|&;()<>\{\}\[\]\$\*\?]/g, "\\$&");
	}

	public async openUrl(url: string): Promise<void> {
		this.adb("shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", this.escapeShellText(url));
	}

	private isAscii(text: string): boolean {
		return /^[\x00-\x7F]*$/.test(text);
	}

	private async isDeviceKitInstalled(): Promise<boolean> {
		const packages = await this.listPackages();
		return packages.includes("com.mobilenext.devicekit");
	}

	public async sendKeys(text: string): Promise<void> {
		if (text === "") {
			return;
		}

		if (this.isAscii(text)) {
			this.adb("shell", "input", "text", this.escapeShellText(text));
			return;
		}

		if (await this.isDeviceKitInstalled()) {
			const base64 = Buffer.from(text).toString("base64");
			this.adb("shell", "am", "broadcast", "-a", "devicekit.clipboard.set", "-e", "encoding", "base64", "-e", "text", base64, "-n", "com.mobilenext.devicekit/.ClipboardBroadcastReceiver");
			this.adb("shell", "input", "keyevent", "KEYCODE_PASTE");
			this.adb("shell", "am", "broadcast", "-a", "devicekit.clipboard.clear", "-n", "com.mobilenext.devicekit/.ClipboardBroadcastReceiver");
			return;
		}

		throw new ActionableError("Non-ASCII text is not supported on Android, please install mobilenext devicekit");
	}

	public async pressButton(button: Button): Promise<void> {
		const mapped = BUTTON_MAP[button];
		if (!mapped) {
			throw new ActionableError(`Button "${button}" is not supported`);
		}

		this.adb("shell", "input", "keyevent", mapped);
	}

	public async tap(x: number, y: number): Promise<void> {
		this.adb("shell", "input", "tap", `${x}`, `${y}`);
	}

	public async doubleTap(x: number, y: number): Promise<void> {
		await this.tap(x, y);
		await new Promise(resolve => setTimeout(resolve, 100));
		await this.tap(x, y);
	}

	public async longPress(x: number, y: number, duration: number): Promise<void> {
		this.adb("shell", "input", "swipe", `${x}`, `${y}`, `${x}`, `${y}`, `${duration}`);
	}

	public async swipe(direction: SwipeDirection): Promise<void> {
		const screenSize = await this.getScreenSize();
		const centerX = screenSize.width >> 1;
		let x0: number;
		let y0: number;
		let x1: number;
		let y1: number;

		switch (direction) {
			case "up":
				x0 = x1 = centerX;
				y0 = Math.floor(screenSize.height * 0.8);
				y1 = Math.floor(screenSize.height * 0.2);
				break;
			case "down":
				x0 = x1 = centerX;
				y0 = Math.floor(screenSize.height * 0.2);
				y1 = Math.floor(screenSize.height * 0.8);
				break;
			case "left":
				x0 = Math.floor(screenSize.width * 0.8);
				x1 = Math.floor(screenSize.width * 0.2);
				y0 = y1 = Math.floor(screenSize.height * 0.5);
				break;
			case "right":
				x0 = Math.floor(screenSize.width * 0.2);
				x1 = Math.floor(screenSize.width * 0.8);
				y0 = y1 = Math.floor(screenSize.height * 0.5);
				break;
		}

		this.adb("shell", "input", "swipe", `${x0}`, `${y0}`, `${x1}`, `${y1}`, "1000");
	}

	public async swipeFromCoordinate(x: number, y: number, direction: SwipeDirection, distance?: number): Promise<void> {
		const screenSize = await this.getScreenSize();
		const verticalDistance = distance || Math.floor(screenSize.height * 0.3);
		const horizontalDistance = distance || Math.floor(screenSize.width * 0.3);
		let x1 = x;
		let y1 = y;

		switch (direction) {
			case "up":
				y1 = Math.max(0, y - verticalDistance);
				break;
			case "down":
				y1 = Math.min(screenSize.height, y + verticalDistance);
				break;
			case "left":
				x1 = Math.max(0, x - horizontalDistance);
				break;
			case "right":
				x1 = Math.min(screenSize.width, x + horizontalDistance);
				break;
		}

		this.adb("shell", "input", "swipe", `${x}`, `${y}`, `${x1}`, `${y1}`, "1000");
	}

	private getDisplayCount(): number {
		return this.adb("shell", "dumpsys", "SurfaceFlinger", "--display-id")
			.toString()
			.split("\n")
			.filter(line => line.startsWith("Display "))
			.length;
	}

	private getFirstDisplayId(): string | null {
		try {
			const displays = this.adb("shell", "cmd", "display", "get-displays")
				.toString()
				.split("\n")
				.filter(line => line.startsWith("Display id "))
				.filter(line => line.includes(", state ON,"))
				.filter(line => line.includes(", uniqueId "));

			if (displays.length > 0) {
				const match = displays[0].match(/uniqueId \"([^\"]+)\"/);
				if (match) {
					return match[1].startsWith("local:") ? match[1].substring("local:".length) : match[1];
				}
			}
		} catch {
			// ignore
		}

		try {
			const dumpsys = this.adb("shell", "dumpsys", "display").toString();
			const viewportMatch = dumpsys.match(/DisplayViewport\{type=INTERNAL[^}]*isActive=true[^}]*uniqueId='([^']+)'/);
			if (viewportMatch) {
				return viewportMatch[1].startsWith("local:") ? viewportMatch[1].substring("local:".length) : viewportMatch[1];
			}

			const displayStateMatch = dumpsys.match(/Display Id=(\d+)[\s\S]*?Display State=ON/);
			if (displayStateMatch) {
				return displayStateMatch[1];
			}
		} catch {
			// ignore
		}

		return null;
	}

	public async getScreenshot(): Promise<Buffer> {
		if (this.getDisplayCount() <= 1) {
			return this.adb("exec-out", "screencap", "-p");
		}

		const displayId = this.getFirstDisplayId();
		return displayId === null
			? this.adb("exec-out", "screencap", "-p")
			: this.adb("exec-out", "screencap", "-p", "-d", `${displayId}`);
	}

	private getScreenElementRect(node: UiAutomatorNode): ScreenElementRect {
		const bounds = String(node.bounds || "");
		const match = bounds.match(/^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/);
		if (!match) {
			return { x: 0, y: 0, width: 0, height: 0 };
		}

		const [, left, top, right, bottom] = match.map(Number);
		return { x: left, y: top, width: right - left, height: bottom - top };
	}

	private collectElement(node: UiAutomatorNode): ScreenElement | null {
		if (!node.text && !node["content-desc"] && !node.hint && !node["resource-id"] && node.checkable !== "true") {
			return null;
		}

		const rect = this.getScreenElementRect(node);
		if (rect.width <= 0 || rect.height <= 0) {
			return null;
		}

		const element: ScreenElement = {
			type: node.class || "text",
			text: node.text,
			label: node["content-desc"] || node.hint || "",
			rect,
		};

		if (node.focused === "true") {
			element.focused = true;
		}

		if (node["resource-id"]) {
			element.identifier = node["resource-id"];
		}

		return element;
	}

	private async getUiAutomatorDump(): Promise<string> {
		for (let tries = 0; tries < 10; tries += 1) {
			const dump = this.adb("exec-out", "uiautomator", "dump", "/dev/tty").toString();
			if (!dump.includes("null root node returned by UiTestAutomationBridge")) {
				return dump.substring(dump.indexOf("<?xml"));
			}
		}

		throw new ActionableError("Failed to get UIAutomator XML");
	}

	public async getElementsOnScreen(): Promise<ScreenElement[]> {
		const dump = await this.getUiAutomatorDump();
		return parseUiAutomatorNodes(dump)
			.map(node => this.collectElement(node))
			.filter((element): element is ScreenElement => element !== null);
	}

	public async setOrientation(orientation: Orientation): Promise<void> {
		const value = orientation === "portrait" ? 0 : 1;
		this.adb("shell", "settings", "put", "system", "accelerometer_rotation", "0");
		this.adb("shell", "content", "insert", "--uri", "content://settings/system", "--bind", "name:s:user_rotation", "--bind", `value:i:${value}`);
	}

	public async getOrientation(): Promise<Orientation> {
		const rotation = this.adb("shell", "settings", "get", "system", "user_rotation").toString().trim();
		return rotation === "0" ? "portrait" : "landscape";
	}
}

export class AndroidDeviceManager {
	private getDeviceType(deviceId: string): "tv" | "mobile" {
		try {
			const device = new AndroidRobot(deviceId);
			const features = device.getSystemFeatures();
			if (features.includes("android.software.leanback") || features.includes("android.hardware.type.television")) {
				return "tv";
			}
		} catch {
			// ignore
		}

		return "mobile";
	}

	private getDeviceVersion(deviceId: string): string {
		try {
			return execFileSync(getAdbPath(), ["-s", deviceId, "shell", "getprop", "ro.build.version.release"], { timeout: 5000 }).toString().trim();
		} catch {
			return "unknown";
		}
	}

	private getDeviceName(deviceId: string): string {
		try {
			const avdName = execFileSync(getAdbPath(), ["-s", deviceId, "shell", "getprop", "ro.boot.qemu.avd_name"], { timeout: 5000 }).toString().trim();
			if (avdName !== "") {
				return avdName.replace(/_/g, " ");
			}

			return execFileSync(getAdbPath(), ["-s", deviceId, "shell", "getprop", "ro.product.model"], { timeout: 5000 }).toString().trim();
		} catch {
			return deviceId;
		}
	}

	public getConnectedDevices(): AndroidDevice[] {
		try {
			return execFileSync(getAdbPath(), ["devices"])
				.toString()
				.split("\n")
				.map(line => line.trim())
				.filter(line => line !== "")
				.filter(line => !line.startsWith("List of devices attached"))
				.filter(line => line.split("\t")[1]?.trim() === "device")
				.map(line => line.split("\t")[0])
				.map(deviceId => ({ deviceId, deviceType: this.getDeviceType(deviceId) }));
		} catch {
			console.error("Could not execute adb command, maybe ANDROID_HOME is not set?");
			return [];
		}
	}

	public getConnectedDevicesWithDetails(): Array<AndroidDevice & { version: string; name: string }> {
		return this.getConnectedDevices().map(device => ({
			...device,
			version: this.getDeviceVersion(device.deviceId),
			name: this.getDeviceName(device.deviceId),
		}));
	}
}
