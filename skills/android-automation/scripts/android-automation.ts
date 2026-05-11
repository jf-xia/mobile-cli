#!/usr/bin/env -S node --experimental-strip-types
import { AndroidAutomationService } from "./android-service.ts";
import { ensureMobilecliInstalled } from "./mobilecli.ts";
import { ActionableError, type Button, type Orientation, type SwipeDirection } from "./robot.ts";

type ParsedOptions = Record<string, string | boolean>;

const printSuccess = (data: unknown): void => {
	console.log(JSON.stringify({ status: "ok", data }, null, 2));
};

const printError = (error: unknown): void => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(JSON.stringify({ status: "error", error: { message } }, null, 2));
	process.exitCode = 1;
};

const parseOptions = (argv: string[]): ParsedOptions => {
	const options: ParsedOptions = {};
	for (let index = 0; index < argv.length; index += 1) {
		const token = argv[index];
		if (!token.startsWith("--")) {
			throw new ActionableError(`Unexpected argument: ${token}`);
		}

		const key = token.substring(2);
		const nextToken = argv[index + 1];
		if (!nextToken || nextToken.startsWith("--")) {
			options[key] = true;
			continue;
		}

		options[key] = nextToken;
		index += 1;
	}

	return options;
};

const readString = (options: ParsedOptions, key: string, required = true): string | undefined => {
	const value = options[key];
	if (value === undefined) {
		if (required) {
			throw new ActionableError(`Missing required option --${key}`);
		}
		return undefined;
	}

	if (typeof value !== "string") {
		throw new ActionableError(`Option --${key} requires a value`);
	}

	return value;
};

const readNumber = (options: ParsedOptions, key: string, required = true): number | undefined => {
	const value = readString(options, key, required);
	if (value === undefined) {
		return undefined;
	}

	const parsed = Number(value);
	if (!Number.isFinite(parsed)) {
		throw new ActionableError(`Option --${key} must be a valid number`);
	}

	return parsed;
};

const readBoolean = (options: ParsedOptions, key: string): boolean => {
	return options[key] === true;
};

const main = async (): Promise<void> => {
	ensureMobilecliInstalled();
	const [command, ...argv] = process.argv.slice(2);
	if (!command) {
		throw new ActionableError("Missing command. Example: devices:list");
	}

	const options = parseOptions(argv);
	const service = new AndroidAutomationService();

	switch (command) {
		case "doctor":
			printSuccess(service.doctor());
			return;
		case "devices:list":
			printSuccess(service.listAvailableDevices());
			return;
		case "remote:list":
			printSuccess(service.listRemoteDevices());
			return;
		case "remote:allocate":
			printSuccess(service.allocateRemoteDevice((readString(options, "platform", false) || "android") as "android" | "ios"));
			return;
		case "remote:release":
			printSuccess(service.releaseRemoteDevice(readString(options, "device")!));
			return;
		case "apps:list":
			printSuccess(await service.listApps(readString(options, "device")!));
			return;
		case "apps:launch":
			printSuccess(await service.launchApp(readString(options, "device")!, readString(options, "package")!, readString(options, "locale", false)));
			return;
		case "apps:terminate":
			printSuccess(await service.terminateApp(readString(options, "device")!, readString(options, "package")!));
			return;
		case "apps:install":
			printSuccess(await service.installApp(readString(options, "device")!, readString(options, "path")!));
			return;
		case "apps:uninstall":
			printSuccess(await service.uninstallApp(readString(options, "device")!, readString(options, "bundle-id")!));
			return;
		case "screen:size":
			printSuccess(await service.getScreenSize(readString(options, "device")!));
			return;
		case "screen:tap":
			printSuccess(await service.tap(readString(options, "device")!, readNumber(options, "x")!, readNumber(options, "y")!));
			return;
		case "screen:double-tap":
			printSuccess(await service.doubleTap(readString(options, "device")!, readNumber(options, "x")!, readNumber(options, "y")!));
			return;
		case "screen:long-press":
			printSuccess(await service.longPress(readString(options, "device")!, readNumber(options, "x")!, readNumber(options, "y")!, readNumber(options, "duration", false) || 500));
			return;
		case "screen:elements":
			printSuccess(await service.listElements(readString(options, "device")!));
			return;
		case "screen:button":
			printSuccess(await service.pressButton(readString(options, "device")!, readString(options, "button")! as Button));
			return;
		case "screen:open-url":
			printSuccess(await service.openUrl(readString(options, "device")!, readString(options, "url")!));
			return;
		case "screen:swipe":
			printSuccess(await service.swipe(readString(options, "device")!, readString(options, "direction")! as SwipeDirection, readNumber(options, "x", false), readNumber(options, "y", false), readNumber(options, "distance", false)));
			return;
		case "screen:type":
			printSuccess(await service.typeKeys(readString(options, "device")!, readString(options, "text")!, readBoolean(options, "submit")));
			return;
		case "screen:screenshot":
			printSuccess(await service.saveScreenshot(readString(options, "device")!, readString(options, "output", false)));
			return;
		case "screen:record-start":
			printSuccess(await service.startScreenRecording(readString(options, "device")!, readString(options, "output", false), readNumber(options, "time-limit", false)));
			return;
		case "screen:record-stop":
			printSuccess(await service.stopScreenRecording(readString(options, "device")!));
			return;
		case "orientation:get":
			printSuccess(await service.getOrientation(readString(options, "device")!));
			return;
		case "orientation:set":
			printSuccess(await service.setOrientation(readString(options, "device")!, readString(options, "orientation")! as Orientation));
			return;
		case "crashes:list":
			printSuccess(service.listCrashes(readString(options, "device")!));
			return;
		case "crashes:get":
			printSuccess(service.getCrash(readString(options, "device")!, readString(options, "id")!));
			return;
		default:
			throw new ActionableError(`Unknown command: ${command}`);
	}
};

main().catch(error => {
	printError(error);
});
