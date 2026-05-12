#!/usr/bin/env -S node --experimental-strip-types
import { IosAutomationService } from "./ios-service.ts";
import { ensureMobilecliInstalled } from "./mobilecli.ts";
import { ActionableError, type Button, type Orientation, type SwipeDirection } from "./robot.ts";
import { execFileSync, spawn } from "node:child_process";
import { Socket } from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

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

// ========== Environment Setup Helpers ==========

const getGoIosPath = (): string => process.env.GO_IOS_PATH || "ios";
const getWdaPort = (): number => Number(process.env.IOS_AUTOMATION_WDA_PORT || 8100);
const getTunnelPort = (): number => Number(process.env.IOS_AUTOMATION_TUNNEL_PORT || 60105);

const isListeningOnPort = (port: number): Promise<boolean> => {
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
};

const checkTunnelRunning = (): Promise<boolean> => isListeningOnPort(getTunnelPort());
const checkWdaForwardRunning = (): Promise<boolean> => isListeningOnPort(getWdaPort());

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

const startPortForward = (deviceId: string): { success: boolean; message: string } => {
	try {
		// Kill existing forward if any
		try {
			const pid = execFileSync("lsof", ["-ti", String(getWdaPort())]).toString().trim();
			if (pid) {
				execFileSync("kill", ["-9", pid]);
			}
		} catch {
			// No process
		}

		const child = spawn(getGoIosPath(), ["--udid", deviceId, "forward", String(getWdaPort()), "8100"], {
			detached: true,
			stdio: ["ignore", "ignore", "ignore"],
		});
		child.unref();

		return { success: true, message: `Port forwarding started: localhost:${getWdaPort()} -> device:8100` };
	} catch (error: any) {
		return { success: false, message: `Port forward error: ${error.message}` };
	}
};

const startWda = (deviceId: string): { success: boolean; message: string } => {
	const wdaPath = process.env.IOS_WDA_PATH || path.join(os.homedir(), "work", "WebDriverAgent");
	const projectFile = path.join(wdaPath, "WebDriverAgent.xcodeproj");

	if (!fs.existsSync(wdaPath) || !fs.existsSync(projectFile)) {
		return { success: false, message: `WebDriverAgent project not found at ${wdaPath}. Please clone it first.` };
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

		return { success: true, message: "WDA build and install started (may take 30-60 seconds)" };
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
		case "apps:list":
			printSuccess(await service.listApps(readString(options, "device")!));
			return;
		case "apps:launch":
			printSuccess(await service.launchApp(readString(options, "device")!, readString(options, "package")!, readString(options, "locale", false)));
			return;
		case "apps:terminate":
			printSuccess(await service.terminateApp(readString(options, "device")!, readString(options, "package")!));
			return;
		case "apps:install":
			printSuccess(await service.installApp(readString(options, "device")!, readString(options, "path")!));
			return;
		case "apps:uninstall":
			printSuccess(await service.uninstallApp(readString(options, "device")!, readString(options, "bundle-id")!));
			return;
		case "screen:size":
			printSuccess(await service.getScreenSize(readString(options, "device")!));
			return;
		case "screen:tap":
			printSuccess(await service.tap(readString(options, "device")!, readNumber(options, "x")!, readNumber(options, "y")!));
			return;
		case "screen:double-tap":
			printSuccess(await service.doubleTap(readString(options, "device")!, readNumber(options, "x")!, readNumber(options, "y")!));
			return;
		case "screen:long-press":
			printSuccess(await service.longPress(readString(options, "device")!, readNumber(options, "x")!, readNumber(options, "y")!, readNumber(options, "duration", false) || 500));
			return;
		case "screen:elements":
			printSuccess(await service.listElements(readString(options, "device")!));
			return;
		case "screen:button":
			printSuccess(await service.pressButton(readString(options, "device")!, readString(options, "button")! as Button));
			return;
		case "screen:open-url":
			printSuccess(await service.openUrl(readString(options, "device")!, readString(options, "url")!));
			return;
		case "screen:swipe":
			printSuccess(await service.swipe(readString(options, "device")!, readString(options, "direction")! as SwipeDirection, readNumber(options, "x", false), readNumber(options, "y", false), readNumber(options, "distance", false)));
			return;
		case "screen:type":
			printSuccess(await service.typeKeys(readString(options, "device")!, readString(options, "text")!, readBoolean(options, "submit")));
			return;
		case "screen:screenshot":
			printSuccess(await service.saveScreenshot(readString(options, "device")!, readString(options, "output", false)));
			return;
		case "screen:record-start":
			printSuccess(await service.startScreenRecording(readString(options, "device")!, readString(options, "output", false), readNumber(options, "time-limit", false)));
			return;
		case "screen:record-stop":
			printSuccess(await service.stopScreenRecording(readString(options, "device")!));
			return;
		case "orientation:get":
			printSuccess(await service.getOrientation(readString(options, "device")!));
			return;
		case "orientation:set":
			printSuccess(await service.setOrientation(readString(options, "device")!, readString(options, "orientation")! as Orientation));
			return;
		case "crashes:list":
			printSuccess(service.listCrashes(readString(options, "device")!));
			return;
		case "crashes:get":
			printSuccess(service.getCrash(readString(options, "device")!, readString(options, "id")!));
			return;
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
					const forwardResult = startPortForward(setupDeviceId);
					results.push(forwardResult.message);
				} else {
					results.push("Port forwarding already running");
				}

				if (readBoolean(options, "wda")) {
					results.push("Starting WDA (this may take a while)...");
					const wdaResult = startWda(setupDeviceId);
					results.push(wdaResult.message);
				}
			}

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
			const wdaResult = startWda(wdaDevice);
			printSuccess(wdaResult);
			return;
		}
		case "forward:start": {
			const fwdDevice = readString(options, "device", true);
			const fwdResult = startPortForward(fwdDevice);
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
