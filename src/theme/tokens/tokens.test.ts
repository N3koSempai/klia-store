import assert from "node:assert/strict";
import { test } from "node:test";
import { contrastRatio } from "./contrast.ts";
import {
	colorBlindPalettes,
	createSemanticTokens,
	solidButtonColors,
	status,
} from "./index.ts";

const MODES = Object.keys(colorBlindPalettes) as Array<
	keyof typeof colorBlindPalettes
>;

for (const highContrast of [false, true]) {
	for (const mode of MODES) {
		const label = `${mode}${highContrast ? " + alto contraste" : ""}`;
		const tokens = createSemanticTokens({
			highContrast,
			accent: colorBlindPalettes[mode].primary,
		});
		const surfaces = [
			tokens.surface.base,
			tokens.surface.raised,
			tokens.surface.overlay,
		];

		test(`texto principal y secundario cumplen AA sobre superficies (${label})`, () => {
			for (const surface of surfaces) {
				assert.ok(contrastRatio(tokens.text.primary, surface) >= 4.5);
				assert.ok(contrastRatio(tokens.text.secondary, surface) >= 4.5);
			}
		});

		test(`texto atenuado cumple AA sobre superficies (${label})`, () => {
			for (const surface of surfaces) {
				assert.ok(contrastRatio(tokens.text.muted, surface) >= 4.5);
			}
		});

		test(`el borde de controles es distinguible (>=3:1) (${label})`, () => {
			for (const surface of surfaces) {
				assert.ok(contrastRatio(tokens.border.control, surface) >= 3);
			}
		});

		test(`botones rellenos cumplen AA texto/fondo (${label})`, () => {
			const { primary, secondary, error, info } = colorBlindPalettes[mode];
			for (const color of [
				primary,
				secondary,
				error,
				info,
				status.success,
				status.warning,
			]) {
				const { background, text } = solidButtonColors(color);
				assert.ok(
					contrastRatio(text, background) >= 4.5,
					`${color} → ${background}/${text}`,
				);
			}
		});

		test(`el acento del anillo de foco es distinguible (>=3:1) (${label})`, () => {
			for (const surface of surfaces) {
				assert.ok(contrastRatio(tokens.focusRing, surface) >= 3);
			}
		});
	}

	test(`alto contraste: texto principal AAA y bordes visibles (${highContrast})`, () => {
		if (!highContrast) return;
		const tokens = createSemanticTokens({ highContrast, accent: "#4A86CF" });
		assert.ok(contrastRatio(tokens.text.primary, tokens.surface.raised) >= 7);
		assert.ok(
			contrastRatio(tokens.border.strong, tokens.surface.raised) >= 3,
			"borde fuerte debe ser >= 3:1 (WCAG 1.4.11)",
		);
	});
}
