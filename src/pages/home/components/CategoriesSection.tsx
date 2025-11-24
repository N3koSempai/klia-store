import {
	Box,
	Grid,
	Paper,
	Skeleton,
	Typography,
	alpha,
} from "@mui/material";
import { useTranslation } from "react-i18next";
import { v4 as uuidv4 } from "uuid";
import { useCategories } from "../../../hooks/useCategories";

interface CategoriesSectionProps {
	onCategorySelect: (categoryId: string) => void;
}

export const CategoriesSection = ({
	onCategorySelect,
}: CategoriesSectionProps) => {
	const { t } = useTranslation();
	const { data: categories, isLoading, error } = useCategories();

	return (
		<Box>
			<Typography variant="h5" sx={{ mb: 3, fontFamily: 'IBM Plex Sans', fontWeight: 600 }}>
				{t("home.categories")}
			</Typography>

			{error && (
				<Typography color="error">
					{t("home.errorLoadingCategories", { error: error.message })}
				</Typography>
			)}

			<Grid container spacing={2}>
				{isLoading
					? Array.from(new Array(10)).map((_) => (
							<Grid size={{ xs: 6, sm: 4, md: 2.4 }} key={uuidv4()}>
								<Paper
									sx={{
										p: 2,
										bgcolor: "background.paper",
										border: "1px solid rgba(255, 255, 255, 0.1)",
										borderRadius: 2,
									}}
								>
									<Skeleton variant="text" width="100%" />
								</Paper>
							</Grid>
						))
					: categories?.map((category) => (
							<Grid size={{ xs: 6, sm: 4, md: 2.4 }} key={category}>
								<Paper
									sx={{
										p: 2,
										bgcolor: "background.paper",
										border: "1px solid rgba(255, 255, 255, 0.1)",
										borderRadius: 2,
										display: "flex",
										alignItems: "center",
										gap: 2,
										cursor: "pointer",
										transition: "all 0.2s",
										position: "relative",
										overflow: "hidden",
										"&:hover": {
											borderColor: "secondary.main",
											bgcolor: alpha("#F6D32D", 0.05),
											transform: "translateX(4px)",
											boxShadow: "0 0 15px rgba(246, 211, 45, 0.1)"
										},
									}}
									onClick={() => onCategorySelect(category)}
								>
									<Typography
										variant="body2"
										sx={{
											fontWeight: 600,
											fontFamily: 'IBM Plex Sans',
											color: "text.primary"
										}}
									>
										{category}
									</Typography>
								</Paper>
							</Grid>
						))}
			</Grid>
		</Box>
	);
};
