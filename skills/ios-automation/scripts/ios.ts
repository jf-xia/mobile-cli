import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { getGoIosPath, getWdaPort, getTunnelPort, getWdaStartTimeout, getWdaDerivedDataPath, isListeningOnPort } from "./config.ts";
import { StatusCache } from "./status-cache.ts";
import { logTiming } from "./timing-logger.ts";
import { WebDriverAgent } from "./webdriver-agent.ts";
import { ActionableError, type Button, type InstalledApp, type Orientation, type Robot, type ScreenElement, type ScreenSize, type SwipeDirection } from "./robot.ts";
import { validateLocale, validatePackageName } from "./utils.ts";

const statusCache = new StatusCache(5000);

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

export class IosRobot implements Robot {
	private readonly deviceId: string;
	private static iosVersionCache = new Map<string, { version: string; checkedAt: number }>();
	private static readonly VERSION_CACHE_TTL = 60000; // 60 seconds

	public constructor(deviceId: string, cachedVersion?: string) {
		this.deviceId = deviceId;
		if (cachedVersion) {
			IosRobot.iosVersionCache.set(deviceId, { version: cachedVersion, checkedAt: Date.now() });
		}
	}

	private async isTunnelRunning(): Promise<boolean> {
		return statusCache.check("tunnel", () => isListeningOnPort(getTunnelPort()));
	}

	private async isWdaForwardRunning(): Promise<boolean> {
		return statusCache.check("wda-forward", () => isListeningOnPort(getWdaPort()));
	}

	private async assertTunnelRunning(): Promise<void> {
		if (await this.isTunnelRequired() && !(await this.isTunnelRunning())) {
			throw new ActionableError("iOS tunnel is not running");
		}
	}

	private async wda(): Promise<WebDriverAgent> {
		const _t0 = performance.now();
		await this.assertTunnelRunning();

		if (!(await this.isWdaForwardRunning())) {
			logTiming("ios.ts", "wda", performance.now() - _t0, "error", "port forward not running");
			throw new ActionableError(
				"Port forwarding to WebDriverAgent is not running.\n" +
				"Run: ./scripts/ios-automation.ts forward:start --device " + this.deviceId
			);
		}

		const wda = new WebDriverAgent("localhost", getWdaPort());
		if (await wda.isRunning()) {
			logTiming("ios.ts", "wda", performance.now() - _t0, "ok", "already running");
			return wda;
		}

		const wdaPath = process.env.IOS_WDA_PATH || path.join(os.homedir(), "work", "WebDriverAgent");
		const projectFile = path.join(wdaPath, "WebDriverAgent.xcodeproj");

		if (!fs.existsSync(wdaPath) || !fs.existsSync(projectFile)) {
			logTiming("ios.ts", "wda", performance.now() - _t0, "error", "project not found");
			throw new ActionableError(
				"WebDriverAgent project not found at " + wdaPath + ".\n" +
				"Clone it: cd ~/work && git clone https://github.com/nicklama/WebDriverAgent.git"
			);
		}

		const derivedDataPath = getWdaDerivedDataPath();
		const buildProductPath = path.join(derivedDataPath, "Build", "Products", "Debug-iphoneos", "WebDriverAgentRunner-Runner.app");
		const isBuilt = fs.existsSync(buildProductPath);
		const buildCmd = isBuilt ? "test-without-building" : "test";

		logTiming("ios.ts", "wda", 0, "ok", `starting ${buildCmd} (built=${isBuilt})`);

		try {
			const timeoutMs = getWdaStartTimeout();
			const args = [
				"-project", "WebDriverAgent.xcodeproj",
				"-scheme", "WebDriverAgentRunner",
				"-destination", `id=${this.deviceId}`,
				"-derivedDataPath", derivedDataPath,
				buildCmd,
			];

			const child = spawn("xcodebuild", args, { cwd: wdaPath, detached: true, stdio: ["ignore", "ignore", "pipe"], env: process.env });
			let xcodebuildExited = false;
			let xcodebuildExitCode: number | null = null;
			let xcodebuildError = "";
			child.stderr?.on("data", (data: Buffer) => { xcodebuildError += data.toString().slice(-500); });
			child.on("exit", (code) => {
				xcodebuildExited = true;
				xcodebuildExitCode = code;
			});
			if (child.pid) {
				child.unref();
			}

			const deadline = Date.now() + timeoutMs;
			while (Date.now() < deadline) {
				if (xcodebuildExited) {
					const errorMsg = xcodebuildError.includes("not trusted") ? "Developer certificate not trusted. Go to Settings > General > VPN & Device Management and trust the certificate." : xcodebuildError.slice(-200);
					logTiming("ios.ts", "wda", performance.now() - _t0, "error", `xcodebuild exited code ${xcodebuildExitCode}`);
					throw new ActionableError(`WDA build failed (exit code ${xcodebuildExitCode}). ${errorMsg}`);
				}
				if (await wda.isRunning()) {
					statusCache.invalidate("wda-running");
					const elapsed = Math.round((performance.now() - _t0) / 1000);
					logTiming("ios.ts", "wda", performance.now() - _t0, "ok", `${buildCmd} succeeded in ${elapsed}s`);
					return wda;
				}
				await new Promise(resolve => setTimeout(resolve, 1000));
			}
		} catch (err) {
			// fallthrough to error below
		}

		logTiming("ios.ts", "wda", performance.now() - _t0, "error", "timeout");
		throw new ActionableError(
			"WebDriverAgent is not running on the device.\n" +
			"Possible solutions:\n" +
			"1. Run: ./scripts/ios-automation.ts setup --device " + this.deviceId + " --wda\n" +
			"2. Check Xcode is installed: xcodebuild -version\n" +
			"3. Check device is trusted for development\n" +
			"4. Clean build and retry: rm -rf " + derivedDataPath
		);
	}

