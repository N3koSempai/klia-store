import CloseIcon from "@mui/icons-material/Close";
import SearchIcon from "@mui/icons-material/Search";
import { CircularProgress, IconButton, InputAdornment, TextField } from "@mui/material";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDebouncedCallback } from "use-debounce";
import { apiService } from "../services/api";
import type { CategoryApp } from "../types";

interface AppSearchBarProps {
	onSearch: (query: string, results: CategoryApp[]) => void;
	onLoading: (isLoading: boolean) => void;
	initialValue?: string;
}

export const AppSearchBar = ({ onSearch, onLoading, initialValue = "" }: AppSearchBarProps) => {
	const { t } = useTranslation();
	const [inputValue, setInputValue] = useState(initialValue);
	const [isSearching, setIsSearching] = useState(false);

	// Update input value when initialValue changes (e.g., navigating back)
	useEffect(() => {
		setInputValue(initialValue);
	}, [initialValue]);

	const performSearch = useDebouncedCallback(async (query: string) => {
		if (!query.trim()) {
			onLoading(false);
			onSearch("", []);
			return;
		}

		try {
			setIsSearching(true);
			onLoading(true);

			const response = await apiService.searchApps({
				query,
				hits_per_page: 21,
				page: 1,
			});

			onSearch(query, response.hits);
		} catch (error) {
			console.error("Error searching apps:", error);
			onSearch(query, []);
		} finally {
			setIsSearching(false);
			onLoading(false);
		}
	}, 500);

	const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
		const value = event.target.value;
		setInputValue(value);
		performSearch(value);
	};

	const handleClear = () => {
		setInputValue("");
		onSearch("", []);
		onLoading(false);
	};

	return (
		<TextField
			fullWidth
			value={inputValue}
			onChange={handleInputChange}
			placeholder={t("home.searchPlaceholder")}
			variant="outlined"
			sx={{
				maxWidth: 600,
				"& .MuiOutlinedInput-root": {
					backgroundColor: "background.paper",
					borderRadius: 3,
					transition: "all 0.3s",
					"& fieldset": {
						borderColor: "rgba(255, 255, 255, 0.1)",
					},
					"&:hover fieldset": {
						borderColor: "primary.main",
					},
					"&.Mui-focused fieldset": {
						borderColor: "primary.main",
						borderWidth: 2,
					},
				},
				"& .MuiInputBase-input": {
					padding: "14px 16px",
					fontSize: "1rem",
				},
			}}
			InputProps={{
				startAdornment: (
					<InputAdornment position="start">
						<SearchIcon sx={{ color: "text.secondary" }} />
					</InputAdornment>
				),
				endAdornment: (
					<InputAdornment position="end">
						{isSearching ? (
							<CircularProgress size={20} sx={{ color: "primary.main" }} />
						) : inputValue ? (
							<IconButton
								onClick={handleClear}
								sx={{
									color: "text.secondary",
									padding: "8px",
									"&:hover": {
										color: "primary.main",
									},
								}}
							>
								<CloseIcon />
							</IconButton>
						) : null}
					</InputAdornment>
				),
			}}
		/>
	);
};
