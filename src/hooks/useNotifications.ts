import { useEffect, useState } from "react";
import notificationsData from "../data/notifications.json";
import { dbCacheManager } from "../utils/dbCache";

export interface Notification {
	id: string;
	title: string;
	content: string;
	date: string;
	priority: "normal" | "high";
}

export const useNotifications = () => {
	const [notifications, setNotifications] = useState<Notification[]>([]);
	const [viewedNotifications, setViewedNotifications] = useState<string[]>([]);
	const [unreadCount, setUnreadCount] = useState(0);

	useEffect(() => {
		loadNotifications();
	}, []);

	const loadNotifications = async () => {
		try {
			// Load viewed notifications from database
			const viewed = await dbCacheManager.getViewedNotifications();
			setViewedNotifications(viewed);

			// Load notifications from JSON
			const allNotifications = notificationsData as Notification[];
			setNotifications(allNotifications);

			// Calculate unread count
			const unread = allNotifications.filter(
				(notif) => !viewed.includes(notif.id),
			).length;
			setUnreadCount(unread);
		} catch (error) {
			console.error("Error loading notifications:", error);
		}
	};

	const markAsViewed = async (notificationId: string) => {
		try {
			await dbCacheManager.markNotificationAsViewed(notificationId);
			setViewedNotifications((prev) => [...prev, notificationId]);
			setUnreadCount((prev) => Math.max(0, prev - 1));
		} catch (error) {
			console.error("Error marking notification as viewed:", error);
		}
	};

	const markAllAsViewed = async () => {
		try {
			for (const notification of notifications) {
				if (!viewedNotifications.includes(notification.id)) {
					await dbCacheManager.markNotificationAsViewed(notification.id);
				}
			}
			setViewedNotifications(notifications.map((n) => n.id));
			setUnreadCount(0);
		} catch (error) {
			console.error("Error marking all notifications as viewed:", error);
		}
	};

	const isViewed = (notificationId: string) => {
		return viewedNotifications.includes(notificationId);
	};

	return {
		notifications,
		unreadCount,
		markAsViewed,
		markAllAsViewed,
		isViewed,
	};
};
