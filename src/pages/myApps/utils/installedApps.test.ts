import assert from "node:assert/strict";
import { test } from "node:test";
import {
	sortDebApps,
	sortInstalledApps,
	toDebAppInfo,
	toInstalledAppInfo,
} from "./installedApps.ts";

test("toInstalledAppInfo builds instanceId from id and version", () => {
	const info = toInstalledAppInfo({
		app_id: "org.a.B",
		name: "B",
		version: "1.0",
		source: "flathub",
	});
	assert.equal(info.instanceId, "org.a.B-1.0");
	assert.equal(info.appId, "org.a.B");
});

test("toDebAppInfo marks source as deb", () => {
	const info = toDebAppInfo({
		package: "vim",
		name: "Vim",
		version: "9",
		icon_path: "/i.png",
	});
	assert.equal(info.source, "deb");
	assert.equal(info.instanceId, "deb-vim");
	assert.equal(info.iconPath, "/i.png");
});

test("sortInstalledApps puts apps with updates first, then by name", () => {
	const apps = [
		{ appId: "a", name: "Zed" },
		{ appId: "b", name: "Alpha" },
		{ appId: "c", name: "Beta" },
	];
	const sorted = sortInstalledApps(apps, { a: {} }, false);
	assert.deepEqual(
		sorted.map((x) => x.appId),
		["a", "b", "c"],
	);
});

test("sortInstalledApps ignores updates while loading and does not mutate", () => {
	const apps = [
		{ appId: "a", name: "Zed" },
		{ appId: "b", name: "Alpha" },
	];
	const sorted = sortInstalledApps(apps, { a: {} }, true);
	assert.deepEqual(
		sorted.map((x) => x.appId),
		["b", "a"],
	);
	assert.equal(apps[0].appId, "a");
});

test("sortDebApps sorts alphabetically", () => {
	assert.deepEqual(
		sortDebApps([{ name: "b" }, { name: "a" }]).map((x) => x.name),
		["a", "b"],
	);
});
