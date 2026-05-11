import assert from "node:assert";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { execFile, execFileSync } from "node:child_process";
import { describe, it } from "node:test";

const PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYAAAAAMAAWgmWQ0AAAAASUVORK5CYII=";
const SCRIPT_PATH = path.resolve(process.cwd(), ".github/skills/ios-automation/scripts/ios-automation.ts");

const readCommandLog = (filePath: string): string[] => {
	if (!fs.existsSync(filePath)) {
		return [];
	}

	return fs.readFileSync(filePath, "utf8").split("\n").filter(Boolean);
};

const writeExecutable = (filePath: string, content: string): void => {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, content, { mode: 0o755 });
	fs.chmodSync(filePath, 0o755);
};

const createBaseEnvironment = (): { tempDir: string; env: NodeJS.ProcessEnv } => {
	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ios-skill-test-"));
	const binDir = path.join(tempDir, "bin");
	const iosCommandLog = path.join(tempDir, "ios-commands.log");
	const mobilecliCommandLog = path.join(tempDir, "mobilecli-commands.log");
	fs.mkdirSync(binDir, { recursive: true });

	writeExecutable(path.join(binDir, "ios"), `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const commandLog = process.env.IOS_AUTOMATION_TEST_IOS_LOG;
if (commandLog) {
  fs.appendFileSync(commandLog, JSON.stringify(args) + '\\n');
}
if (args[0] === 'version') {
  process.stdout.write(JSON.stringify({ version: 'v1.0.0' }));
  process.exit(0);
}
if (args[0] === 'list') {
  process.stdout.write(JSON.stringify({ deviceList: ['real-ios-1'] }));
  process.exit(0);
}
const infoIndex = args.indexOf('--udid');
if (args[0] === 'info' && infoIndex >= 0 && args[infoIndex + 1] === 'real-ios-1') {
  process.stdout.write(JSON.stringify({ DeviceName: 'Test iPhone', ProductVersion: '18.0' }));
  process.exit(0);
}
if (args[0] === '--udid' && args[1] === 'real-ios-1' && args[2] === 'info') {
  process.stdout.write(JSON.stringify({ ProductVersion: '18.0' }));
  process.exit(0);
}
if (args[0] === '--udid' && args[1] === 'real-ios-1' && args[2] === 'apps') {
  process.stdout.write('com.apple.Preferences Settings\\n');
  process.exit(0);
}
if (args[0] === '--udid' && args[1] === 'real-ios-1' && args[2] === 'launch') {
  process.exit(0);
}
if (args[0] === '--udid' && args[1] === 'real-ios-1' && args[2] === 'kill') {
  process.exit(0);
}
if (args[0] === '--udid' && args[1] === 'real-ios-1' && (args[2] === 'install' || args[2] === 'uninstall')) {
  process.exit(0);
}
process.exit(0);
`);

	writeExecutable(path.join(binDir, "mobilecli"), `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const png = Buffer.from(${JSON.stringify(PNG_BASE64)}, 'base64');
const commandLog = process.env.IOS_AUTOMATION_TEST_MOBILECLI_LOG;

if (commandLog) {
	fs.appendFileSync(commandLog, JSON.stringify(args) + '\\n');
}

if (args[0] === '--version') {
  process.stdout.write('mobilecli version 9.9.9\\n');
  process.exit(0);
}
if (args[0] === 'devices') {
  process.stdout.write(JSON.stringify({ status: 'ok', data: { devices: [{ id: 'sim-1', name: 'iPhone 16 Simulator', platform: 'ios', type: 'simulator', version: '18.1' }] } }));
  process.exit(0);
}
if (args[0] === 'agent' && args[1] === 'status') {
  process.stdout.write(JSON.stringify({ status: 'ok', data: { message: 'installed' } }));
  process.exit(0);
}
if (args[0] === 'agent' && args[1] === 'install') {
  process.exit(0);
}
if (args[0] === 'device' && args[1] === 'info') {
  process.stdout.write(JSON.stringify({ status: 'ok', data: { device: { id: 'sim-1', name: 'iPhone 16 Simulator', platform: 'ios', type: 'simulator', version: '18.1', state: 'online', screenSize: { width: 393, height: 852, scale: 3 } } } }));
  process.exit(0);
}
if (args[0] === 'apps' && args[1] === 'list') {
  process.stdout.write(JSON.stringify({ status: 'ok', data: [{ packageName: 'com.apple.Preferences', appName: 'Settings' }] }));
  process.exit(0);
}
if (args[0] === 'dump' && args[1] === 'ui') {
  process.stdout.write(JSON.stringify({ status: 'ok', data: { elements: [{ type: 'Button', label: 'Continue', rect: { x: 10, y: 20, width: 120, height: 44 } }] } }));
  process.exit(0);
}
if (args[0] === 'device' && args[1] === 'orientation' && args[2] === 'get') {
  process.stdout.write(JSON.stringify({ status: 'ok', data: { orientation: 'portrait' } }));
  process.exit(0);
}
if (args[0] === 'screenshot') {
  process.stdout.write(png);
  process.exit(0);
}
if (args[0] === 'remote' && args[1] === 'list-devices') {
  process.stdout.write(JSON.stringify({ status: 'ok', data: [{ id: 'ios-remote-1' }] }));
  process.exit(0);
}
if (args[0] === 'remote' && args[1] === 'allocate') {
  process.stdout.write(JSON.stringify({ status: 'ok', data: { id: 'ios-remote-1' } }));
  process.exit(0);
}
if (args[0] === 'remote' && args[1] === 'release') {
  process.stdout.write(JSON.stringify({ status: 'ok', data: { released: true } }));
  process.exit(0);
}
if (args[0] === 'device' && args[1] === 'crashes' && args[2] === 'list') {
  process.stdout.write(JSON.stringify({ status: 'ok', data: [{ id: 'crash-1', processName: 'TestApp', timestamp: '2026-05-11T00:00:00Z' }] }));
  process.exit(0);
}
if (args[0] === 'device' && args[1] === 'crashes' && args[2] === 'get') {
  process.stdout.write(JSON.stringify({ status: 'ok', data: { id: 'crash-1', content: 'Crash content' } }));
  process.exit(0);
}
if (args[0] === 'screenrecord') {
  const output = args[args.indexOf('--output') + 1];
  process.on('SIGINT', () => {
    fs.writeFileSync(output, 'fake-video');
    process.exit(0);
  });
  setInterval(() => {}, 1000);
  return;
}
process.exit(0);
`);

	const env: NodeJS.ProcessEnv = {
		...process.env,
		PATH: `${binDir}:${process.env.PATH || ""}`,
		GO_IOS_PATH: path.join(binDir, "ios"),
		IOS_AUTOMATION_RECORDING_STATE_FILE: path.join(tempDir, "recordings.json"),
		IOS_AUTOMATION_TEST_IOS_LOG: iosCommandLog,
		IOS_AUTOMATION_TEST_MOBILECLI_LOG: mobilecliCommandLog,
	};

	return { tempDir, env };
};

