import { execFileSync, spawn, type ChildProcess, type StdioOptions } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { logTiming } from "./timing-logger.ts";

export interface MobilecliCrashEntry {
	processName: string;
	timestamp: string;
	id: string;
}

export interface MobilecliCrashesListResponse {
	status: "ok";
	data: MobilecliCrashEntry[];
}

export interface MobilecliCrashGetResponse {
	status: "ok";
	data: {
		content: string;
		id: string;
	};
}

export interface MobilecliAgentStatusResponse {
	status: "ok" | "fail";
	data: {
		message: string;
	};
}

export interface MobilecliDevicesOptions {
	includeOffline?: boolean;
	platform?: "ios" | "android";
	type?: "real" | "emulator" | "simulator";
}

export interface MobilecliDevicesResponse {
	status: "ok";
	data: {
		devices: Array<{
			id: string;
			name: string;
			platform: "android" | "ios";
			type: "real" | "emulator" | "simulator";
			version: string;
		}>;
	};
}

const TIMEOUT = 30000;
const MAX_BUFFER_SIZE = 1024 * 1024 * 8;

const mobilecliExecutable = (): string => process.platform === "win32" ? "mobilecli.exe" : "mobilecli";

const canExecute = (command: string): boolean => {
	try {
		execFileSync(command, ["--version"], { stdio: ["ignore", "ignore", "ignore"] });
		return true;
	} catch {
		return false;
	}
};

const getGlobalMobilecliPath = (): string | null => {
	try {
		const prefix = execFileSync("npm", ["prefix", "-g"], { encoding: "utf8" }).trim();
		const candidate = process.platform === "win32"
			? path.join(prefix, mobilecliExecutable())
			: path.join(prefix, "bin", mobilecliExecutable());
		return existsSync(candidate) ? candidate : null;
	} catch {
		return null;
	}
};

export const resolveMobilecliPath = (): string | null => {
	if (process.env.MOBILECLI_PATH && existsSync(process.env.MOBILECLI_PATH)) {
		return process.env.MOBILECLI_PATH;
	}

	const commandCandidate = mobilecliExecutable();
	if (canExecute(commandCandidate)) {
		return commandCandidate;
	}

	const globalPath = getGlobalMobilecliPath();
	if (globalPath && canExecute(globalPath)) {
		return globalPath;
	}

	return null;
};

export const ensureMobilecliInstalled = (): string => {
	const resolved = resolveMobilecliPath();
	if (resolved) {
		process.env.MOBILECLI_PATH = resolved;
		return resolved;
	}

	execFileSync("npm", ["install", "-g", "mobilecli@latest"], { stdio: "inherit" });
	const installed = resolveMobilecliPath();
	if (!installed) {
		throw new Error("mobilecli installation completed but the binary is still unavailable");
	}

	process.env.MOBILECLI_PATH = installed;
	return installed;
};

export class Mobilecli {
	private path: string | null = null;

	private getPath(): string {
		if (!this.path) {
			this.path = ensureMobilecliInstalled();
		}
		return this.path;
	}

	public executeCommand(args: string[]): string {
		const _t0 = performance.now();
		const output = execFileSync(this.getPath(), args, { encoding: "utf8" }).toString().trim();
		logTiming("mobilecli.ts", `mobilecli:${args[0]}`, performance.now() - _t0);
		return output;
	}

	public executeCommandBuffer(args: string[]): Buffer {
		const _t0 = performance.now();
		const buf = execFileSync(this.getPath(), args, {
			encoding: "buffer",
			timeout: TIMEOUT,
			maxBuffer: MAX_BUFFER_SIZE,
		}) as Buffer;
		logTiming("mobilecli.ts", `mobilecli:${args[0]}:buf`, performance.now() - _t0);
		return buf;
	}

	public spawnCommand(args: string[], options?: { detached?: boolean; stdio?: StdioOptions }): ChildProcess {
		return spawn(this.getPath(), args, {
			detached: options?.detached ?? false,
			stdio: options?.stdio ?? ["ignore", "ignore", "ignore"],
		});
	}

	public getVersion(): string {
		try {
			const output = this.executeCommand(["--version"]);
			return output.startsWith("mobilecli version ") ? output.substring("mobilecli version ".length) : "failed";
		} catch (error: any) {
			return "failed " + error.message;
		}
	}

	public remoteListDevices(): string {
		return this.executeCommand(["remote", "list-devices"]);
	}

	public remoteAllocate(platform: "ios" | "android"): string {
		return this.executeCommand(["remote", "allocate", "--platform", platform]);
	}

	public remoteRelease(deviceId: string): string {
		return this.executeCommand(["remote", "release", "--device", deviceId]);
	}

	public crashesList(deviceId: string): MobilecliCrashesListResponse {
		return JSON.parse(this.executeCommand(["device", "crashes", "list", "--device", deviceId])) as MobilecliCrashesListResponse;
	}

	public crashesGet(deviceId: string, id: string): MobilecliCrashGetResponse {
		const output = this.executeCommandBuffer(["device", "crashes", "get", id, "--device", deviceId]);
		return JSON.parse(output.toString().trim()) as MobilecliCrashGetResponse;
	}

	public agentStatus(deviceId: string): MobilecliAgentStatusResponse {
		return JSON.parse(this.executeCommand(["agent", "status", "--device", deviceId])) as MobilecliAgentStatusResponse;
	}

	public agentInstall(deviceId: string): void {
		this.executeCommand(["agent", "install", "--device", deviceId]);
	}

	public getDevices(options?: MobilecliDevicesOptions): MobilecliDevicesResponse {
		const args = ["devices"];
		if (options?.includeOffline) {
			args.push("--include-offline");
		}
		if (options?.platform) {
			args.push("--platform", options.platform);
		}
		if (options?.type) {
			args.push("--type", options.type);
		}

		return JSON.parse(this.executeCommand(args)) as MobilecliDevicesResponse;
	}
}
