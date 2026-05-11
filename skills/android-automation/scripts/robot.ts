export interface Dimensions {
	width: number;
	height: number;
}

export interface ScreenSize extends Dimensions {
	scale: number;
}

export interface InstalledApp {
	packageName: string;
	appName: string;
}

export type SwipeDirection = "up" | "down" | "left" | "right";

export type Button = "HOME" | "BACK" | "VOLUME_UP" | "VOLUME_DOWN" | "ENTER" | "DPAD_CENTER" | "DPAD_UP" | "DPAD_DOWN" | "DPAD_LEFT" | "DPAD_RIGHT";

export interface ScreenElementRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface ScreenElement {
	type: string;
	label?: string;
	text?: string;
	name?: string;
	value?: string;
	identifier?: string;
	rect: ScreenElementRect;
	focused?: boolean;
}

export class ActionableError extends Error {
	public constructor(message: string) {
		super(message);
	}
}

export type Orientation = "portrait" | "landscape";

export interface Robot {
	getScreenSize(): Promise<ScreenSize>;
	swipe(direction: SwipeDirection): Promise<void>;
	swipeFromCoordinate(x: number, y: number, direction: SwipeDirection, distance?: number): Promise<void>;
	getScreenshot(): Promise<Buffer>;
	listApps(): Promise<InstalledApp[]>;
	launchApp(packageName: string, locale?: string): Promise<void>;
	terminateApp(packageName: string): Promise<void>;
	installApp(path: string): Promise<void>;
	uninstallApp(bundleId: string): Promise<void>;
	openUrl(url: string): Promise<void>;
	sendKeys(text: string): Promise<void>;
	pressButton(button: Button): Promise<void>;
	tap(x: number, y: number): Promise<void>;
	doubleTap(x: number, y: number): Promise<void>;
	longPress(x: number, y: number, duration: number): Promise<void>;
	getElementsOnScreen(): Promise<ScreenElement[]>;
	setOrientation(orientation: Orientation): Promise<void>;
	getOrientation(): Promise<Orientation>;
}
