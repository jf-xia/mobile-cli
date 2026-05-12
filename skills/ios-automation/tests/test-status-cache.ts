#!/usr/bin/env -S node --experimental-strip-types
// Test 2: status-cache.ts
import { StatusCache } from "../scripts/status-cache.ts";

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

console.log("\n=== Test 2: status-cache.ts ===\n");

// Test basic caching
const cache = new StatusCache(2000); // 2s TTL

let callCount = 0;
const checker = async () => { callCount++; return true; };

const result1 = await cache.check("test1", checker);
assert("First call returns true", result1 === true);
assert("Checker called once", callCount === 1);

const result2 = await cache.check("test1", checker);
assert("Second call returns cached true", result2 === true);
assert("Checker NOT called again (cached)", callCount === 1);

// Test invalidation
cache.invalidate("test1");
const result3 = await cache.check("test1", checker);
assert("After invalidation, checker called again", callCount === 2);
assert("After invalidation, returns true", result3 === true);

// Test TTL expiry
const shortCache = new StatusCache(100); // 100ms TTL
let shortCallCount = 0;
const shortChecker = async () => { shortCallCount++; return false; };

await shortCache.check("test2", shortChecker);
assert("Short cache: first call", shortCallCount === 1);

await shortCache.check("test2", shortChecker);
assert("Short cache: cached within TTL", shortCallCount === 1);

await new Promise(resolve => setTimeout(resolve, 150));
await shortCache.check("test2", shortChecker);
assert("Short cache: re-calls after TTL expired", shortCallCount === 2);

// Test get
cache.invalidate();
const get1 = cache.get("nonexistent");
assert("get() returns undefined for missing key", get1 === undefined);

await cache.check("test3", async () => true);
const get2 = cache.get("test3");
assert("get() returns value for existing key", get2 === true);

// Test full invalidation
cache.invalidate();
const get3 = cache.get("test3");
assert("After full invalidate, get() returns undefined", get3 === undefined);

console.log(`\nResults: ${pass} passed, ${fail} failed\n`);
process.exit(fail > 0 ? 1 : 0);
