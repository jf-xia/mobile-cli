import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { ActionableError } from "./robot.ts";

export const validatePackageName = (packageName: string): void => {
	if (!/^[a-zA-Z0-9._]+$/.test(packageName)) {
		throw new ActionableError(`Invalid package name: "${packageName}"`);
	}
};

export const validateLocale = (locale: string): void => {
	if (!/^[a-zA-Z0-9,\- ]+$/.test(locale)) {
		throw new ActionableError(`Invalid locale: "${locale}"`);
	}
};

const getAllowedRoots = (): string[] => {
	const roots = [os.tmpdir(), process.cwd()];
	if (process.platform === "darwin") {
		roots.push("/tmp", "/private/tmp");
	}

	return roots.map(root => {
		const resolved = path.resolve(root);
		try {
			return fs.realpathSync(resolved);
		} catch {
			return resolved;
		}
	});
};

const isPathUnderRoot = (filePath: string, root: string): boolean => {
	const relative = path.relative(root, filePath);
	if (relative === "") {
		return false;
	}

	if (path.isAbsolute(relative)) {
		return false;
	}

	return !relative.startsWith("..");
};

export const validateFileExtension = (filePath: string, allowedExtensions: string[], toolName: string): void => {
	const extension = path.extname(filePath).toLowerCase();
	if (!allowedExtensions.includes(extension)) {
		throw new ActionableError(`${toolName} requires a ${allowedExtensions.join(", ")} file extension, got: "${extension || "(none)"}"`);
	}
};

const resolveWithSymlinks = (filePath: string): string => {
	const resolved = path.resolve(filePath);
	const dir = path.dirname(resolved);
	const fileName = path.basename(resolved);
	try {
		return path.join(fs.realpathSync(dir), fileName);
	} catch {
		return resolved;
	}
};

export const validateOutputPath = (filePath: string): void => {
	const resolved = resolveWithSymlinks(filePath);
	const allowedRoots = getAllowedRoots();
	const isWindows = process.platform === "win32";
	const isAllowed = allowedRoots.some(root => {
		if (isWindows) {
			return isPathUnderRoot(resolved.toLowerCase(), root.toLowerCase());
		}

		return isPathUnderRoot(resolved, root);
	});

	if (!isAllowed) {
		throw new ActionableError(`"${path.dirname(resolved)}" is not in the list of allowed directories. Allowed directories include the current directory and the temp directory on this host.`);
	}
};
