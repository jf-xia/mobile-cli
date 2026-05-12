#!/usr/bin/env -S node --experimental-strip-types
// Test 1: config.ts shared module
import { getGoIosPath, getWdaPort, getTunnelPort, getWdaStartTimeout, isListeningOnPort } from "../scripts/config.ts";

let pass = 0;
let fail = 0;

const assert = (name: string, condition: boolean, detail?: string) => {
	if (condition) {
		console.log(`  ✅ ${name}`);
		pass++;
	} else {
		console.log(`  ❌ ${name}${detail ? `: ${detail}` : ""}`);
		fail++;
	}
};

console.log("\n=== Test 1: config.ts ===\n");

// Test default values
assert("getGoIosPath() returns 'ios'", getGoIosPath() === "ios");
assert("getWdaPort() returns 8100", getWdaPort() === 8100);
assert("getTunnelPort() returns 60105", getTunnelPort() === 60105);
assert("getWdaStartTimeout() returns 60000", getWdaStartTimeout() === 60000);

// Test env overrides
process.env.IOS_AUTOMATION_WDA_PORT = "9100";
assert("getWdaPort() respects env override", getWdaPort() === 9100);
delete process.env.IOS_AUTOMATION_WDA_PORT;

// Test isListeningOnPort with non-existent port
const listening = await isListeningOnPort(19999);
assert("isListeningOnPort(19999) returns false", listening === false);

// Test isListeningOnPort with a real port (if tunnel is running)
const tunnelListening = await isListeningOnPort(getTunnelPort());
assert("isListeningOnPort(tunnelPort) returns boolean", typeof tunnelListening === "boolean");

console.log(`\nResults: ${pass} passed, ${fail} failed\n`);
process.exit(fail > 0 ? 1 : 0);
