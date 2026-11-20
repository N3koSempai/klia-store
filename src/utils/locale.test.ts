import assert from "node:assert/strict";
import { test } from "node:test";
import { primaryLanguage } from "./locale.ts";

test("reduces BCP-47 locales to the primary subtag", () => {
	assert.equal(primaryLanguage("es-ES"), "es");
	assert.equal(primaryLanguage("zh-CN"), "zh");
	assert.equal(primaryLanguage("en"), "en");
});

test("reduces POSIX locales (what get_system_locale returns)", () => {
	assert.equal(primaryLanguage("es_ES.UTF-8"), "es");
	assert.equal(primaryLanguage("zh_CN.UTF-8"), "zh");
	assert.equal(primaryLanguage("pt_BR"), "pt");
	assert.equal(primaryLanguage("fr_FR.UTF-8"), "fr");
});

test("falls back to en for empty or degenerate input", () => {
	assert.equal(primaryLanguage(""), "en");
});
