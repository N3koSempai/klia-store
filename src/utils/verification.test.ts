import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyVerification } from "./verification.ts";

const src = (error?: string, platform?: string) => ({
	url: "u",
	commit: "c",
	verified: false,
	error,
	platform,
});

test("hash mismatch is detected and never reported as unavailable", () => {
	const f = classifyVerification({
		sources: [src("Hash mismatch: tag not found")],
	});
	assert.equal(f.isHashMismatch, true);
	assert.equal(f.isSourceUnavailable, false);
});

test("source unavailable for tag / fetch / not found errors", () => {
	for (const msg of [
		"Tag v1 missing",
		"Could not verify source",
		"Not Found",
		"Failed to fetch manifest",
	]) {
		const f = classifyVerification({ sources: [src(msg)] });
		assert.equal(f.isSourceUnavailable, true, msg);
		assert.equal(f.isHashMismatch, false, msg);
	}
});

test("falls back to the top-level error when sources are empty", () => {
	const f = classifyVerification({
		sources: [],
		error: "Failed to fetch manifest: 404",
	});
	assert.equal(f.isSourceUnavailable, true);
	assert.equal(f.isUnsupportedPlatform, false);
});

test("unsupported platform flag", () => {
	assert.equal(
		classifyVerification({ sources: [src(undefined, "unsupported")] })
			.isUnsupportedPlatform,
		true,
	);
	assert.equal(classifyVerification({ sources: [] }).isUnsupportedPlatform, false);
});

test("clean result has no flags", () => {
	assert.deepEqual(classifyVerification({ sources: [src()] }), {
		isHashMismatch: false,
		isUnsupportedPlatform: false,
		isSourceUnavailable: false,
	});
});
