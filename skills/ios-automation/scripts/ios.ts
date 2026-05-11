import { Socket } from "node:net";
import { execFileSync } from "node:child_process";

import { WebDriverAgent } from "./webdriver-agent.ts";
import { ActionableError, type Button, type InstalledApp, type Orientation, type Robot, type ScreenElement, type ScreenSize, type SwipeDirection } from "./robot.ts";
import { validateLocale, validatePackageName } from "./utils.ts";

const getWdaPort = (): number => Number(process.env.IOS_AUTOMATION_WDA_PORT || 8100);
const getTunnelPort = (): number => Number(process.env.IOS_AUTOMATION_TUNNEL_PORT || 60105);

interface ListCommandOutput {
	deviceList: string[];
}

interface VersionCommandOutput {
	version: string;
}

interface InfoCommandOutput {
	DeviceName: string;
	ProductVersion: string;
}

export interface IosDevice {
	deviceId: string;
	deviceName: string;
}

const getGoIosPath = (): string => process.env.GO_IOS_PATH || "ios";

export class IosRobot implements Robot {
	private readonly deviceId: string;

	public constructor(deviceId: string) {
		this.deviceId = deviceId;
	}

	private isListeningOnPort(port: number): Promise<boolean> {
		return new Promise(resolve => {
			const client = new Socket();
			client.connect(port, "localhost", () => {
				client.destroy();
				resolve(true);
			});
			client.on("error", () => {
				resolve(false);
			});
		});
	}

	private async isTunnelRunning(): Promise<boolean> {
		return this.isListeningOnPort(getTunnelPort());
	}

	private async isWdaForwardRunning(): Promise<boolean> {
		return this.isListeningOnPort(getWdaPort());
	}

	private async assertTunnelRunning(): Promise<void> {
		if (await this.isTunnelRequired() && !(await this.isTunnelRunning())) {
			throw new ActionableError("iOS tunnel is not running");
		}
	}

	private async wda(): Promise<WebDriverAgent> {
		await this.assertTunnelRunning();
		if (!(await this.isWdaForwardRunning())) {
			throw new ActionableError("Port forwarding to WebDriverAgent is not running");
		}

		const wda = new WebDriverAgent("localhost", getWdaPort());
		if (!(await wda.isRunning())) {
			throw new ActionableError("WebDriverAgent is not running on the device");
		}

		return wda;
	}

	private async ios(...args: string[]): Promise<string> {
		return execFileSync(getGoIosPath(), ["--udid", this.deviceId, ...args]).toString();
	}

	public async getIosVersion(): Promise<string> {
		const output = await this.ios("info");
		const json = JSON.parse(output) as { ProductVersion: string };
		return json.ProductVersion;
	}

	private async isTunnelRequired(): Promise<boolean> {
		const version = await this.getIosVersion();
		return parseInt(version.split(".")[0], 10) >= 17;
	}

	public async getScreenSize(): Promise<ScreenSize> {
		return (await this.wda()).getScreenSize();
	}

	public async swipe(direction: SwipeDirection): Promise<void> {
		await (await this.wda()).swipe(direction);
	}

	public async swipeFromCoordinate(x: number, y: number, direction: SwipeDirection, distance?: number): Promise<void> {
		await (await this.wda()).swipeFromCoordinate(x, y, direction, distance);
	}

	public async listApps(): Promise<InstalledApp[]> {
		await this.assertTunnelRunning();
		const output = await this.ios("apps", "--all", "--list");
		return output.split("\n").filter(Boolean).map(line => {
			const [packageName, ...rest] = line.split(" ");
			return { packageName, appName: rest.join(" ") || packageName };
		});
	}

	public async launchApp(packageName: string, locale?: string): Promise<void> {
		validatePackageName(packageName);
		await this.assertTunnelRunning();
		const args = ["launch", packageName];
		if (locale) {
			validateLocale(locale);
			const locales = locale.split(",").map(value => value.trim());
			args.push("-AppleLanguages", `(${locales.join(", ")})`);
			args.push("-AppleLocale", locales[0]);
		}

		await this.ios(...args);
	}

