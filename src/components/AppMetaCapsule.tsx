import DownloadIcon from "@mui/icons-material/Download";
import PublicIcon from "@mui/icons-material/Public";
import VerifiedUserIcon from "@mui/icons-material/VerifiedUser";
import { Box, Tooltip } from "@mui/material";
import { openUrl } from "@tauri-apps/plugin-opener";

interface AppMetaCapsuleProps {
	isVerified: boolean;
	license: string;
	downloads: number;
}

export const AppMetaCapsule = ({
	isVerified,
	license,
	downloads,
}: AppMetaCapsuleProps) => {
	const formatDownloads = (count: number): string => {
		if (count >= 1000000) {
			return `${(count / 1000000).toFixed(1)}M`;
		}
		if (count >= 1000) {
			return `${(count / 1000).toFixed(1)}k`;
		}
		return count.toString();
	};

	// Parse license format: "LicenseRef-proprietary=https://..."
	const parseLicense = (licenseStr: string): { text: string; url?: string } => {
		const match = licenseStr.match(/LicenseRef-proprietary=(.+)/);
		if (match) {
			return { text: "Proprietary", url: match[1] };
		}
		return { text: licenseStr, url: undefined };
	};

	const licenseInfo = parseLicense(license);
	const isProprietary = license.toLowerCase().includes("proprietary");
	const licenseColor = isProprietary ? "#F6D32D" : "#C9D1D9";

	const handleLicenseClick = async () => {
		if (licenseInfo.url) {
			try {
				await openUrl(licenseInfo.url);
			} catch (error) {
				console.error("Error opening license URL:", error);
			}
		}
	};

	return (
		<Box
			sx={{
				display: "inline-flex",
				alignItems: "center",
				bgcolor: "rgba(255, 255, 255, 0.05)",
				border: "1px solid rgba(255, 255, 255, 0.1)",
				borderRadius: "6px",
				overflow: "hidden",
			}}
		>
			{/* Verified Status */}
			<Tooltip
				title={
					isVerified ? "Developer Verified by Flathub" : "Community Maintained"
				}
				arrow
			>
				<Box
					sx={{
						display: "flex",
						alignItems: "center",
						px: 1.5,
						py: 0.5,
						color: isVerified ? "#4A86CF" : "#8B949E",
					}}
				>
					{isVerified ? (
						<VerifiedUserIcon fontSize="small" />
					) : (
						<PublicIcon fontSize="small" />
					)}
				</Box>
			</Tooltip>

			{/* Divider */}
			<Box
				sx={{
					width: "1px",
					height: "24px",
					bgcolor: "rgba(255, 255, 255, 0.1)",
				}}
			/>

			{/* License */}
			<Tooltip title={licenseInfo.url || ""} arrow>
				<Box
					onClick={handleLicenseClick}
					sx={{
						display: "flex",
						alignItems: "center",
						px: 1.5,
						py: 0.5,
						fontFamily: "JetBrains Mono, monospace",
						fontSize: "0.75rem",
						color: licenseColor,
						fontWeight: 600,
						cursor: licenseInfo.url ? "pointer" : "default",
						transition: "all 0.2s",
						"&:hover": licenseInfo.url
							? {
									opacity: 0.8,
									transform: "translateY(-1px)",
								}
							: {},
					}}
				>
					{licenseInfo.text}
				</Box>
			</Tooltip>

			{/* Divider */}
			<Box
				sx={{
					width: "1px",
					height: "24px",
					bgcolor: "rgba(255, 255, 255, 0.1)",
				}}
			/>

			{/* Downloads */}
			<Box
				sx={{
					display: "flex",
					alignItems: "center",
					gap: 0.5,
					px: 1.5,
					py: 0.5,
					color: "#8B949E",
					fontSize: "0.75rem",
					fontWeight: 600,
				}}
			>
				<DownloadIcon fontSize="small" />
				<span>{formatDownloads(downloads)}</span>
			</Box>
		</Box>
	);
};
