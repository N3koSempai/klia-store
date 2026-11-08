import assert from "node:assert/strict";
import { test } from "node:test";
import {
	assessAppPrivacy,
	assessMoney,
	assessSocial,
	assessStorage,
	assessSystem,
} from "./appPrivacy.ts";

const rating = (
	categories: Record<string, string>,
	minimumAge = 3,
): Record<
	string,
	{ minimumAge: number; categories: { id: string; level: string }[] }
> => ({
	en_US: {
		minimumAge,
		categories: Object.entries(categories).map(([id, level]) => ({
			id,
			level,
		})),
	},
});

test("storage: sin filesystems es seguro", () => {
	const focus = assessStorage({ filesystems: null });
	assert.equal(focus.level, "safe");
	assert.equal(focus.findings.length, 0);
});

test("storage: sin permisos es desconocido", () => {
	assert.equal(assessStorage(undefined).level, "unknown");
});

test("storage: home y host son rojo", () => {
	assert.equal(assessStorage({ filesystems: ["home"] }).level, "high");
	assert.equal(assessStorage({ filesystems: ["host"] }).level, "high");
	assert.equal(assessStorage({ filesystems: ["home:ro"] }).level, "high");
});

test("storage: carpetas de usuario son amarillo y se agrupan", () => {
	const focus = assessStorage({
		filesystems: ["xdg-download", "xdg-music:ro", "xdg-download/sub"],
	});
	assert.equal(focus.level, "caution");
	assert.equal(focus.findings[0].params?.folders, "download, music");
});

test("storage: ruido de temas y sockets no cuenta", () => {
	const focus = assessStorage({
		filesystems: [
			"xdg-config/kdeglobals:ro",
			"xdg-run/pipewire-0",
			"/run/udev:ro",
			"/run/spnav.sock:ro",
		],
	});
	assert.equal(focus.level, "safe");
});

test("storage: negaciones no conceden acceso", () => {
	assert.equal(assessStorage({ filesystems: ["!home"] }).level, "safe");
});

test("storage: medios extraíbles son amarillo", () => {
	assert.equal(
		assessStorage({ filesystems: ["/run/media", "/mnt:ro"] }).level,
		"caution",
	);
});

test("system: solo gráficos, red y audio es verde", () => {
	const focus = assessSystem({
		devices: ["dri"],
		sockets: ["wayland", "fallback-x11", "pulseaudio"],
		shared: ["network", "ipc"],
	});
	assert.equal(focus.level, "safe");
	assert.ok(focus.findings.some((f) => f.id === "systemNetwork"));
});

test("system: devices=all es amarillo", () => {
	assert.equal(assessSystem({ devices: ["dri", "all"] }).level, "caution");
});

test("system: escape del sandbox y agentes son rojo", () => {
	assert.equal(
		assessSystem({ "session-bus": { talk: ["org.freedesktop.Flatpak"] } })
			.level,
		"high",
	);
	assert.equal(assessSystem({ sockets: ["session-bus"] }).level, "high");
	assert.equal(assessSystem({ sockets: ["ssh-auth"] }).level, "high");
});

test("system: gestor de contraseñas es amarillo", () => {
	assert.equal(
		assessSystem({ "session-bus": { talk: ["org.kde.kwalletd6"] } }).level,
		"caution",
	);
});

test("social: mapea niveles OARS", () => {
	assert.equal(assessSocial(rating({ social: "none" })).level, "safe");
	assert.equal(assessSocial(rating({ social: "mild" })).level, "caution");
	assert.equal(assessSocial(rating({ social: "intense" }, 13)).level, "high");
});

test("social: la edad mínima eleva el nivel", () => {
	assert.equal(assessSocial(rating({ social: "none" }, 15)).level, "caution");
	assert.equal(assessSocial(rating({ social: "none" }, 18)).level, "high");
});

test("social: otras categorías se listan pero no cambian el color", () => {
	const focus = assessSocial(rating({ social: "none", violence: "moderate" }));
	assert.equal(focus.level, "safe");
	assert.ok(focus.findings.some((f) => f.id === "content_violence"));
});

test("social/money: sin clasificación es desconocido", () => {
	assert.equal(assessSocial(null).level, "unknown");
	assert.equal(assessMoney(undefined).level, "unknown");
	assert.equal(assessSocial(rating({ social: "unknown" })).level, "unknown");
});

test("money: mapea niveles y las donaciones no cambian el color", () => {
	assert.equal(assessMoney(rating({ money: "none" })).level, "safe");
	assert.equal(assessMoney(rating({ money: "moderate" })).level, "caution");
	assert.equal(assessMoney(rating({ money: "intense" })).level, "high");
	const donating = assessMoney(rating({ money: "none" }), true);
	assert.equal(donating.level, "safe");
	assert.equal(donating.findings[0].id, "moneyDonations");
});

test("assessAppPrivacy: hasData false cuando todo es desconocido", () => {
	const empty = assessAppPrivacy({ permissions: null, contentRating: null });
	assert.equal(empty.hasData, false);
	assert.equal(empty.foci.length, 4);
	const partial = assessAppPrivacy({
		permissions: {},
		contentRating: null,
	});
	assert.equal(partial.hasData, true);
});
