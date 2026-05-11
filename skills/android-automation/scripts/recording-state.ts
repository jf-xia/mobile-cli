import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface RecordingStateEntry {
	device: string;
	pid: number;
	outputPath: string;
	startedAt: number;
	command: string[];
}

type RecordingState = Record<string, RecordingStateEntry>;

const DEFAULT_STATE_FILE = path.join(os.tmpdir(), "android-automation-recordings.json");

export class RecordingStateStore {
	private readonly stateFile: string;

	public constructor(stateFile = process.env.ANDROID_AUTOMATION_RECORDING_STATE_FILE || process.env.ANDROID_AUTOMATION_STATE_FILE || DEFAULT_STATE_FILE) {
		this.stateFile = stateFile;
	}

	public get(device: string): RecordingStateEntry | undefined {
		return this.read()[device];
	}

	public set(entry: RecordingStateEntry): void {
		const state = this.read();
		state[entry.device] = entry;
		this.write(state);
	}

	public delete(device: string): void {
		const state = this.read();
		if (state[device]) {
			delete state[device];
			this.write(state);
		}
	}

	private read(): RecordingState {
		try {
			const content = fs.readFileSync(this.stateFile, "utf8").trim();
			return content ? JSON.parse(content) as RecordingState : {};
		} catch (error: any) {
			if (error.code === "ENOENT") {
				return {};
			}

			throw error;
		}
	}

	private write(state: RecordingState): void {
		fs.mkdirSync(path.dirname(this.stateFile), { recursive: true });
		fs.writeFileSync(this.stateFile, JSON.stringify(state, null, 2) + "\n", "utf8");
	}
}

export const isProcessRunning = (pid: number): boolean => {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error: any) {
		return error.code !== "ESRCH";
	}
};
