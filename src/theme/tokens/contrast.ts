// Utilidades WCAG 2.x para validar tokens (usadas por los tests de contraste).

type RGB = [number, number, number];

export const parseColor = (value: string): { rgb: RGB; alpha: number } => {
	const hex = value.match(/^#([0-9a-f]{6})$/i);
	if (hex) {
		const n = Number.parseInt(hex[1], 16);
		return { rgb: [(n >> 16) & 255, (n >> 8) & 255, n & 255], alpha: 1 };
	}
	const rgba = value.match(
		/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/,
	);
	if (rgba) {
		return {
			rgb: [Number(rgba[1]), Number(rgba[2]), Number(rgba[3])],
			alpha: rgba[4] === undefined ? 1 : Number(rgba[4]),
		};
	}
	throw new Error(`Color no soportado: ${value}`);
};

// Compone `fg` (con alfa) sobre `bg` opaco.
export const composite = (fg: string, bg: string): RGB => {
	const f = parseColor(fg);
	const b = parseColor(bg).rgb;
	return [0, 1, 2].map((i) =>
		Math.round(f.rgb[i] * f.alpha + b[i] * (1 - f.alpha)),
	) as RGB;
};

const luminance = ([r, g, b]: RGB): number => {
	const lin = (c: number) => {
		const s = c / 255;
		return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};

export const contrastRatio = (fg: string, bg: string): number => {
	const l1 = luminance(composite(fg, bg));
	const l2 = luminance(parseColor(bg).rgb);
	const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
	return (hi + 0.05) / (lo + 0.05);
};
