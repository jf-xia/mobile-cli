export interface PngDimensions {
	width: number;
	height: number;
}

export class PNG {
	private readonly buffer: Buffer;

	public constructor(buffer: Buffer) {
		this.buffer = buffer;
	}

	public getDimensions(): PngDimensions {
		const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
		if (!this.buffer.subarray(0, 8).equals(pngSignature)) {
			throw new Error("Not a valid PNG file");
		}

		return {
			width: this.buffer.readUInt32BE(16),
			height: this.buffer.readUInt32BE(20),
		};
	}
}
