import assert from "node:assert/strict";
import { test } from "node:test";
import { formatBytes } from "./formatBytes.ts";

test("formats bytes across units", () => {
	assert.equal(formatBytes(0), "0 B");
	assert.equal(formatBytes(512), "512 B");
	assert.equal(formatBytes(1536), "1.5 KB");
	assert.equal(formatBytes(5 * 1024 ** 2), "5.0 MB");
	assert.equal(formatBytes(3 * 1024 ** 3), "3.0 GB");
});

test("caps at GB for very large values", () => {
	assert.equal(formatBytes(2 * 1024 ** 4), "2048.0 GB");
});
