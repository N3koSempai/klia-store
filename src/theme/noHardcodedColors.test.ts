import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { test } from "node:test";

// El color vive en src/theme (tokens). Fuera de ahí se usan tokens o el tema,
// nunca literales hexadecimales.
const SRC = new URL("..", import.meta.url).pathname;
const HEX = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/;
const SKIP = ["routeTree.gen.ts"];

const walk = (dir: string): string[] =>
	readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) return walk(path);
		return /\.(ts|tsx)$/.test(name) ? [path] : [];
	});

test("no hay colores hexadecimales fuera de src/theme", () => {
	const offenders: string[] = [];
	for (const file of walk(SRC)) {
		if (file.includes(`${sep}theme${sep}`)) continue;
		if (SKIP.some((s) => file.endsWith(s)) || file.endsWith(".test.ts"))
			continue;
		readFileSync(file, "utf8")
			.split("\n")
			.forEach((line, i) => {
				const trimmed = line.trim();
				if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;
				if (HEX.test(line)) {
					offenders.push(`${file.replace(SRC, "src/")}:${i + 1}  ${trimmed}`);
				}
			});
	}
	assert.deepEqual(
		offenders,
		[],
		`Usa tokens de src/theme/tokens en vez de hex:\n${offenders.join("\n")}`,
	);
});
