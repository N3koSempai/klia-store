import { ToggleButton, ToggleButtonGroup } from "@mui/material";

export type AppSource = "flatpak" | "deb";

interface SourceToggleProps {
	value: AppSource;
	onChange: (source: AppSource) => void;
}

const SOURCES: Array<{ value: AppSource; label: string }> = [
	{ value: "flatpak", label: "Flatpak" },
	{ value: "deb", label: "Deb" },
];

export const SourceToggle = ({ value, onChange }: SourceToggleProps) => (
	<ToggleButtonGroup
		value={value}
		exclusive
		onChange={(_event, next) => {
			if (next !== "flatpak" && next !== "deb") return;
			onChange(next);
		}}
		size="small"
		aria-label="app source"
		sx={{
			mt: 1.5,
			bgcolor: "rgba(255, 255, 255, 0.04)",
			border: "1px solid rgba(255, 255, 255, 0.12)",
			borderRadius: 2,
			p: 0.5,
		}}
	>
		{SOURCES.map((source) => (
			<ToggleButton
				key={source.value}
				value={source.value}
				sx={{
					textTransform: "none",
					fontWeight: 600,
					px: 2,
					py: 0.5,
					border: "none",
					borderRadius: 1.5,
					"&.Mui-selected": {
						bgcolor: "primary.main",
						color: "#fff",
						"&:hover": { bgcolor: "primary.main" },
					},
				}}
			>
				{source.label}
			</ToggleButton>
		))}
	</ToggleButtonGroup>
);
