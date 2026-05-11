import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYAAAAAMAAWgmWQ0AAAAASUVORK5CYII=";
const SCRIPT_PATH = path.resolve(process.cwd(), ".github/skills/android-automation/scripts/android-automation.ts");

const writeExecutable = (filePath: string, content: string): void => {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, content, { mode: 0o755 });
	fs.chmodSync(filePath, 0o755);
};

const createBaseEnvironment = (): { tempDir: string; env: NodeJS.ProcessEnv } => {
	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "android-skill-test-"));
	const binDir = path.join(tempDir, "bin");
	const androidHome = path.join(tempDir, "android-sdk");
	const platformToolsDir = path.join(androidHome, "platform-tools");
	fs.mkdirSync(binDir, { recursive: true });
	fs.mkdirSync(platformToolsDir, { recursive: true });

	writeExecutable(path.join(platformToolsDir, "adb"), `#!/usr/bin/env node
const args = process.argv.slice(2);
const png = Buffer.from(${JSON.stringify(PNG_BASE64)}, 'base64');

if (args.length === 1 && args[0] === 'devices') {
  process.stdout.write('List of devices attached\\nemulator-5554\\tdevice\\n');
  process.exit(0);
}

if (args[0] === '-s' && args[1] === 'emulator-5554' && args[2] === 'shell' && args[3] === 'pm' && args[4] === 'list' && args[5] === 'features') {
  process.stdout.write('feature:android.hardware.touchscreen\\n');
  process.exit(0);
}

if (args[0] === '-s' && args[1] === 'emulator-5554' && args[2] === 'shell' && args[3] === 'getprop' && args[4] === 'ro.build.version.release') {
  process.stdout.write('15\\n');
  process.exit(0);
}

if (args[0] === '-s' && args[1] === 'emulator-5554' && args[2] === 'shell' && args[3] === 'getprop' && args[4] === 'ro.boot.qemu.avd_name') {
  process.stdout.write('Pixel_9_Pro\\n');
  process.exit(0);
}

if (args[0] === '-s' && args[1] === 'emulator-5554' && args[2] === 'shell' && args[3] === 'getprop' && args[4] === 'ro.product.model') {
  process.stdout.write('Pixel 9 Pro\\n');
  process.exit(0);
}

if (args[0] === '-s' && args[1] === 'emulator-5554' && args[2] === 'shell' && args[3] === 'wm' && args[4] === 'size') {
  process.stdout.write('Physical size: 1080x2400\\n');
  process.exit(0);
}

if (args[0] === '-s' && args[1] === 'emulator-5554' && args[2] === 'shell' && args[3] === 'settings' && args[4] === 'get' && args[5] === 'system' && args[6] === 'user_rotation') {
  process.stdout.write('0\\n');
  process.exit(0);
}

if (args[0] === '-s' && args[1] === 'emulator-5554' && args[2] === 'exec-out' && args[3] === 'screencap' && args[4] === '-p') {
  process.stdout.write(png);
  process.exit(0);
}

if (args[0] === '-s' && args[1] === 'emulator-5554' && args[2] === 'exec-out' && args[3] === 'uiautomator' && args[4] === 'dump' && args[5] === '/dev/tty') {
  process.stdout.write('<?xml version="1.0"?><hierarchy><node text="Continue" content-desc="Continue" bounds="[10,20][110,64]" class="android.widget.Button"/></hierarchy>');
  process.exit(0);
}

if (args[0] === '-s' && args[1] === 'emulator-5554' && args[2] === 'shell' && args[3] === 'cmd' && args[4] === 'package' && args[5] === 'query-activities') {
  process.stdout.write('packageName=com.android.settings\\npackageName=com.android.chrome\\n');
  process.exit(0);
}

if (args[0] === '-s' && args[1] === 'emulator-5554' && args[2] === 'shell' && args[3] === 'pm' && args[4] === 'list' && args[5] === 'packages') {
  process.stdout.write('package:com.android.settings\\n');
  process.exit(0);
}

process.exit(0);
`);

	writeExecutable(path.join(binDir, "mobilecli"), `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);

if (args[0] === '--version') {
  process.stdout.write('mobilecli version 9.9.9\\n');
  process.exit(0);
}

if (args[0] === 'remote' && args[1] === 'list-devices') {
  process.stdout.write(JSON.stringify({ status: 'ok', data: [{ id: 'android-remote-1' }] }));
  process.exit(0);
}

if (args[0] === 'remote' && args[1] === 'allocate') {
  process.stdout.write(JSON.stringify({ status: 'ok', data: { id: 'android-remote-1' } }));
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
		ANDROID_HOME: androidHome,
		PATH: `${binDir}:${process.env.PATH || ""}`,
		ANDROID_AUTOMATION_RECORDING_STATE_FILE: path.join(tempDir, "recordings.json"),
	};

	return { tempDir, env };
};

const runAndroidSkill = (env: NodeJS.ProcessEnv, ...args: string[]) => {
	fs.chmodSync(SCRIPT_PATH, 0o755);
	const output = execFileSync(SCRIPT_PATH, args, {
		cwd: process.cwd(),
		env,
		encoding: "utf8",
	});
	return JSON.parse(output) as { status: string; data: any };
};

describe("android skill", () => {
	it("lists Android devices through the self-contained skill script", () => {
		const { tempDir, env } = createBaseEnvironment();
		try {
			const result = runAndroidSkill(env, "devices:list");
			assert.equal(result.status, "ok");
			assert.equal(result.data.devices.length, 1);
			assert.equal(result.data.devices[0].id, "emulator-5554");
			assert.equal(result.data.devices[0].name, "Pixel 9 Pro");
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("captures screenshots through the Android skill script", () => {
		const { tempDir, env } = createBaseEnvironment();
		try {
			const outputPath = path.join(tempDir, "screen.png");
			const result = runAndroidSkill(env, "screen:screenshot", "--device", "emulator-5554", "--output", outputPath);
			assert.equal(result.status, "ok");
			assert.equal(result.data.path, outputPath);
			assert.ok(fs.existsSync(outputPath));
			assert.equal(result.data.width, 1);
			assert.equal(result.data.height, 1);
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("starts and stops recordings through the Android skill script", () => {
		const { tempDir, env } = createBaseEnvironment();
		try {
			const outputPath = path.join(tempDir, "recording.mp4");
			const started = runAndroidSkill(env, "screen:record-start", "--device", "emulator-5554", "--output", outputPath);
			assert.equal(started.status, "ok");
			assert.ok(started.data.pid > 0);

			const stopped = runAndroidSkill(env, "screen:record-stop", "--device", "emulator-5554");
			assert.equal(stopped.status, "ok");
			assert.equal(stopped.data.outputPath, outputPath);
			assert.ok(fs.existsSync(outputPath));
			assert.equal(fs.readFileSync(outputPath, "utf8"), "fake-video");
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("installs mobilecli automatically when the binary is missing", () => {
		const { tempDir, env } = createBaseEnvironment();
		try {
			const binDir = path.join(tempDir, "bin");
			fs.rmSync(path.join(binDir, "mobilecli"), { force: true });
			writeExecutable(path.join(binDir, "node"), `#!/bin/sh
exec ${process.execPath} "$@"
`);
			const fakePrefix = path.join(tempDir, "npm-global");
			const fakeNpmPath = path.join(binDir, "npm");
			writeExecutable(fakeNpmPath, `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const prefix = ${JSON.stringify(fakePrefix)};

if (args[0] === 'prefix' && args[1] === '-g') {
  process.stdout.write(prefix + '\\n');
  process.exit(0);
}

if (args[0] === 'install' && args[1] === '-g' && args[2] === 'mobilecli@latest') {
  const globalBin = path.join(prefix, 'bin');
  fs.mkdirSync(globalBin, { recursive: true });
  const mobilecliPath = path.join(globalBin, 'mobilecli');
  fs.writeFileSync(mobilecliPath, '#!/usr/bin/env node\\nif (process.argv[2] === "--version") { console.log("mobilecli version 1.0.0"); process.exit(0); }\\nconsole.log(JSON.stringify({ status: "ok", data: [] }));\\n', { mode: 0o755 });
  fs.chmodSync(mobilecliPath, 0o755);
  process.exit(0);
}

process.exit(1);
`);

			const installEnv = {
				...env,
				PATH: binDir,
			};

			const result = runAndroidSkill(installEnv, "doctor");
			assert.equal(result.status, "ok");
			assert.ok(fs.existsSync(path.join(fakePrefix, "bin", "mobilecli")));
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});
});
