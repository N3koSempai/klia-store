import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ColorBlindMode = "none" | "deuteranopia" | "protanopia" | "tritanopia";

export interface AccessibilityPrefs {
	colorBlindMode: ColorBlindMode;
	reducedMotion: boolean;
	highContrast: boolean;
}

interface AccessibilityStore extends AccessibilityPrefs {
	setColorBlindMode: (mode: ColorBlindMode) => void;
	setReducedMotion: (value: boolean) => void;
	setHighContrast: (value: boolean) => void;
}

export const useAccessibilityStore = create<AccessibilityStore>()(
	persist(
		(set) => ({
			colorBlindMode: "none",
			reducedMotion: false,
			highContrast: false,

			setColorBlindMode: (mode) => set({ colorBlindMode: mode }),
			setReducedMotion: (value) => set({ reducedMotion: value }),
			setHighContrast: (value) => set({ highContrast: value }),
		}),
		{ name: "klia-accessibility" },
	),
);