	public async terminateApp(packageName: string): Promise<void> {
		validatePackageName(packageName);
		await this.assertTunnelRunning();
		await this.ios("kill", packageName);
	}

	public async installApp(installPath: string): Promise<void> {
		await this.assertTunnelRunning();
		try {
			await this.ios("install", "--path", installPath);
		} catch (error: any) {
			const stdout = error.stdout ? error.stdout.toString() : "";
			const stderr = error.stderr ? error.stderr.toString() : "";
			throw new ActionableError((stdout + stderr).trim() || error.message);
		}
	}

	public async uninstallApp(bundleId: string): Promise<void> {
		await this.assertTunnelRunning();
		try {
			await this.ios("uninstall", "--bundleid", bundleId);
		} catch (error: any) {
			const stdout = error.stdout ? error.stdout.toString() : "";
			const stderr = error.stderr ? error.stderr.toString() : "";
			throw new ActionableError((stdout + stderr).trim() || error.message);
		}
	}

	public async openUrl(url: string): Promise<void> {
		await (await this.wda()).openUrl(url);
	}

	public async sendKeys(text: string): Promise<void> {
		await (await this.wda()).sendKeys(text);
	}

	public async pressButton(button: Button): Promise<void> {
		await (await this.wda()).pressButton(button);
	}

	public async tap(x: number, y: number): Promise<void> {
		await (await this.wda()).tap(x, y);
	}

	public async doubleTap(x: number, y: number): Promise<void> {
		await (await this.wda()).doubleTap(x, y);
	}

	public async longPress(x: number, y: number, duration: number): Promise<void> {
		await (await this.wda()).longPress(x, y, duration);
	}

	public async getElementsOnScreen(): Promise<ScreenElement[]> {
		return (await this.wda()).getElementsOnScreen();
	}

	public async getScreenshot(): Promise<Buffer> {
		return (await this.wda()).getScreenshot();
	}

	public async setOrientation(orientation: Orientation): Promise<void> {
		await (await this.wda()).setOrientation(orientation);
	}

	public async getOrientation(): Promise<Orientation> {
		return (await this.wda()).getOrientation();
	}
}

export class IosManager {
	public isGoIosInstalled(): boolean {
		try {
			const output = execFileSync(getGoIosPath(), ["version"], { stdio: ["pipe", "pipe", "ignore"] }).toString();
			const json = JSON.parse(output) as VersionCommandOutput;
			return json.version !== undefined && (json.version.startsWith("v") || json.version === "local-build");
		} catch {
			return false;
		}
	}

	public getDeviceName(deviceId: string): string {
		const output = execFileSync(getGoIosPath(), ["info", "--udid", deviceId]).toString();
		return (JSON.parse(output) as InfoCommandOutput).DeviceName;
	}

	public getDeviceInfo(deviceId: string): InfoCommandOutput {
		const output = execFileSync(getGoIosPath(), ["info", "--udid", deviceId]).toString();
		return JSON.parse(output) as InfoCommandOutput;
	}

	public listDevices(): IosDevice[] {
		if (!this.isGoIosInstalled()) {
			return [];
		}

		const output = execFileSync(getGoIosPath(), ["list"]).toString();
		const json = JSON.parse(output) as ListCommandOutput;
		return json.deviceList.map(deviceId => ({
			deviceId,
			deviceName: this.getDeviceName(deviceId),
		}));
	}

	public listDevicesWithDetails(): Array<IosDevice & { version: string }> {
		if (!this.isGoIosInstalled()) {
			return [];
		}

		const output = execFileSync(getGoIosPath(), ["list"]).toString();
		const json = JSON.parse(output) as ListCommandOutput;
		return json.deviceList.map(deviceId => {
			const info = this.getDeviceInfo(deviceId);
			return {
				deviceId,
				deviceName: info.DeviceName,
				version: info.ProductVersion,
			};
		});
	}
}
