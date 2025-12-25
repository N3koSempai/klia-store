import { ArrowBack } from "@mui/icons-material";
import {
	Box,
	Card,
	CardContent,
	IconButton,
	Skeleton,
	Typography,
} from "@mui/material";
import { useTranslation } from "react-i18next";
import { v4 as uuidv4 } from "uuid";
import { CachedImage } from "../../components/CachedImage";
import type { CategoryApp } from "../../types";

interface SearchResultsProps {
	results: CategoryApp[];
	isLoading: boolean;
	onBack: () => void;
	onAppSelect: (app: CategoryApp) => void;
	query: string;
}

export const SearchResults = ({
	results,
	isLoading,
	onBack,
	onAppSelect,
	query,
}: SearchResultsProps) => {
	const { t } = useTranslation();
	const handleAppClick = (categoryApp: CategoryApp) => {
		onAppSelect(categoryApp);
	};

	return (
		<Box
			sx={{ p: 3, maxWidth: "100%", overflow: "hidden", minHeight: "100vh" }}
		>
			{/* Header with back button */}
			<Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 3 }}>
				<IconButton onClick={onBack}>
					<ArrowBack />
				</IconButton>
				<Typography variant="h4" fontWeight="bold">
					{isLoading
						? t("searchResults.searching")
						: t("searchResults.resultsFor", { query })}
				</Typography>
			</Box>

			{/* Apps grid */}
			<Box
				sx={{
					display: "grid",
					gridTemplateColumns: {
						xs: "1fr",
						sm: "repeat(2, 1fr)",
						md: "repeat(3, 1fr)",
						lg: "repeat(4, 1fr)",
					},
					gap: 2,
					width: "100%",
					boxSizing: "border-box",
				}}
			>
				{isLoading
					? Array.from(new Array(12)).map(() => (
							<Box key={uuidv4()}>
								<Card
									sx={{
										height: "100%",
										display: "flex",
										flexDirection: "column",
										boxSizing: "border-box",
									}}
								>
									{/* Skeleton for icon and name section */}
									<Box
										sx={{
											p: 2,
											display: "flex",
											gap: 2,
											minHeight: 100,
											alignItems: "center",
										}}
									>
										<Skeleton
											variant="rectangular"
											width={64}
											height={64}
											sx={{ borderRadius: 2, flexShrink: 0 }}
										/>
										<Box sx={{ flexGrow: 1, minWidth: 0 }}>
											<Skeleton variant="text" sx={{ mb: 0.5 }} />
											<Skeleton variant="text" width="50%" />
										</Box>
									</Box>
									{/* Skeleton for summary */}
									<CardContent sx={{ flexGrow: 1, pt: 1 }}>
										<Skeleton variant="text" />
										<Skeleton variant="text" width="90%" />
									</CardContent>
								</Card>
							</Box>
						))
					: results.map((app) => (
							<Box key={app.app_id} sx={{ minWidth: 0, overflow: "hidden" }}>
								<Card
									sx={{
										cursor: "pointer",
										"&:hover": { boxShadow: 6 },
										height: "100%",
										display: "flex",
										flexDirection: "column",
										transition: "box-shadow 0.3s",
										boxSizing: "border-box",
										minWidth: 0,
										overflow: "hidden",
									}}
									onClick={() => handleAppClick(app)}
								>
									{/* App icon and name section */}
									<Box
										sx={{
											p: 2,
											display: "flex",
											alignItems: "center",
											gap: 2,
											minHeight: 100,
											bgcolor: "background.paper",
										}}
									>
										{/* Icon */}
										<Box
											sx={{
												width: 64,
												height: 64,
												flexShrink: 0,
												borderRadius: 2,
												overflow: "hidden",
												bgcolor: "grey.800",
												display: "flex",
												alignItems: "center",
												justifyContent: "center",
											}}
										>
											{app.icon ? (
												<CachedImage
													appId={app.app_id}
													imageUrl={app.icon}
													alt={app.name}
													variant="rounded"
													style={{
														width: "100%",
														height: "100%",
														objectFit: "cover",
													}}
												/>
											) : (
												<Typography variant="caption" color="text.secondary">
													{t("home.noIcon")}
												</Typography>
											)}
										</Box>

										{/* Name and developer */}
										<Box sx={{ flexGrow: 1, minWidth: 0 }}>
											<Typography
												variant="body1"
												fontWeight="bold"
												noWrap
												sx={{ mb: 0.5 }}
											>
												{app.name}
											</Typography>
											<Typography
												variant="caption"
												color="text.secondary"
												noWrap
											>
												{app.developer_name}
											</Typography>
										</Box>
									</Box>

									{/* Summary section */}
									<CardContent sx={{ flexGrow: 1, pt: 1 }}>
										<Typography
											variant="body2"
											color="text.secondary"
											sx={{
												display: "-webkit-box",
												WebkitLineClamp: 2,
												WebkitBoxOrient: "vertical",
												overflow: "hidden",
												minHeight: "2.5em",
											}}
										>
											{app.summary}
										</Typography>
									</CardContent>
								</Card>
							</Box>
						))}
			</Box>

			{/* No results message */}
			{!isLoading && results.length === 0 && (
				<Box sx={{ textAlign: "center", py: 8 }}>
					<Typography variant="h6" color="text.secondary">
						{t("searchResults.noResultsFor", { query })}
					</Typography>
				</Box>
			)}
		</Box>
	);
};
