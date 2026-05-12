import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { IosManager, IosRobot } from "./ios.ts";
import { MobileDevice } from "./mobile-device.ts";
import { Mobilecli, type MobilecliDevicesResponse } from "./mobilecli.ts";
import { PNG } from "./png.ts";
import { RecordingStateStore, isProcessRunning, type RecordingStateEntry } from "./recording-state.ts";
import { ActionableError, type Button, type Orientation, type Robot, type ScreenElement, type ScreenSize, type SwipeDirection } from "./robot.ts";
import { validateFileExtension, validateOutputPath } from "./utils.ts";

const ALLOWED_SCREENSHOT_EXTENSIONS = [".png", ".jpg", ".jpeg"];
const ALLOWED_RECORDING_EXTENSIONS = [".mp4"];
const STOP_RECORDING_TIMEOUT_MS = 5 * 60 * 1000;
const STOP_RECORDING_POLL_MS = 200;

const sleep = async (ms: number): Promise<void> => {
	await new Promise(resolve => setTimeout(resolve, ms));
};

const parseJsonIfPossible = (value: string): unknown => {
	try {
		return JSON.parse(value);
	} catch {
		return value;
	}
};

export class IosAutomationService {
	private readonly mobilecli: Mobilecli;
	private readonly recordings: RecordingStateStore;
	private readonly verifiedSimulators = new Set<string>();

	public constructor(mobilecli = new Mobilecli(), recordings = new RecordingStateStore()) {
		this.mobilecli = mobilecli;
		this.recordings = recordings;
	}

	private ensureMobilecliAvailable(): void {
		const version = this.mobilecli.getVersion();
		if (version.startsWith("failed")) {
			throw new ActionableError("mobilecli is not available or not working properly");
		}
	}

	private getSimulatorDevices(): MobilecliDevicesResponse {
		this.ensureMobilecliAvailable();
		return this.mobilecli.getDevices({ platform: "ios", type: "simulator", includeOffline: false });
	}

	private getRobotFromDevice(deviceId: string): Robot {
		const iosManager = new IosManager();
		if (iosManager.listDevices().some(device => device.deviceId === deviceId)) {
			return new IosRobot(deviceId);
		}

		const simulator = this.getSimulatorDevices().data.devices.find(device => device.id === deviceId);
		if (simulator) {
			if (!this.verifiedSimulators.has(deviceId)) {
				const agentStatus = this.mobilecli.agentStatus(deviceId);
				if (agentStatus.status === "fail") {
					this.mobilecli.agentInstall(deviceId);
				}
				this.verifiedSimulators.add(deviceId);
			}

			return new MobileDevice(deviceId);
		}

		// Device not found - provide helpful error
		const allDevices = this.listAvailableDevices();
		const available = allDevices.devices.map(d => `  - ${d.name} (${d.id}) [${d.type}]`).join("\n");
		throw new ActionableError(
			`iOS device "${deviceId}" not found.\n\nAvailable devices:\n${available}\n\nRun 'devices:list' to see all devices.`
		);
	}

	public doctor() {
		const mobilecliVersion = this.mobilecli.getVersion();
		const iosManager = new IosManager();
		const simulators = !mobilecliVersion.startsWith("failed") ? this.mobilecli.getDevices({ platform: "ios", type: "simulator", includeOffline: false }).data.devices : [];

		// Check tunnel and port forwarding status for real device automation
		const isPortListening = (port: number): boolean => {
			try {
				execFileSync("lsof", ["-ti", String(port)], { stdio: ["pipe", "pipe", "ignore"] });
				return true;
			} catch {
				return false;
			}
		};

		const tunnelPort = Number(process.env.IOS_AUTOMATION_TUNNEL_PORT || 60105);
		const wdaPort = Number(process.env.IOS_AUTOMATION_WDA_PORT || 8100);

		const realDeviceCount = iosManager.listDevices().length;
		const setupTips = [] as string[];

		if (realDeviceCount > 0) {
			const tunnelRunning = isPortListening(tunnelPort);
			const wdaForwardRunning = isPortListening(wdaPort);

			if (!tunnelRunning) {
				setupTips.push(`Tunnel not running. Run: tunnel:start`);
			}
			if (tunnelRunning && !wdaForwardRunning) {
				setupTips.push(`Port forwarding not running. Run: forward:start --device <device-id>`);
			}
			if (!wdaForwardRunning) {
				setupTips.push(`WDA not available. For UI interaction run: setup --device <device-id> --wda`);
			}
		}

		return {
			nodeVersion: process.version,
			platform: process.platform,
			dependencies: {
				mobilecli: {
					available: !mobilecliVersion.startsWith("failed"),
					version: mobilecliVersion.startsWith("failed") ? null : mobilecliVersion,
				},
				goIos: {
					available: iosManager.isGoIosInstalled(),
					realDevices: realDeviceCount,
				},
				simulators: {
					count: simulators.length,
				},
			},
			stateFile: process.env.IOS_AUTOMATION_RECORDING_STATE_FILE || process.env.IOS_AUTOMATION_STATE_FILE || path.join(os.tmpdir(), "ios-automation-recordings.json"),
			...(setupTips.length > 0 ? { setupTips } : {}),
		};
	}

