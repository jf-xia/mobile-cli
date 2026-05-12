import { Socket } from "node:net";

export const getGoIosPath = (): string => process.env.GO_IOS_PATH || "ios";
export const getWdaPort = (): number => Number(process.env.IOS_AUTOMATION_WDA_PORT || 8100);
export const getTunnelPort = (): number => Number(process.env.IOS_AUTOMATION_TUNNEL_PORT || 60105);
export const getWdaStartTimeout = (): number => Number(process.env.IOS_WDA_START_TIMEOUT || "60000");

export const isListeningOnPort = (port: number): Promise<boolean> => {
	return new Promise(resolve => {
		const client = new Socket();
		const onError = () => {
			client.destroy();
			resolve(false);
		};
		client.setTimeout(2000, () => onError());
		client.connect(port, "localhost", () => {
			client.destroy();
			resolve(true);
		});
		client.on("error", onError);
	});
};

export const isListeningOnPortSync = (port: number): boolean => {
	try {
		const { execFileSync } = require("node:child_process");
		execFileSync("lsof", ["-ti", String(port)], { stdio: ["pipe", "pipe", "ignore"] });
		return true;
	} catch {
		return false;
	}
};
