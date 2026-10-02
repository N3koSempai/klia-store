import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { Box, Skeleton, Typography } from "@mui/material";
import { memo, useEffect, useState } from "react";

// In-memory caches so a card scrolling out and back never re-invokes the
// backend. Keyed by package name (one icon per package).
const iconUrlCache = new Map<string, string>();
const iconFailCache = new Set<string>();

// Undo the double-encoding some asset URLs come back with (same workaround the
// flatpak image cache applies), so the file loads instead of 404-ing.
function normalizeAssetUrl(url: string): string {
	if (!url.includes("%2F")) return url;
	const parsed = new URL(url);
	return `${parsed.protocol}//${parsed.host}${decodeURIComponent(parsed.pathname)}`;
}

interface DebAppIconProps {
	appId: string;
	// Absolute path on the host, resolved by the backend listing. Absent when
	// no icon could be resolved, in which case the letter placeholder shows.
	iconPath?: string | null;
	name: string;
}

const DebAppIconComponent = ({ appId, iconPath, name }: DebAppIconProps) => {
	const [src, setSrc] = useState<string | null>(
		() => iconUrlCache.get(appId) ?? null,
	);
	const [failed, setFailed] = useState(
		() => iconFailCache.has(appId) || !iconPath,
	);
	const [loading, setLoading] = useState(
		() => Boolean(iconPath) && !iconUrlCache.has(appId),
	);

	useEffect(() => {
		if (!iconPath) {
			setFailed(true);
			setLoading(false);
			return;
		}

		const cached = iconUrlCache.get(appId);
		if (cached) {
			setSrc(cached);
			setFailed(false);
			setLoading(false);
			return;
		}

		let mounted = true;
		setLoading(true);
		invoke<string>("cache_deb_icon", { appId, iconPath })
			.then((path) => {
				const url = normalizeAssetUrl(convertFileSrc(path));
				iconUrlCache.set(appId, url);
				if (mounted) {
					setSrc(url);
					setFailed(false);
					setLoading(false);
				}
			})
			.catch((error) => {
				console.error(`[DebAppIcon] Failed to load icon for ${appId}:`, error);
				iconFailCache.add(appId);
				if (mounted) {
					setFailed(true);
					setLoading(false);
				}
			});

		return () => {
			mounted = false;
		};
	}, [appId, iconPath]);

	if (!failed && src) {
		return (
			<img
				src={src}
				alt={name}
				onError={() => {
					iconFailCache.add(appId);
					setFailed(true);
				}}
				style={{ width: "100%", height: "100%", objectFit: "contain" }}
			/>
		);
	}

	// Keep the skeleton while the icon is being copied off the host, so we don't
	// flash the letter placeholder for apps that do have an icon.
	if (loading && !failed) {
		return (
			<Skeleton
				variant="rounded"
				sx={{ width: "100%", height: "100%" }}
				animation="wave"
			/>
		);
	}

	return (
		<Box
			sx={{
				width: "100%",
				height: "100%",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				bgcolor: "rgba(255, 255, 255, 0.06)",
				border: "1px solid rgba(255, 255, 255, 0.12)",
				color: "text.secondary",
			}}
		>
			<Typography sx={{ fontSize: "1.75rem", fontWeight: 700 }}>
				{name.charAt(0).toUpperCase()}
			</Typography>
		</Box>
	);
};

export const DebAppIcon = memo(DebAppIconComponent);
