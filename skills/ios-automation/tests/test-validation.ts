#!/usr/bin/env -S node --experimental-strip-types
// Test 3: Input validation in ios-automation.ts
import { execFileSync } from "node:child_process";

const SCRIPT = "./scripts/ios-automation.ts";

const run = (args: string[]): { status: string; data?: any; error?: { message: string } } => {
	try {
		const output = execFileSync("node", ["--experimental-strip-types", SCRIPT, ...args], {
			encoding: "utf8",
			timeout: 30000,
			cwd: "/Users/jianfengxia/work/mobile-cli/.pi/skills/ios-automation",
		});
		return JSON.parse(output.trim());
	} catch (err: any) {
		const stdout = err.stdout || "";
		try {
			return JSON.parse(stdout.trim());
		} catch {
			try {
				const match = stdout.match(/\{[\s\S]*\}/);
				if (match) return JSON.parse(match[0]);
			} catch {}
			return { status: "error", error: { message: err.message } };
		}
	}
};

let pass = 0;
let fail = 0;

const assert = (name: string, condition: boolean, detail?: string) => {
	if (condition) {
		console.log(`  ✅ ${name}`);
		pass++;
	} else {
		console.log(`  ❌ ${name}${detail ? `\n     ${detail}` : ""}`);
		fail++;
	}
};

console.log("\n=== Test 3: Input Validation ===\n");

// Test 1: Missing command
const r1 = run([]);
assert("Missing command returns error", r1.status === "error");

// Test 2: screen:tap without --device
const r2 = run(["screen:tap", "--x", "100", "--y", "200"]);
assert("screen:tap without --device returns helpful error", r2.status === "error");
assert("Error mentions --device", r2.error?.message.includes("--device"), r2.error?.message);

// Test 3: screen:tap with invalid device
const r3 = run(["screen:tap", "--device", "INVALID_DEVICE_ID", "--x", "100", "--y", "200"]);
assert("screen:tap with invalid device returns error", r3.status === "error");
assert("Error mentions device not found", r3.error?.message.includes("not found"), r3.error?.message);
assert("Error lists available devices", r3.error?.message.includes("Available devices"), r3.error?.message);

// Test 4: screen:tap without --x --y
const r4 = run(["screen:tap", "--device", "00008140-001465202E10801C"]);
assert("screen:tap without --x --y returns error", r4.status === "error");
assert("Error mentions missing option", r4.error?.message.includes("Missing"), r4.error?.message);

// Test 5: apps:launch without --package
const r5 = run(["apps:launch", "--device", "00008140-001465202E10801C"]);
assert("apps:launch without --package returns error", r5.status === "error");
assert("Error mentions --package", r5.error?.message.includes("--package"), r5.error?.message);

// Test 6: screen:button without --button
const r6 = run(["screen:button", "--device", "00008140-001465202E10801C"]);
assert("screen:button without --button returns error", r6.status === "error");
assert("Error mentions missing option", r6.error?.message.includes("Missing"), r6.error?.message);

// Test 7: screen:swipe without --direction
const r7 = run(["screen:swipe", "--device", "00008140-001465202E10801C"]);
assert("screen:swipe without --direction returns error", r7.status === "error");
assert("Error mentions missing option", r7.error?.message.includes("Missing"), r7.error?.message);

// Test 8: devices:list should work without validation
const r8 = run(["devices:list"]);
assert("devices:list works", r8.status === "ok");
assert("devices:list returns devices", Array.isArray(r8.data?.devices), JSON.stringify(r8.data).slice(0, 200));

// Test 9: doctor should work without validation
const r9 = run(["doctor"]);
assert("doctor works", r9.status === "ok");

console.log(`\nResults: ${pass} passed, ${fail} failed\n`);
process.exit(fail > 0 ? 1 : 0);
