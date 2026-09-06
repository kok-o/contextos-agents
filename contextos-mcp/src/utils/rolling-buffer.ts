/**
 * Rolling string buffer with a maximum byte limit.
 *
 * Drops oldest chunks when the total accumulated length exceeds `maxBytes`.
 * Used by agent backends to prevent OOM when a runaway child process
 * produces unbounded stdout/stderr output.
 */
export class RollingBuffer {
	private chunks: string[] = [];
	private totalLength = 0;

	constructor(private readonly maxBytes: number = 2 * 1024 * 1024) {} // 2MB default

	append(text: string): void {
		this.chunks.push(text);
		this.totalLength += text.length;
		while (this.totalLength > this.maxBytes && this.chunks.length > 1) {
			const dropped = this.chunks.shift()!;
			this.totalLength -= dropped.length;
		}
	}

	toString(): string {
		return this.chunks.join("");
	}

	get length(): number {
		return this.totalLength;
	}
}
