#!/usr/bin/env -S node --experimental-strip-types
import { IosAutomationService } from "./ios-service.ts";
import { ensureMobilecliInstalled } from "./mobilecli.ts";
import { ActionableError, type Button, type Orientation, type SwipeDirection } from "./robot.ts";
import { getGoIosPath, getWdaPort, getTunnelPort, isListeningOnPort } from "./config.ts";
import { StatusCache } from "./status-cache.ts";
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const statusCache = new StatusCache(3000);

type ParsedOptions = Record<string, string | boolean>;

const printSuccess = (data: unknown): void => {
	console.log(JSON.stringify({ status: "ok", data }, null, 2));
};

const printError = (error: unknown): void => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(JSON.stringify({ status: "error", error: { message } }, null, 2));
	process.exitCode = 1;
};

const parseOptions = (argv: string[]): ParsedOptions => {
	const options: ParsedOptions = {};
	for (let index = 0; index < argv.length; index += 1) {
		const token = argv[index];
		if (!token.startsWith("--")) {
			throw new ActionableError(`Unexpected argument: ${token}`);
		}

		const key = token.substring(2);
		const nextToken = argv[index + 1];
		if (!nextToken || nextToken.startsWith("--")) {
			options[key] = true;
			continue;
		}

		options[key] = nextToken;
		index += 1;
	}

	return options;
};

const readString = (options: ParsedOptions, key: string, required = true): string | undefined => {
	const value = options[key];
	if (value === undefined) {
		if (required) {
			throw new ActionableError(`Missing required option --${key}`);
		}
		return undefined;
	}

	if (typeof value !== "string") {
		throw new ActionableError(`Option --${key} requires a value`);
	}

	return value;
};

const readNumber = (options: ParsedOptions, key: string, required = true): number | undefined => {
	const value = readString(options, key, required);
	if (value === undefined) {
		return undefined;
	}

	const parsed = Number(value);
	if (!Number.isFinite(parsed)) {
		throw new ActionableError(`Option --${key} must be a valid number`);
	}

	return parsed;
};

const readBoolean = (options: ParsedOptions, key: string): boolean => {
	return options[key] === true;
};

const checkTunnelRunning = (): Promise<boolean> => statusCache.check("tunnel", () => isListeningOnPort(getTunnelPort()));
const checkWdaForwardRunning = (): Promise<boolean> => statusCache.check("wda-forward", () => isListeningOnPort(getWdaPort()));

const startTunnel = async (): Promise<{ success: boolean; message: string }> => {
	if (await checkTunnelRunning()) {
		return { success: true, message: "Tunnel already running" };
	}

	try {
		// Kill any existing tunnel process on the port
		try {
			const pid = execFileSync("lsof", ["-ti", String(getTunnelPort())]).toString().trim();
			if (pid) {
				execFileSync("kill", ["-9", pid]);
				await new Promise(resolve => setTimeout(resolve, 1000));
			}
		} catch {
			// No process on port, good
		}

		const child = spawn(getGoIosPath(), ["tunnel", "start", "--userspace"], {
			detached: true,
			stdio: ["ignore", "pipe", "pipe"],
		});

		let output = "";
		child.stdout?.on("data", (data: Buffer) => { output += data.toString(); });
		child.stderr?.on("data", (data: Buffer) => { output += data.toString(); });

		child.unref();

		// Wait for tunnel to start (max 10 seconds)
		const deadline = Date.now() + 10000;
		while (Date.now() < deadline) {
			if (await checkTunnelRunning()) {
				return { success: true, message: "Tunnel started successfully" };
			}
			await new Promise(resolve => setTimeout(resolve, 500));
		}

		return { success: false, message: `Tunnel failed to start: ${output}` };
	} catch (error: any) {
		return { success: false, message: `Tunnel start error: ${error.message}` };
	}
};

const stopTunnel = (): { success: boolean; message: string } => {
	try {
		const pid = execFileSync("lsof", ["-ti", String(getTunnelPort())]).toString().trim();
		if (pid) {
			execFileSync("kill", ["-9", pid]);
			return { success: true, message: "Tunnel stopped" };
		}
		return { success: true, message: "No tunnel running" };
	} catch {
		return { success: true, message: "No tunnel running" };
	}
};

