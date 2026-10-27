import assert from "node:assert/strict";
import { test } from "node:test";
import { appendPtyLine, stripAnsi } from "./ptyOutput.ts";

test("stripAnsi removes colors, cursor codes and keeps block chars", () => {
	assert.equal(stripAnsi("\x1b[31mred\x1b[0m"), "red");
	assert.equal(stripAnsi("\x1b[?25lhi\x1b[2K"), "hi");
	assert.equal(stripAnsi("a b"), "a b");
	assert.equal(stripAnsi("██░░ 50%"), "██░░ 50%");
});

test("stripAnsi removes OSC sequences (ST and BEL terminated)", () => {
	// flatpak's terminal progress indicator, as captured from a real install
	assert.equal(stripAnsi("\x1b]9;4;0\x1b\\\x1b[?25h"), "");
	assert.equal(stripAnsi("a\x1b]9;4;1;50\x1b\\b"), "ab");
	assert.equal(stripAnsi("\x1b]0;title\x07text"), "text");
	// unterminated OSC at the end of a chunk
	assert.equal(stripAnsi("done\x1b]9;4;0"), "done");
});

test("stripAnsi removes charset escapes and stray control characters", () => {
	assert.equal(stripAnsi("\x1b(Bhello"), "hello");
	assert.equal(stripAnsi("a\x07b\x08c\x1bd"), "abcd");
	// tabs are kept
	assert.equal(stripAnsi("a\tb"), "a\tb");
});

test("real flatpak error line renders without escape leftovers", () => {
	const raw =
		"\x1b]9;4;0\x1b\\\x1b[?25h\x1b[31m\x1b[1merror: \x1b[22m\x1b[0mFailed to open file";
	assert.deepEqual(appendPtyLine([], raw), ["error: Failed to open file"]);
});

test("appendPtyLine appends new lines and skips blank ones", () => {
	assert.deepEqual(appendPtyLine([], "hello"), ["hello"]);
	assert.deepEqual(appendPtyLine(["a"], "   "), ["a"]);
});

test("a leading \\r overwrites the last line (progress updates)", () => {
	assert.deepEqual(appendPtyLine(["Installing 10%"], "\rInstalling 20%"), [
		"Installing 20%",
	]);
});

test("\\r-separated chunk keeps first part as new line, overwrites with the rest", () => {
	assert.deepEqual(appendPtyLine(["x"], "Installing 10%\rInstalling 30%"), [
		"x",
		"Installing 30%",
	]);
});

test("deduplicates consecutive and recent header lines", () => {
	assert.deepEqual(appendPtyLine(["same"], "same"), ["same"]);
	assert.deepEqual(appendPtyLine(["ID  Branch", "other"], "ID  Branch"), [
		"ID  Branch",
		"other",
	]);
	// progress lines are never deduplicated
	assert.deepEqual(appendPtyLine(["50%"], "50%"), ["50%", "50%"]);
});