const runIosSkill = (env: NodeJS.ProcessEnv, ...args: string[]) => {
	fs.chmodSync(SCRIPT_PATH, 0o755);
	const output = execFileSync(SCRIPT_PATH, args, {
		cwd: process.cwd(),
		env,
		encoding: "utf8",
	});
	return JSON.parse(output) as { status: string; data: any };
};

const runIosSkillAsync = async (env: NodeJS.ProcessEnv, ...args: string[]) => {
	fs.chmodSync(SCRIPT_PATH, 0o755);
	const output = await new Promise<string>((resolve, reject) => {
		execFile(SCRIPT_PATH, args, {
			cwd: process.cwd(),
			env,
			encoding: "utf8",
		}, (error, stdout) => {
			if (error) {
				reject(error);
				return;
			}

			resolve(stdout);
		});
	});

	return JSON.parse(output) as { status: string; data: any };
};

describe("ios skill", () => {
	it("lists iOS real devices and simulators through the self-contained skill", () => {
		const { tempDir, env } = createBaseEnvironment();
		try {
			const result = runIosSkill(env, "devices:list");
			assert.equal(result.status, "ok");
			assert.equal(result.data.devices.length, 2);
			assert.ok(result.data.devices.find((device: any) => device.id === "real-ios-1"));
			assert.ok(result.data.devices.find((device: any) => device.id === "sim-1"));
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("captures screenshots from an iOS simulator through the self-contained skill", () => {
		const { tempDir, env } = createBaseEnvironment();
		try {
			const outputPath = path.join(tempDir, "ios.png");
			const result = runIosSkill(env, "screen:screenshot", "--device", "sim-1", "--output", outputPath);
			assert.equal(result.status, "ok");
			assert.equal(result.data.path, outputPath);
			assert.equal(result.data.width, 1);
			assert.ok(fs.existsSync(outputPath));
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("talks to a fake WebDriverAgent for iOS real-device automation", async () => {
		const { tempDir, env } = createBaseEnvironment();
		const tunnelPort = 62105;
		const wdaPort = 18100;
		const tunnelServer = net.createServer(socket => socket.end());
		const wdaServer = http.createServer((request, response) => {
			if (!request.url) {
				response.statusCode = 404;
				response.end();
				return;
			}

			if (request.method === 'GET' && request.url === '/status') {
				response.setHeader('Content-Type', 'application/json');
				response.end(JSON.stringify({ value: { ready: true } }));
				return;
			}

			if (request.method === 'POST' && request.url === '/session') {
				response.setHeader('Content-Type', 'application/json');
				response.end(JSON.stringify({ value: { sessionId: 'session-1' } }));
				return;
			}

			if (request.method === 'DELETE' && request.url === '/session/session-1') {
				response.setHeader('Content-Type', 'application/json');
				response.end(JSON.stringify({ value: null }));
				return;
			}

			if (request.method === 'GET' && request.url === '/session/session-1/wda/screen') {
				response.setHeader('Content-Type', 'application/json');
				response.end(JSON.stringify({ value: { screenSize: { width: 393, height: 852 }, scale: 3 } }));
				return;
			}

			response.statusCode = 404;
			response.end();
		});

		await new Promise<void>(resolve => tunnelServer.listen(tunnelPort, resolve));
		await new Promise<void>(resolve => wdaServer.listen(wdaPort, resolve));

		try {
			const result = await runIosSkillAsync({ ...env, IOS_AUTOMATION_TUNNEL_PORT: String(tunnelPort), IOS_AUTOMATION_WDA_PORT: String(wdaPort) }, 'screen:size', '--device', 'real-ios-1');
			assert.equal(result.status, 'ok');
			assert.equal(result.data.screenSize.width, 393);
			assert.equal(result.data.screenSize.scale, 3);
		} finally {
			await new Promise<void>(resolve => wdaServer.close(() => resolve()));
			await new Promise<void>(resolve => tunnelServer.close(() => resolve()));
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("starts and stops recordings through the iOS skill script", () => {
		const { tempDir, env } = createBaseEnvironment();
		try {
			const outputPath = path.join(tempDir, 'ios.mp4');
			const started = runIosSkill(env, 'screen:record-start', '--device', 'sim-1', '--output', outputPath);
			assert.equal(started.status, 'ok');
			const stopped = runIosSkill(env, 'screen:record-stop', '--device', 'sim-1');
			assert.equal(stopped.status, 'ok');
			assert.ok(fs.existsSync(outputPath));
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("reports doctor information for the self-contained iOS skill", () => {
		const { tempDir, env } = createBaseEnvironment();
		try {
			const result = runIosSkill(env, "doctor");
			assert.equal(result.status, "ok");
			assert.equal(result.data.dependencies.mobilecli.available, true);
			assert.equal(result.data.dependencies.goIos.available, true);
			assert.equal(result.data.dependencies.goIos.realDevices, 1);
			assert.equal(result.data.dependencies.simulators.count, 1);
			assert.equal(result.data.stateFile, env.IOS_AUTOMATION_RECORDING_STATE_FILE);
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("lists installed apps on an iOS simulator", async () => {
		const { tempDir, env } = createBaseEnvironment();
		try {
			const result = await runIosSkillAsync(env, "apps:list", "--device", "sim-1");
			assert.equal(result.status, "ok");
			assert.deepEqual(result.data.apps, [{ packageName: "com.apple.Preferences", appName: "Settings" }]);
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("launches an iOS simulator app with locale forwarding", async () => {
		const { tempDir, env } = createBaseEnvironment();
		try {
			const result = await runIosSkillAsync(env, "apps:launch", "--device", "sim-1", "--package", "com.apple.mobilenotes", "--locale", "zh-CN,en-US");
			assert.equal(result.status, "ok");
			assert.equal(result.data.packageName, "com.apple.mobilenotes");
			assert.equal(result.data.locale, "zh-CN,en-US");

			const commands = readCommandLog(path.join(tempDir, "mobilecli-commands.log"));
			assert.ok(commands.some(command => command.includes('"apps","launch","com.apple.mobilenotes","--locale","zh-CN,en-US","--device","sim-1"')));
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("terminates an iOS simulator app", async () => {
		const { tempDir, env } = createBaseEnvironment();
		try {
			const result = await runIosSkillAsync(env, "apps:terminate", "--device", "sim-1", "--package", "com.apple.mobilenotes");
			assert.equal(result.status, "ok");
			assert.equal(result.data.packageName, "com.apple.mobilenotes");

			const commands = readCommandLog(path.join(tempDir, "mobilecli-commands.log"));
			assert.ok(commands.some(command => command.includes('"apps","terminate","com.apple.mobilenotes","--device","sim-1"')));
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("returns visible elements from an iOS simulator", async () => {
		const { tempDir, env } = createBaseEnvironment();
		try {
			const result = await runIosSkillAsync(env, "screen:elements", "--device", "sim-1");
			assert.equal(result.status, "ok");
			assert.equal(result.data.elements.length, 1);
			assert.equal(result.data.elements[0].label, "Continue");
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("types text and submits on an iOS simulator", async () => {
		const { tempDir, env } = createBaseEnvironment();
		try {
			const result = await runIosSkillAsync(env, "screen:type", "--device", "sim-1", "--text", "note from test", "--submit");
			assert.equal(result.status, "ok");
			assert.equal(result.data.text, "note from test");
			assert.equal(result.data.submit, true);

			const commands = readCommandLog(path.join(tempDir, "mobilecli-commands.log"));
			assert.ok(commands.some(command => command.includes('"io","text","note from test","--device","sim-1"')));
			assert.ok(commands.some(command => command.includes('"io","button","ENTER","--device","sim-1"')));
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("gets and sets simulator orientation", async () => {
		const { tempDir, env } = createBaseEnvironment();
		try {
			const current = await runIosSkillAsync(env, "orientation:get", "--device", "sim-1");
			assert.equal(current.status, "ok");
			assert.equal(current.data.orientation, "portrait");

			const updated = await runIosSkillAsync(env, "orientation:set", "--device", "sim-1", "--orientation", "landscape");
			assert.equal(updated.status, "ok");
			assert.equal(updated.data.orientation, "landscape");

			const commands = readCommandLog(path.join(tempDir, "mobilecli-commands.log"));
			assert.ok(commands.some(command => command.includes('"device","orientation","set","landscape","--device","sim-1"')));
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("lists, allocates, and releases iOS remote devices", () => {
		const { tempDir, env } = createBaseEnvironment();
		try {
			const listed = runIosSkill(env, "remote:list");
			assert.equal(listed.status, "ok");
			assert.equal(listed.data.result.status, "ok");
			assert.equal(listed.data.result.data[0].id, "ios-remote-1");

			const allocated = runIosSkill(env, "remote:allocate");
			assert.equal(allocated.status, "ok");
			assert.equal(allocated.data.result.data.id, "ios-remote-1");

			const released = runIosSkill(env, "remote:release", "--device", "ios-remote-1");
			assert.equal(released.status, "ok");
			assert.equal(released.data.result.data.released, true);
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("lists and fetches iOS crash reports", () => {
		const { tempDir, env } = createBaseEnvironment();
		try {
			const listed = runIosSkill(env, "crashes:list", "--device", "sim-1");
			assert.equal(listed.status, "ok");
			assert.equal(listed.data.crashes[0].id, "crash-1");

			const crash = runIosSkill(env, "crashes:get", "--device", "sim-1", "--id", "crash-1");
			assert.equal(crash.status, "ok");
			assert.equal(crash.data.id, "crash-1");
			assert.equal(crash.data.content, "Crash content");
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("rejects unsafe URLs unless explicitly allowed", async () => {
		const { tempDir, env } = createBaseEnvironment();
		try {
			await assert.rejects(
				runIosSkillAsync(env, "screen:open-url", "--device", "sim-1", "--url", "notes://create"),
				(error: Error) => error.message.includes("Command failed")
			);
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("allows unsafe URLs when explicitly enabled", async () => {
		const { tempDir, env } = createBaseEnvironment();
		try {
			const result = await runIosSkillAsync({ ...env, IOS_AUTOMATION_ALLOW_UNSAFE_URLS: "1" }, "screen:open-url", "--device", "sim-1", "--url", "notes://create");
			assert.equal(result.status, "ok");
			assert.equal(result.data.url, "notes://create");

			const commands = readCommandLog(path.join(tempDir, "mobilecli-commands.log"));
			assert.ok(commands.some(command => command.includes('"url","notes://create","--device","sim-1"')));
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});
});
