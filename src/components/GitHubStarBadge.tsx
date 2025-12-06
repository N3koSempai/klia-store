import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import StarBorderRoundedIcon from "@mui/icons-material/StarBorderRounded";
import StarRoundedIcon from "@mui/icons-material/StarRounded";
import { Box, type SxProps, type Theme } from "@mui/material";
import { openUrl } from "@tauri-apps/plugin-opener";
import type React from "react";

interface GitHubStarBadgeProps {
	count: number;
	url: string;
}

type TierStyle = {
	icon: React.ReactElement;
	containerSx: SxProps<Theme>;
	textSx: SxProps<Theme>;
	iconSx: SxProps<Theme>;
};

const getTierStyle = (count: number): TierStyle => {
	// Legendary (> 6k)
	if (count > 6000) {
		return {
			icon: <AutoAwesomeIcon />,
			containerSx: {
				border: "1px solid rgba(255, 215, 0, 0.5)",
				background:
					"linear-gradient(90deg, rgba(255,215,0,0.1), rgba(255,69,0,0.15))",
				animation: "pulse 2s ease-in-out infinite",
				"@keyframes pulse": {
					"0%, 100%": {
						transform: "scale(1)",
					},
					"50%": {
						transform: "scale(1.05)",
					},
				},
			},
			textSx: {
				background: "linear-gradient(135deg, #FFD700 0%, #FF4500 100%)",
				WebkitBackgroundClip: "text",
				WebkitTextFillColor: "transparent",
				backgroundClip: "text",
			},
			iconSx: {
				background: "linear-gradient(135deg, #FFD700 0%, #FF4500 100%)",
				WebkitBackgroundClip: "text",
				WebkitTextFillColor: "transparent",
				backgroundClip: "text",
			},
		};
	}

	// Epic (1k - 6k)
	if (count >= 1000) {
		return {
			icon: <StarRoundedIcon />,
			containerSx: {
				border: "1px solid #FFB11B",
				bgcolor: "rgba(255, 177, 27, 0.15)",
				boxShadow: "0 0 12px rgba(255, 177, 27, 0.4)",
			},
			textSx: {
				color: "#FFB11B",
			},
			iconSx: {
				color: "#FFB11B",
			},
		};
	}

	// Solid (100 - 1k)
	if (count >= 100) {
		return {
			icon: <StarRoundedIcon />,
			containerSx: {
				border: "1px solid rgba(246, 211, 45, 0.3)",
				bgcolor: "rgba(246, 211, 45, 0.1)",
			},
			textSx: {
				color: "#E6EDF3",
			},
			iconSx: {
				color: "#F6D32D",
			},
		};
	}

	// Indie (< 100)
	return {
		icon: <StarBorderRoundedIcon />,
		containerSx: {
			border: "1px solid rgba(255, 255, 255, 0.1)",
			bgcolor: "transparent",
		},
		textSx: {
			color: "#8B949E",
		},
		iconSx: {
			color: "#8B949E",
		},
	};
};

export const GitHubStarBadge = ({ count, url }: GitHubStarBadgeProps) => {
	const formatStars = (starCount: number): string => {
		if (starCount >= 1000) {
			return `${(starCount / 1000).toFixed(1)}k`;
		}
		return starCount.toString();
	};

	const handleClick = async () => {
		try {
			await openUrl(url);
		} catch (error) {
			console.error("Error opening repository URL:", error);
		}
	};

	const tierStyle = getTierStyle(count);

	return (
		<Box
			onClick={handleClick}
			sx={{
				display: "inline-flex",
				alignItems: "center",
				gap: 0.75,
				px: 1.5,
				py: 0.5,
				borderRadius: 1.5,
				cursor: "pointer",
				transition: "all 0.3s ease",
				fontFamily: "JetBrains Mono, monospace",
				fontWeight: 700,
				fontSize: "0.875rem",
				"&:hover": {
					transform: "translateY(-2px)",
					opacity: 0.9,
				},
				...tierStyle.containerSx,
			}}
		>
			<Box
				component="span"
				sx={{
					display: "flex",
					alignItems: "center",
					fontSize: "1rem",
					...tierStyle.iconSx,
				}}
			>
				{tierStyle.icon}
			</Box>
			<Box component="span" sx={tierStyle.textSx}>
				{formatStars(count)}
			</Box>
		</Box>
	);
};
