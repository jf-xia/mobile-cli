#!/usr/bin/env -S node --experimental-strip-types
// End-to-end test: Create a note in Notes app with timing measurements
import { execFileSync } from "node:child_process";
import { getWdaPort } from "../scripts/config.ts";

const DEVICE_ID = "00008140-001465202E10801C";
const WDA_IP = "10.107.147.77";

interface TimingResult {
	step: string;
	durationMs: number;
	success: boolean;
	detail?: string;
}

const timings: TimingResult[] = [];
let totalTime = 0;

const timeStep = async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
	const start = Date.now();
	try {
		const result = await fn();
		const duration = Date.now() - start;
		totalTime += duration;
		timings.push({ step: name, durationMs: duration, success: true });
		console.log(`  ✅ ${name}: ${duration}ms`);
		return result;
	} catch (err: any) {
		const duration = Date.now() - start;
		totalTime += duration;
		timings.push({ step: name, durationMs: duration, success: false, detail: err.message });
		console.log(`  ❌ ${name}: ${duration}ms - ${err.message}`);
		throw err;
	}
};

const wdaFetch = async (url: string, options?: RequestInit, timeoutMs = 15000): Promise<Response> => {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const response = await fetch(url, { ...options, signal: controller.signal });
		return response;
	} catch (err: any) {
		if (err.name === "AbortError") throw new Error(`Request timed out: ${url}`);
		throw err;
	} finally {
		clearTimeout(timer);
	}
};

const wdaSession = async <T>(fn: (sessionUrl: string) => Promise<T>): Promise<T> => {
	const response = await wdaFetch(`http://${WDA_IP}:${getWdaPort()}/session`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ capabilities: { alwaysMatch: { platformName: "iOS" } } }),
	});
	if (!response.ok) throw new Error(`Session create failed: ${response.status}`);
	const json = await response.json() as any;
	const sessionId = json.value.sessionId;
	const sessionUrl = `http://${WDA_IP}:${getWdaPort()}/session/${sessionId}`;
	try {
		return await fn(sessionUrl);
	} finally {
		await wdaFetch(`http://${WDA_IP}:${getWdaPort()}/session/${sessionId}`, { method: "DELETE" }).catch(() => {});
	}
};

const findElement = async (sessionUrl: string, using: string, value: string): Promise<string> => {
	const response = await wdaFetch(`${sessionUrl}/element`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ using, value }),
	});
	if (!response.ok) throw new Error(`Element not found: ${value} (${response.status})`);
	const json = await response.json() as any;
	return json.value.ELEMENT as string;
};

const clickElement = async (sessionUrl: string, elementId: string): Promise<void> => {
	const response = await wdaFetch(`${sessionUrl}/element/${elementId}/click`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({}),
	});
	if (!response.ok) throw new Error(`Click failed: ${response.status}`);
};

const sendKeys = async (sessionUrl: string, keys: string): Promise<void> => {
	const response = await wdaFetch(`${sessionUrl}/wda/keys`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ value: [keys] }),
	});
	if (!response.ok) throw new Error(`SendKeys failed: ${response.status}`);
};

const getButtonNames = async (sessionUrl: string): Promise<string[]> => {
	const response = await wdaFetch(`${sessionUrl}/source`);
	const source = (await response.json() as any).value as string;
	const names: string[] = [];
	const re = /<XCUIElementTypeButton[^>]+name="([^"]+)"/g;
	let match;
	while ((match = re.exec(source)) !== null) {
		names.push(match[1]);
	}
	return names;
};

console.log("\n========================================");
console.log("  E2E Test: Notes App Automation (Optimized)");
console.log("========================================\n");

// Step 1: Launch Notes app
console.log("Step 1: Launch Notes app\n");

await timeStep("Launch Notes via mobilecli", async () => {
	execFileSync("mobilecli", ["apps", "launch", "--device", DEVICE_ID, "com.apple.mobilenotes"]);
});

await new Promise(resolve => setTimeout(resolve, 2000));

// Step 2: Check WDA and navigate
console.log("\nStep 2: Create note\n");

await timeStep("Full note creation flow", async () => {
	await wdaSession(async (sessionUrl) => {
		// Check current buttons
		const buttons = await getButtonNames(sessionUrl);
		console.log(`    Current buttons: ${buttons.filter(b => !["shift","Return","Emoji","dictation","Bold","Italic","Underline","Strikethrough","Highlight","Link","Format","Checklist","Table","Attachments","Handwriting","Outdent","Indent","Move Up","Move Down","Block Quote","List Style","Undo"].includes(b)).join(", ")}`);

		// If we see "Done", we're in editor - click it first
		if (buttons.includes("Done")) {
			console.log("    In editor view, clicking Done...");
			const doneId = await findElement(sessionUrl, "name", "Done");
			await clickElement(sessionUrl, doneId);
			await new Promise(resolve => setTimeout(resolve, 1000));
		}

		// If we see BackButton, click it to go to list view
		if (buttons.includes("BackButton")) {
			console.log("    Clicking Back to go to notes list...");
			const backId = await findElement(sessionUrl, "name", "BackButton");
			await clickElement(sessionUrl, backId);
			await new Promise(resolve => setTimeout(resolve, 1000));
		}

		// Now find and tap "New note" button
		console.log("    Looking for New note button...");
		const newNoteId = await findElement(sessionUrl, "name", "New note");
		console.log("    Found New note button, tapping...");
		await clickElement(sessionUrl, newNoteId);
		await new Promise(resolve => setTimeout(resolve, 1500));

		// Type the note content
		console.log("    Typing note content...");
		const noteContent = [
			"iOS自动化操作步骤（优化测试）",
			"",
			"本次任务测试了优化后的自动化流程：",
			"",
			"优化内容：",
			"1. 共享配置模块 - 消除代码重复",
			"2. 状态缓存（5秒TTL） - 减少重复检查",
			"3. WDA请求超时（15秒） - 防止无限挂起",
			"4. 请求重试机制 - 提高稳定性",
			"5. 设备验证 - 提前发现错误",
			"6. 输入验证 - 友好错误提示",
			"7. 端口转发验证 - 确认端口监听",
			"8. WDA就绪等待 - 确保WDA可用",
			"",
			`测试时间: ${new Date().toISOString()}`,
		].join("\n");

		await sendKeys(sessionUrl, noteContent);
		await new Promise(resolve => setTimeout(resolve, 500));

		// Save note
		console.log("    Saving note...");
		const doneBtnId = await findElement(sessionUrl, "name", "Done");
		await clickElement(sessionUrl, doneBtnId);
		await new Promise(resolve => setTimeout(resolve, 1000));

		console.log("    Note saved successfully!");
	});
});

// Print summary
console.log("\n========================================");
console.log("  Timing Summary (Optimized)");
console.log("========================================\n");

const maxStepLen = Math.max(...timings.map(t => t.step.length));
for (const t of timings) {
	const status = t.success ? "✅" : "❌";
	const padding = " ".repeat(maxStepLen - t.step.length);
	console.log(`  ${status} ${t.step}${padding}  ${String(t.durationMs).padStart(6)}ms`);
}

console.log(`\n  Total: ${totalTime}ms (${(totalTime / 1000).toFixed(1)}s)`);
console.log(`  Success: ${timings.filter(t => t.success).length}/${timings.length}\n`);

process.exit(timings.every(t => t.success) ? 0 : 1);
