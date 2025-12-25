import DoneAllIcon from "@mui/icons-material/DoneAll";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import NotificationsIcon from "@mui/icons-material/Notifications";
import {
	Badge,
	Box,
	Collapse,
	Divider,
	IconButton,
	List,
	ListItem,
	ListItemButton,
	Paper,
	Popover,
	Typography,
} from "@mui/material";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Notification } from "../hooks/useNotifications";

interface NotificationMenuProps {
	notifications: Notification[];
	unreadCount: number;
	isViewed: (id: string) => boolean;
	onMarkAsViewed: (id: string) => void;
	onMarkAllAsViewed: () => void;
}

export const NotificationMenu = ({
	notifications,
	unreadCount,
	isViewed,
	onMarkAsViewed,
	onMarkAllAsViewed,
}: NotificationMenuProps) => {
	const { t } = useTranslation();
	const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);
	const [expandedNotification, setExpandedNotification] = useState<
		string | null
	>(null);

	const open = Boolean(anchorEl);

	const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
		setAnchorEl(event.currentTarget);
	};

	const handleClose = () => {
		setAnchorEl(null);
		setExpandedNotification(null);
	};

	const handleNotificationClick = (notificationId: string) => {
		// Mark as viewed when clicked
		if (!isViewed(notificationId)) {
			onMarkAsViewed(notificationId);
		}

		// Toggle expansion if multiple notifications
		if (notifications.length > 1) {
			setExpandedNotification((prev) =>
				prev === notificationId ? null : notificationId,
			);
		}
	};

	const handleLinkClick = async (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		const target = e.target as HTMLAnchorElement;
		const href = target.getAttribute("href");
		if (href) {
			try {
				await openUrl(href);
			} catch (error) {
				console.error("Error opening link:", error);
			}
		}
	};

	const renderContent = (content: string) => {
		// Return JSX with proper link handling
		return (
			<Typography
				variant="body2"
				dangerouslySetInnerHTML={{ __html: content }}
				onClick={(e) => {
					const target = e.target as HTMLElement;
					if (target.tagName === "A") {
						handleLinkClick(e);
					}
				}}
				sx={{
					color: "text.secondary",
					lineHeight: 1.6,
					"& a": {
						color: "primary.main",
						textDecoration: "none",
						cursor: "pointer",
						"&:hover": {
							textDecoration: "underline",
						},
					},
				}}
			/>
		);
	};

	return (
		<>
			<IconButton onClick={handleClick} sx={{ color: "text.secondary" }}>
				<Badge badgeContent={unreadCount} color="error">
					<NotificationsIcon />
				</Badge>
			</IconButton>

			<Popover
				open={open}
				anchorEl={anchorEl}
				onClose={handleClose}
				anchorOrigin={{
					vertical: "bottom",
					horizontal: "right",
				}}
				transformOrigin={{
					vertical: "top",
					horizontal: "right",
				}}
			>
				<Paper
					sx={{
						width: 400,
						maxHeight: 500,
						overflow: "auto",
						bgcolor: "background.paper",
					}}
				>
					<Box
						sx={{
							p: 2,
							display: "flex",
							justifyContent: "space-between",
							alignItems: "center",
							borderBottom: "1px solid rgba(255,255,255,0.1)",
						}}
					>
						<Typography variant="h6" fontWeight="bold">
							{t("notifications.title")}
						</Typography>
						{unreadCount > 0 && (
							<IconButton
								size="small"
								onClick={onMarkAllAsViewed}
								sx={{ color: "primary.main" }}
							>
								<DoneAllIcon fontSize="small" />
							</IconButton>
						)}
					</Box>

					{notifications.length === 0 ? (
						<Box sx={{ p: 4, textAlign: "center" }}>
							<Typography variant="body2" color="text.secondary">
								{t("notifications.noNotifications")}
							</Typography>
						</Box>
					) : (
						<List sx={{ p: 0 }}>
							{notifications.map((notification, index) => (
								<Box key={notification.id}>
									<ListItem
										disablePadding
										sx={{
											bgcolor: isViewed(notification.id)
												? "transparent"
												: "rgba(74, 134, 207, 0.05)",
										}}
									>
										<ListItemButton
											onClick={() => handleNotificationClick(notification.id)}
											sx={{ py: 2 }}
										>
											<Box sx={{ width: "100%" }}>
												<Box
													sx={{
														display: "flex",
														justifyContent: "space-between",
														alignItems: "center",
														mb: notifications.length > 1 ? 1 : 0.5,
													}}
												>
													<Typography
														variant="subtitle2"
														fontWeight="bold"
														sx={{ color: "text.primary" }}
													>
														{notification.title}
													</Typography>
													{notifications.length > 1 &&
														(expandedNotification === notification.id ? (
															<ExpandLessIcon
																sx={{ color: "text.secondary" }}
															/>
														) : (
															<ExpandMoreIcon
																sx={{ color: "text.secondary" }}
															/>
														))}
												</Box>

												<Typography
													variant="caption"
													sx={{
														color: "text.secondary",
														display: "block",
														mb: 1,
													}}
												>
													{new Date(notification.date).toLocaleDateString()}
												</Typography>

												{/* Show full content if single notification or expanded */}
												{notifications.length === 1 ? (
													renderContent(notification.content)
												) : (
													<Collapse
														in={expandedNotification === notification.id}
														timeout="auto"
													>
														{renderContent(notification.content)}
													</Collapse>
												)}
											</Box>
										</ListItemButton>
									</ListItem>
									{index < notifications.length - 1 && <Divider />}
								</Box>
							))}
						</List>
					)}
				</Paper>
			</Popover>
		</>
	);
};