	private async ios(...args: string[]): Promise<string> {
		const _t0 = performance.now();
		const output = execFileSync(getGoIosPath(), ["--udid", this.deviceId, ...args]).toString();
		logTiming("ios.ts", `go-ios:${args[0]}`, performance.now() - _t0);
		return output;
	}

	public async getIosVersion(): Promise<string> {
		const cached = IosRobot.iosVersionCache.get(this.deviceId);
		if (cached && Date.now() - cached.checkedAt < IosRobot.VERSION_CACHE_TTL) {
			return cached.version;
		}
		const output = await this.ios("info");
		const json = JSON.parse(output) as { ProductVersion: string };
		IosRobot.iosVersionCache.set(this.deviceId, { version: json.ProductVersion, checkedAt: Date.now() });
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
		const _t0 = performance.now();
		await this.assertTunnelRunning();
		const output = await this.ios("apps", "--all", "--list");
		const apps = output.split("\n").filter(Boolean).map(line => {
			const [packageName, ...rest] = line.split(" ");
			return { packageName, appName: rest.join(" ") || packageName };
		});
		logTiming("ios.ts", "listApps", performance.now() - _t0, "ok", `${apps.length} apps`);
		return apps;
	}

	public async launchApp(packageName: string, locale?: string): Promise<void> {
		const _t0 = performance.now();
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
		logTiming("ios.ts", "launchApp", performance.now() - _t0, "ok", packageName);
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
	private static deviceCache: { devices: IosDevice[]; details: Array<IosDevice & { version: string }>; timestamp: number } | null = null;
	private static readonly CACHE_TTL = 5000; // 5 seconds

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

	private rebuildCache(): void {
		const output = execFileSync(getGoIosPath(), ["list"]).toString();
		const json = JSON.parse(output) as ListCommandOutput;
		const details = json.deviceList.map(deviceId => {
			const info = this.getDeviceInfo(deviceId);
			return {
				deviceId,
				deviceName: info.DeviceName,
				version: info.ProductVersion,
			};
		});
		const devices = details.map(({ deviceId, deviceName }) => ({ deviceId, deviceName }));
		IosManager.deviceCache = { devices, details, timestamp: Date.now() };
	}

	public listDevices(): IosDevice[] {
		if (!this.isGoIosInstalled()) {
			return [];
		}
		const now = Date.now();
		if (IosManager.deviceCache && now - IosManager.deviceCache.timestamp < IosManager.CACHE_TTL) {
			return IosManager.deviceCache.devices;
		}
		this.rebuildCache();
		return IosManager.deviceCache!.devices;
	}

	public listDevicesWithDetails(): Array<IosDevice & { version: string }> {
		if (!this.isGoIosInstalled()) {
			return [];
		}
		const now = Date.now();
		if (IosManager.deviceCache && now - IosManager.deviceCache.timestamp < IosManager.CACHE_TTL) {
			return IosManager.deviceCache.details;
		}
		this.rebuildCache();
		return IosManager.deviceCache!.details;
	}
}
