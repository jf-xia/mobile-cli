#!/usr/bin/env -S node --experimental-strip-types
// Comprehensive timing analysis across different scenarios
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const SCRIPT = "./scripts/ios-automation.ts";
const TIMING_DIR = "/tmp/ios-timing-analysis";

// Ensure output directory exists
fs.mkdirSync(TIMING_DIR, { recursive: true });

const run = (name: string, args: string[]): { duration: number; result: any } => {
	const timingFile = `${TIMING_DIR}/${name}.json`;
	const start = performance.now();
	try {
		const output = execFileSync("node", [
			"--experimental-strip-types", SCRIPT, ...args
		], {
			encoding: "utf8",
			timeout: 120000,
			cwd: "/Users/jianfengxia/work/mobile-cli/.pi/skills/ios-automation",
			env: { ...process.env, IOS_AUTOMATION_TIMING_LOG: timingFile },
		});
		const duration = performance.now() - start;
		const result = JSON.parse(output.trim());
		return { duration, result };
	} catch (err: any) {
		const duration = performance.now() - start;
		try {
			return { duration, result: JSON.parse(err.stdout?.trim() || "{}") };
		} catch {
			return { duration, result: { status: "error", error: { message: err.message } } };
		}
	}
};

interface ScenarioResult {
	name: string;
	scenario: string;
	durationMs: number;
	status: string;
	detail?: string;
	timingFile: string;
	internalTimings?: any[];
}

const results: ScenarioResult[] = [];

const runScenario = (name: string, scenario: string, args: string[]) => {
	console.log(`  Running: ${name} (${scenario})...`);
	const { duration, result } = run(`${name}_${scenario}`, args);
	const timingFile = `${TIMING_DIR}/${name}_${scenario}.json`;
	let internalTimings: any[] = [];
	try {
		internalTimings = JSON.parse(fs.readFileSync(timingFile, "utf8"));
	} catch {}
	
	const entry: ScenarioResult = {
		name,
		scenario,
		durationMs: Math.round(duration),
		status: result.status,
		detail: result.error?.message?.slice(0, 100) || result.data?.message?.slice(0, 100),
		timingFile,
		internalTimings,
	};
	results.push(entry);
	const icon = result.status === "ok" ? "✅" : "❌";
	console.log(`  ${icon} ${name} (${scenario}): ${Math.round(duration)}ms`);
};

console.log("\n================================================");
console.log("  iOS Automation Timing Analysis");
console.log("================================================\n");

// ======== Scenario 1: doctor ========
console.log("1. Basic commands (no WDA needed)\n");

runScenario("doctor", "cold", ["doctor"]);
runScenario("doctor", "warm", ["doctor"]); // Second run for cache comparison

runScenario("devices_list", "cold", ["devices:list"]);
runScenario("devices_list", "warm", ["devices:list"]);

// ======== Scenario 2: apps:list ========
console.log("\n2. go-ios operations\n");

runScenario("apps_list", "cold", ["apps:list", "--device", "00008140-001465202E10801C"]);
runScenario("apps_list", "warm", ["apps:list", "--device", "00008140-001465202E10801C"]);

// ======== Scenario 3: tunnel/forward status ========
console.log("\n3. Tunnel and forward status\n");

runScenario("tunnel_status", "cold", ["tunnel:status"]);
runScenario("tunnel_status", "warm", ["tunnel:status"]);

// ======== Scenario 4: Validation overhead ========
console.log("\n4. Validation overhead\n");

runScenario("validation", "invalid_device", ["screen:tap", "--device", "INVALID", "--x", "100", "--y", "200"]);
runScenario("validation", "missing_param", ["screen:tap", "--device", "00008140-001465202E10801C"]);

// ======== Scenario 5: apps:launch ========
console.log("\n5. App operations\n");

runScenario("apps_launch", "notes", ["apps:launch", "--device", "00008140-001465202E10801C", "--package", "com.apple.mobilenotes"]);

// ======== Scenario 6: WDA-dependent (will fail without WDA, but shows timing) ========
console.log("\n6. WDA-dependent operations (expect timeout/error)\n");

runScenario("screen_elements", "no_wda", ["screen:elements", "--device", "00008140-001465202E10801C"]);

// ======== Results Summary ========
console.log("\n================================================");
console.log("  Results Summary");
console.log("================================================\n");

// Group by command name
const groups = new Map<string, ScenarioResult[]>();
for (const r of results) {
	const existing = groups.get(r.name) || [];
	existing.push(r);
	groups.set(r.name, existing);
}

for (const [name, entries] of groups) {
	console.log(`\n  ${name}:`);
	for (const e of entries) {
		const icon = e.status === "ok" ? "✅" : "❌";
		console.log(`    ${icon} ${e.scenario.padEnd(20)} ${String(e.durationMs).padStart(6)}ms  ${e.detail || ""}`);
		
		// Show internal timings if available
		if (e.internalTimings && e.internalTimings.length > 0) {
			for (const t of e.internalTimings) {
				const tIcon = t.status === "ok" ? "  ↳" : "  ✗";
				const detail = t.detail ? ` (${t.detail})` : "";
				console.log(`      ${tIcon} ${t.method.padEnd(25)} ${String(t.durationMs).padStart(6)}ms${detail}`);
			}
		}
	}
}

// ======== Analysis ========
console.log("\n================================================");
console.log("  Analysis");
console.log("================================================\n");

// Cold vs Warm comparison
for (const [name, entries] of groups) {
	const cold = entries.find(e => e.scenario === "cold");
	const warm = entries.find(e => e.scenario === "warm");
	if (cold && warm) {
		const diff = cold.durationMs - warm.durationMs;
		const pct = cold.durationMs > 0 ? Math.round((diff / cold.durationMs) * 100) : 0;
		console.log(`  ${name}: cold=${cold.durationMs}ms, warm=${warm.durationMs}ms, cache saves ${diff}ms (${pct}%)`);
	}
}

// Internal timing breakdown
console.log("\n  Internal timing breakdown (first run of each):");
for (const [name, entries] of groups) {
	const first = entries[0];
	if (first.internalTimings && first.internalTimings.length > 0) {
		console.log(`\n    ${name} (${first.scenario}):`);
		let total = 0;
		for (const t of first.internalTimings) {
			total += t.durationMs;
			const detail = t.detail ? ` (${t.detail})` : "";
			console.log(`      ${t.file.padEnd(22)} ${t.method.padEnd(30)} ${String(t.durationMs).padStart(6)}ms${detail}`);
		}
		console.log(`      ${"TOTAL".padEnd(54)} ${String(total).padStart(6)}ms`);
	}
}

console.log(`\n  Timing logs saved to: ${TIMING_DIR}/\n`);