	public listAvailableDevices() {
		const iosManager = new IosManager();
		const devices = iosManager.listDevicesWithDetails().map(device => ({
			id: device.deviceId,
			name: device.deviceName,
			platform: "ios",
			type: "real",
			version: device.version,
			state: "online",
		}));

		for (const simulator of this.getSimulatorDevices().data.devices) {
			devices.push({
				id: simulator.id,
				name: simulator.name,
				platform: "ios",
				type: simulator.type,
				version: simulator.version,
				state: "online",
			});
		}

		return { devices };
	}

	public listRemoteDevices() {
		this.ensureMobilecliAvailable();
		return { result: parseJsonIfPossible(this.mobilecli.remoteListDevices()) };
	}

	public allocateRemoteDevice(platform: "ios" | "android") {
		this.ensureMobilecliAvailable();
		return { result: parseJsonIfPossible(this.mobilecli.remoteAllocate(platform)) };
	}

	public releaseRemoteDevice(device: string) {
		this.ensureMobilecliAvailable();
		return { result: parseJsonIfPossible(this.mobilecli.remoteRelease(device)) };
	}

	public async listApps(device: string) {
		return { apps: await this.getRobotFromDevice(device).listApps() };
	}

	public async launchApp(device: string, packageName: string, locale?: string) {
		await this.getRobotFromDevice(device).launchApp(packageName, locale);
		return { device, packageName, locale: locale ?? null };
	}

	public async terminateApp(device: string, packageName: string) {
		await this.getRobotFromDevice(device).terminateApp(packageName);
		return { device, packageName };
	}

	public async installApp(device: string, installPath: string) {
		await this.getRobotFromDevice(device).installApp(installPath);
		return { device, path: installPath };
	}

	public async uninstallApp(device: string, bundleId: string) {
		await this.getRobotFromDevice(device).uninstallApp(bundleId);
		return { device, bundleId };
	}

	public async getScreenSize(device: string): Promise<{ screenSize: ScreenSize }> {
		return { screenSize: await this.getRobotFromDevice(device).getScreenSize() };
	}

	public async tap(device: string, x: number, y: number) {
		await this.getRobotFromDevice(device).tap(x, y);
		return { device, x, y };
	}

	public async doubleTap(device: string, x: number, y: number) {
		await this.getRobotFromDevice(device).doubleTap(x, y);
		return { device, x, y };
	}

	public async longPress(device: string, x: number, y: number, duration: number) {
		await this.getRobotFromDevice(device).longPress(x, y, duration);
		return { device, x, y, duration };
	}

	public async listElements(device: string): Promise<{ elements: ScreenElement[] }> {
		return { elements: await this.getRobotFromDevice(device).getElementsOnScreen() };
	}

	public async pressButton(device: string, button: Button) {
		await this.getRobotFromDevice(device).pressButton(button);
		return { device, button };
	}

	public async openUrl(device: string, url: string) {
		const allowUnsafeUrls = process.env.IOS_AUTOMATION_ALLOW_UNSAFE_URLS === "1";
		if (!allowUnsafeUrls && !url.startsWith("http://") && !url.startsWith("https://")) {
			throw new ActionableError("Only http:// and https:// URLs are allowed. Set IOS_AUTOMATION_ALLOW_UNSAFE_URLS=1 to allow other schemes.");
		}

		await this.getRobotFromDevice(device).openUrl(url);
		return { device, url };
	}