const startPortForward = async (deviceId: string): Promise<{ success: boolean; message: string }> => {
	try {
		// Kill existing forward if any
		try {
			const pid = execFileSync("lsof", ["-ti", String(getWdaPort())]).toString().trim();
			if (pid) {
				execFileSync("kill", ["-9", pid]);
				await new Promise(resolve => setTimeout(resolve, 500));
			}
		} catch {
			// No process
		}

		const child = spawn(getGoIosPath(), ["--udid", deviceId, "forward", String(getWdaPort()), "8100"], {
			detached: true,
			stdio: ["ignore", "ignore", "ignore"],
		});
		child.unref();

		// Verify port forwarding actually started
		statusCache.invalidate("wda-forward");
		const deadline = Date.now() + 5000;
		while (Date.now() < deadline) {
			if (await isListeningOnPort(getWdaPort())) {
				return { success: true, message: `Port forwarding verified: localhost:${getWdaPort()} -> device:8100` };
			}
			await new Promise(resolve => setTimeout(resolve, 200));
		}

		return { success: false, message: "Port forwarding process started but port is not listening after 5 seconds" };
	} catch (error: any) {
		return { success: false, message: `Port forward error: ${error.message}` };
	}
};

const startWda = async (deviceId: string): Promise<{ success: boolean; message: string }> => {
	const wdaPath = process.env.IOS_WDA_PATH || path.join(os.homedir(), "work", "WebDriverAgent");
	const projectFile = path.join(wdaPath, "WebDriverAgent.xcodeproj");

	if (!fs.existsSync(wdaPath) || !fs.existsSync(projectFile)) {
		return { success: false, message: `WebDriverAgent project not found at ${wdaPath}. Please clone it first.` };
	}

	// Check if WDA is already running
	const { WebDriverAgent } = await import("./webdriver-agent.ts");
	const wda = new WebDriverAgent("localhost", getWdaPort());
	if (await wda.isRunning()) {
		return { success: true, message: "WDA is already running" };
	}

	try {
		const child = spawn("xcodebuild", [
			"-project", "WebDriverAgent.xcodeproj",
			"-scheme", "WebDriverAgentRunner",
			"-destination", `id=${deviceId}`,
			"test",
		], {
			cwd: wdaPath,
			detached: true,
			stdio: ["ignore", "ignore", "ignore"],
			env: process.env,
		});
		child.unref();

		// Wait for WDA to be ready
		const timeoutMs = Number(process.env.IOS_WDA_START_TIMEOUT || "60000");
		const startTime = Date.now();
		while (Date.now() - startTime < timeoutMs) {
			try {
				if (await wda.isRunning()) {
					const elapsed = Math.round((Date.now() - startTime) / 1000);
					return { success: true, message: `WDA started and ready (${elapsed}s)` };
				}
			} catch {
				// Ignore connection errors during startup
			}
			const elapsed = Math.round((Date.now() - startTime) / 1000);
			process.stderr.write(`\rWaiting for WDA... ${elapsed}s`);
			await new Promise(resolve => setTimeout(resolve, 1000));
		}

		return { success: false, message: `WDA startup timed out after ${Math.round(timeoutMs / 1000)}s. Check device trust and Xcode setup.` };
	} catch (error: any) {
		return { success: false, message: `WDA start error: ${error.message}` };
	}
};

interface SetupStatus {
	tunnel: { running: boolean; port: number };
	portForward: { running: boolean; port: number };
}

const getSetupStatus = async (): Promise<SetupStatus> => {
	return {
		tunnel: { running: await checkTunnelRunning(), port: getTunnelPort() },
		portForward: { running: await checkWdaForwardRunning(), port: getWdaPort() },
	};
};

// ========== Device Validation ==========

const requireDeviceId = (options: ParsedOptions): string => {
	const deviceId = readString(options, "device");
	if (!deviceId) {
		throw new ActionableError("Missing required option --device. Run 'devices:list' to see available devices.");
	}
	return deviceId;
};

const validateDeviceExists = (service: IosAutomationService, deviceId: string): void => {
	const devices = service.listAvailableDevices();
	if (!devices.devices.some(d => d.id === deviceId)) {
		const available = devices.devices.map(d => `  - ${d.name} (${d.id})`).join("\n");
		throw new ActionableError(
			`Device "${deviceId}" not found.\n\nAvailable devices:\n${available}\n\nRun 'devices:list' to see all devices.`
		);
	}
};

