// Strips ANSI escape codes while preserving Unicode block characters
// (█, ▓, ▒, ░) used for progress bars.
export const stripAnsi = (str: string): string =>
	str
		// OSC sequences (ESC ] ... terminated by BEL or ESC \). flatpak emits
		// `ESC ] 9;4;N ESC \` as a terminal progress indicator; without this the
		// payload leaks into the output as visible text like `]9;4;0\`.
		// biome-ignore lint/suspicious/noControlCharactersInRegex: intentional ANSI stripping
		.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "")
		// Unterminated OSC at the end of a chunk.
		// biome-ignore lint/suspicious/noControlCharactersInRegex: intentional ANSI stripping
		.replace(/\x1b\][^\x07\x1b]*$/g, "")
		// biome-ignore lint/suspicious/noControlCharactersInRegex: intentional ANSI stripping
		.replace(/\x1b\[[0-9;]*m/g, "")
		// biome-ignore lint/suspicious/noControlCharactersInRegex: intentional ANSI stripping
		.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "")
		// biome-ignore lint/suspicious/noControlCharactersInRegex: intentional ANSI stripping
		.replace(/\x1b\[(\?)?[0-9;]*[A-Za-z]/g, "")
		// Charset selection (ESC ( B) and keypad mode (ESC = / ESC >)
		// biome-ignore lint/suspicious/noControlCharactersInRegex: intentional ANSI stripping
		.replace(/\x1b[()][0-9A-Za-z]|\x1b[=>]/g, "")
		// Device status report sequences ([6n)
		.replace(/\[(\d+)n/g, "")
		// Leftover control characters (stray ESC, BEL, backspace...). Keeps \t,
		// \n and \r, which the callers handle.
		// biome-ignore lint/suspicious/noControlCharactersInRegex: intentional control stripping
		.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "")
		// Non-breaking space -> regular space
		.replace(/\u00a0/g, " ");

// Merges one chunk of PTY output (which may hold several `\r`-separated
// updates) into the terminal lines: `\r` overwrites the last line, and
// repeated header/info lines are deduplicated.
export const appendPtyLine = (prev: string[], rawLine: string): string[] => {
	let lines = prev;
	const parts = rawLine.split("\r");

	for (let i = 0; i < parts.length; i++) {
		const cleanPart = stripAnsi(parts[i]);
		if (!cleanPart.trim()) continue;

		// Not the first part of a split by \r, or the line started with \r:
		// overwrite the last line.
		if ((i > 0 || rawLine.startsWith("\r")) && lines.length > 0) {
			lines = [...lines.slice(0, -1), cleanPart];
			continue;
		}

		const isProgress =
			cleanPart.includes("%") ||
			cleanPart.includes("/") ||
			cleanPart.includes("Installing") ||
			cleanPart.includes("Updating");

		if (!isProgress) {
			const isHeaderOrInfo =
				cleanPart.includes("permissions:") ||
				cleanPart.includes("ID") ||
				cleanPart.includes("Branch") ||
				cleanPart.includes("Remote") ||
				/^\s*\d+\./.test(cleanPart);

			if (
				isHeaderOrInfo &&
				lines.slice(-15).some((l) => l.trim() === cleanPart.trim())
			) {
				continue;
			}
			if (lines.length > 0 && lines[lines.length - 1] === cleanPart) {
				continue;
			}
		}

		lines = [...lines, cleanPart];
	}

	return lines;
};