	public async swipe(device: string, direction: SwipeDirection, x?: number, y?: number, distance?: number) {
		const robot = this.getRobotFromDevice(device);
		if ((x === undefined) !== (y === undefined)) {
			throw new ActionableError("x and y must be provided together for coordinate-based swipe");
		}

		if (x !== undefined && y !== undefined) {
			await robot.swipeFromCoordinate(x, y, direction, distance);
			return { device, direction, x, y, distance: distance ?? null };
		}

		await robot.swipe(direction);
		return { device, direction };
	}

	public async typeKeys(device: string, text: string, submit: boolean) {
		const robot = this.getRobotFromDevice(device);
		await robot.sendKeys(text);
		if (submit) {
			await robot.pressButton("ENTER");
		}

		return { device, text, submit };
	}

	public async saveScreenshot(device: string, output?: string) {
		const targetPath = output || path.join(os.tmpdir(), `ios-screenshot-${Date.now()}.png`);
		validateFileExtension(targetPath, ALLOWED_SCREENSHOT_EXTENSIONS, "screen:screenshot");
		validateOutputPath(targetPath);

		const screenshot = await this.getRobotFromDevice(device).getScreenshot();
		fs.writeFileSync(targetPath, screenshot);
		const png = new PNG(screenshot).getDimensions();
		return { device, path: targetPath, mimeType: "image/png", width: png.width, height: png.height };
	}

	public async setOrientation(device: string, orientation: Orientation) {
		await this.getRobotFromDevice(device).setOrientation(orientation);
		return { device, orientation };
	}

	public async getOrientation(device: string) {
		return { device, orientation: await this.getRobotFromDevice(device).getOrientation() };
	}

	public async startScreenRecording(device: string, output?: string, timeLimit?: number) {
		this.ensureMobilecliAvailable();
		this.getRobotFromDevice(device);

		const existing = this.recordings.get(device);
		if (existing) {
			if (isProcessRunning(existing.pid)) {
				throw new ActionableError(`Device "${device}" is already being recorded`);
			}

			this.recordings.delete(device);
		}

		const outputPath = output || path.join(os.tmpdir(), `ios-recording-${Date.now()}.mp4`);
		validateFileExtension(outputPath, ALLOWED_RECORDING_EXTENSIONS, "screen:record-start");
		validateOutputPath(outputPath);

		const command = ["screenrecord", "--device", device, "--output", outputPath, "--silent"];
		if (timeLimit !== undefined) {
			command.push("--time-limit", String(timeLimit));
		}

		const child = this.mobilecli.spawnCommand(command, { detached: true });
		if (!child.pid) {
			throw new ActionableError("Failed to start screen recording process");
		}

		child.unref();
		const entry: RecordingStateEntry = { device, pid: child.pid, outputPath, startedAt: Date.now(), command };
		this.recordings.set(entry);
		return { device, outputPath, pid: child.pid, startedAt: entry.startedAt, timeLimit: timeLimit ?? null };
	}

	public async stopScreenRecording(device: string) {
		const recording = this.recordings.get(device);
		if (!recording) {
			throw new ActionableError(`No active recording found for device "${device}"`);
		}

		this.recordings.delete(device);
		let state: "stopped" | "already-finished" | "missing-output" = "already-finished";
		if (isProcessRunning(recording.pid)) {
			state = "stopped";
			process.kill(recording.pid, "SIGINT");
			const deadline = Date.now() + STOP_RECORDING_TIMEOUT_MS;
			while (isProcessRunning(recording.pid) && Date.now() < deadline) {
				await sleep(STOP_RECORDING_POLL_MS);
			}

			if (isProcessRunning(recording.pid)) {
				process.kill(recording.pid, "SIGKILL");
			}
		}

		const durationSeconds = Math.round((Date.now() - recording.startedAt) / 1000);
		if (!fs.existsSync(recording.outputPath)) {
			return { device, outputPath: recording.outputPath, durationSeconds, fileSizeBytes: null, state: "missing-output" };
		}

		return {
			device,
			outputPath: recording.outputPath,
			durationSeconds,
			fileSizeBytes: fs.statSync(recording.outputPath).size,
			state,
		};
	}

	public listCrashes(device: string) {
		this.ensureMobilecliAvailable();
		return { crashes: this.mobilecli.crashesList(device).data };
	}

	public getCrash(device: string, id: string) {
		this.ensureMobilecliAvailable();
		return this.mobilecli.crashesGet(device, id).data;
	}
}