const requireDevice = (options: ParsedOptions, service: IosAutomationService): string => {
	const deviceId = requireDeviceId(options);
	validateDeviceExists(service, deviceId);
	return deviceId;
};

// ========== Main ==========

const main = async (): Promise<void> => {
	ensureMobilecliInstalled();
	const [command, ...argv] = process.argv.slice(2);
	if (!command) {
		throw new ActionableError("Missing command. Example: devices:list");
	}

	const options = parseOptions(argv);
	const service = new IosAutomationService();

	switch (command) {
		case "doctor":
			printSuccess(service.doctor());
			return;
		case "devices:list":
			printSuccess(service.listAvailableDevices());
			return;
		case "remote:list":
			printSuccess(service.listRemoteDevices());
			return;
		case "remote:allocate":
			printSuccess(service.allocateRemoteDevice((readString(options, "platform", false) || "ios") as "android" | "ios"));
			return;
		case "remote:release":
			printSuccess(service.releaseRemoteDevice(readString(options, "device")!));
			return;
		case "apps:list": {
			const deviceId = requireDevice(options, service);
			printSuccess(await service.listApps(deviceId));
			return;
		}
		case "apps:launch": {
			const deviceId = requireDevice(options, service);
			const pkg = readString(options, "package");
			if (!pkg) throw new ActionableError("Missing required option --package");
			printSuccess(await service.launchApp(deviceId, pkg, readString(options, "locale", false)));
			return;
		}
		case "apps:terminate": {
			const deviceId = requireDevice(options, service);
			const pkg = readString(options, "package");
			if (!pkg) throw new ActionableError("Missing required option --package");
			printSuccess(await service.terminateApp(deviceId, pkg));
			return;
		}
		case "apps:install": {
			const deviceId = requireDevice(options, service);
			const installPath = readString(options, "path");
			if (!installPath) throw new ActionableError("Missing required option --path");
			printSuccess(await service.installApp(deviceId, installPath));
			return;
		}
		case "apps:uninstall": {
			const deviceId = requireDevice(options, service);
			const bundleId = readString(options, "bundle-id");
			if (!bundleId) throw new ActionableError("Missing required option --bundle-id");
			printSuccess(await service.uninstallApp(deviceId, bundleId));
			return;
		}
		case "screen:size": {
			const deviceId = requireDevice(options, service);
			printSuccess(await service.getScreenSize(deviceId));
			return;
		}
		case "screen:tap": {
			const deviceId = requireDevice(options, service);
			const x = readNumber(options, "x");
			const y = readNumber(options, "y");
			if (x === undefined || y === undefined) throw new ActionableError("Missing required options --x and --y");
			printSuccess(await service.tap(deviceId, x, y));
			return;
		}
		case "screen:double-tap": {
			const deviceId = requireDevice(options, service);
			const x = readNumber(options, "x");
			const y = readNumber(options, "y");
			if (x === undefined || y === undefined) throw new ActionableError("Missing required options --x and --y");
			printSuccess(await service.doubleTap(deviceId, x, y));
			return;
		}
		case "screen:long-press": {
			const deviceId = requireDevice(options, service);
			const x = readNumber(options, "x");
			const y = readNumber(options, "y");
			if (x === undefined || y === undefined) throw new ActionableError("Missing required options --x and --y");
			printSuccess(await service.longPress(deviceId, x, y, readNumber(options, "duration", false) || 500));
			return;
		}
		case "screen:elements": {
			const deviceId = requireDevice(options, service);
			printSuccess(await service.listElements(deviceId));
			return;
		}
		case "screen:button": {
			const deviceId = requireDevice(options, service);
			const button = readString(options, "button");
			if (!button) throw new ActionableError("Missing required option --button. Supported: HOME, VOLUME_UP, VOLUME_DOWN, ENTER");
			printSuccess(await service.pressButton(deviceId, button as Button));
			return;
		}
		case "screen:open-url": {
			const deviceId = requireDevice(options, service);
			const url = readString(options, "url");
			if (!url) throw new ActionableError("Missing required option --url");
			printSuccess(await service.openUrl(deviceId, url));
			return;
		}
		case "screen:swipe": {
			const deviceId = requireDevice(options, service);
			const direction = readString(options, "direction");
			if (!direction) throw new ActionableError("Missing required option --direction. Supported: up, down, left, right");
			printSuccess(await service.swipe(deviceId, direction as SwipeDirection, readNumber(options, "x", false), readNumber(options, "y", false), readNumber(options, "distance", false)));
			return;
		}
		case "screen:type": {
			const deviceId = requireDevice(options, service);
			const text = readString(options, "text");
			if (text === undefined) throw new ActionableError("Missing required option --text");
			printSuccess(await service.typeKeys(deviceId, text, readBoolean(options, "submit")));
			return;
		}
		case "screen:screenshot": {
			const deviceId = requireDevice(options, service);
			printSuccess(await service.saveScreenshot(deviceId, readString(options, "output", false)));
			return;
		}
		case "screen:record-start": {
			const deviceId = requireDevice(options, service);
			printSuccess(await service.startScreenRecording(deviceId, readString(options, "output", false), readNumber(options, "time-limit", false)));
			return;
		}
		case "screen:record-stop": {
			const deviceId = requireDevice(options, service);
			printSuccess(await service.stopScreenRecording(deviceId));
			return;
		}
		case "orientation:get": {
			const deviceId = requireDevice(options, service);
			printSuccess(await service.getOrientation(deviceId));
			return;
		}
		case "orientation:set": {
			const deviceId = requireDevice(options, service);
			const orientation = readString(options, "orientation");
			if (!orientation) throw new ActionableError("Missing required option --orientation. Supported: portrait, landscape");
			printSuccess(await service.setOrientation(deviceId, orientation as Orientation));
			return;
		}
		case "crashes:list": {
			const deviceId = requireDevice(options, service);
			printSuccess(service.listCrashes(deviceId));
			return;
		}
		case "crashes:get": {
			const deviceId = requireDevice(options, service);
			const crashId = readString(options, "id");
			if (!crashId) throw new ActionableError("Missing required option --id");
			printSuccess(service.getCrash(deviceId, crashId));
			return;
		}
		// ========== New Environment Setup Commands ==========
		case "setup": {
			const setupDeviceId = readString(options, "device", false);
			const setupStatus = await getSetupStatus();
			const results: string[] = [];

			if (!setupStatus.tunnel.running) {
				results.push("Starting tunnel...");
				const tunnelResult = await startTunnel();
				results.push(tunnelResult.message);
			} else {
				results.push("Tunnel already running");
			}

			if (setupDeviceId) {
				if (!setupStatus.portForward.running) {
					results.push("Starting port forwarding...");
					const forwardResult = await startPortForward(setupDeviceId);
					results.push(forwardResult.message);
				} else {
					results.push("Port forwarding already running");
				}

				if (readBoolean(options, "wda")) {
					results.push("Starting WDA (this may take a while)...");
					const wdaResult = await startWda(setupDeviceId);
					results.push(wdaResult.message);
				}
			}

			statusCache.invalidate();
			const finalStatus = await getSetupStatus();
			printSuccess({ message: results.join("\n"), status: finalStatus });
			return;
		}
		case "tunnel:start": {
			const tunnelResult = await startTunnel();
			printSuccess(tunnelResult);
			return;
		}
		case "tunnel:stop": {
			const tunnelStopResult = stopTunnel();
			printSuccess(tunnelStopResult);
			return;
		}
		case "tunnel:status": {
			const tunnelStatus = await getSetupStatus();
			printSuccess(tunnelStatus);
			return;
		}
		case "wda:start": {
			const wdaDevice = readString(options, "device", true);
			const wdaResult = await startWda(wdaDevice);
			printSuccess(wdaResult);
			return;
		}
		case "forward:start": {
			const fwdDevice = readString(options, "device", true);
			const fwdResult = await startPortForward(fwdDevice);
			printSuccess(fwdResult);
			return;
		}
		case "forward:stop": {
			try {
				const fwdPid = execFileSync("lsof", ["-ti", String(getWdaPort())]).toString().trim();
				if (fwdPid) {
					execFileSync("kill", ["-9", fwdPid]);
					printSuccess({ success: true, message: "Port forwarding stopped" });
				} else {
					printSuccess({ success: true, message: "No port forwarding running" });
				}
			} catch {
				printSuccess({ success: true, message: "No port forwarding running" });
			}
			return;
		}
		default:
			throw new ActionableError(`Unknown command: ${command}`);
	}
};

main().catch(error => {
	printError(error);
});
