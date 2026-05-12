import fs from "node:fs";
import path from "node:path";
import os from "node:os";

interface TimingEntry {
	order: number;
	file: string;
	method: string;
	startTime: string;
	endTime: string;
	durationMs: number;
	status: "ok" | "error";
	detail?: string;
}

let counter = 0;
const entries: TimingEntry[] = [];
const logFilePath = process.env.IOS_AUTOMATION_TIMING_LOG
	|| path.join(os.tmpdir(), "ios-automation-timing.json");

const now = (): string => new Date().toISOString();

/**
 * 包装一个异步函数，自动记录开始/结束/耗时。
 * 用法: const wrapped = timed("ios.ts", "wda", originalFn);
 */
export function timed<T extends (...args: any[]) => Promise<any>>(
	file: string,
	method: string,
	fn: T,
): T {
	const wrapped = async (...args: any[]) => {
		const order = ++counter;
		const start = performance.now();
		const startTs = now();
		try {
			const result = await fn(...args);
			const durationMs = Math.round(performance.now() - start);
			entries.push({ order, file, method, startTime: startTs, endTime: now(), durationMs, status: "ok" });
			return result;
		} catch (err: any) {
			const durationMs = Math.round(performance.now() - start);
			entries.push({ order, file, method, startTime: startTs, endTime: now(), durationMs, status: "error", detail: err.message?.slice(0, 200) });
			throw err;
		}
	};
	return wrapped as T;
}

/**
 * 包装一个同步函数，自动记录开始/结束/耗时。
 */
export function timedSync<T extends (...args: any[]) => any>(
	file: string,
	method: string,
	fn: T,
): T {
	const wrapped = (...args: any[]) => {
		const order = ++counter;
		const start = performance.now();
		const startTs = now();
		try {
			const result = fn(...args);
			const durationMs = Math.round(performance.now() - start);
			entries.push({ order, file, method, startTime: startTs, endTime: now(), durationMs, status: "ok" });
			return result;
		} catch (err: any) {
			const durationMs = Math.round(performance.now() - start);
			entries.push({ order, file, method, startTime: startTs, endTime: now(), durationMs, status: "error", detail: err.message?.slice(0, 200) });
			throw err;
		}
	};
	return wrapped as T;
}

/**
 * 手动记录一条计时（用于无法用 wrapper 包装的场景）。
 */
export function logTiming(file: string, method: string, durationMs: number, status: "ok" | "error" = "ok", detail?: string): void {
	entries.push({ order: ++counter, file, method, startTime: now(), endTime: now(), durationMs: Math.round(durationMs), status, detail });
}

/**
 * 将所有计时数据写入 JSON 文件。
 * 在进程退出时自动调用，也可手动调用。
 */
export function flushTimings(): void {
	if (entries.length === 0) return;
	try {
		fs.mkdirSync(path.dirname(logFilePath), { recursive: true });
		fs.writeFileSync(logFilePath, JSON.stringify(entries, null, 2) + "\n", "utf8");
	} catch {
		// best effort
	}
}

// 进程退出时自动写入
process.on("exit", flushTimings);
process.on("SIGINT", () => { flushTimings(); process.exit(130); });

/**
 * 获取日志文件路径。
 */
export function getLogFilePath(): string {
	return logFilePath;
}
