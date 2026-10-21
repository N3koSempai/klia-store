import { memo, useCallback } from "react";
import type { InstalledAppInfo } from "../../../store/installedAppsStore";
import { InstalledAppCard } from "./InstalledAppCard";

// Memoized wrapper for app card to prevent recreating callbacks
interface AppCardWrapperProps {
	app: InstalledAppInfo;
	hasUpdate: boolean;
	isUpdating: boolean;
	isUninstalling: boolean;
	cardHeight: number;
	onUpdate: (appId: string) => void;
	onUninstall: (appId: string) => void;
	onShowReleaseNotes: (appId: string) => void;
	onDeveloperClick?: (
		developerId: string,
		developerName: string,
		appId: string,
	) => void;
}

export const AppCardWrapper = memo(
	({
		app,
		hasUpdate,
		isUpdating,
		isUninstalling,
		cardHeight,
		onUpdate,
		onUninstall,
		onShowReleaseNotes,
		onDeveloperClick,
	}: AppCardWrapperProps) => {
		const handleUpdate = useCallback(
			() => onUpdate(app.appId),
			[onUpdate, app.appId],
		);
		const handleUninstall = useCallback(
			() => onUninstall(app.appId),
			[onUninstall, app.appId],
		);
		const handleShowReleaseNotes = useCallback(
			() => onShowReleaseNotes(app.appId),
			[onShowReleaseNotes, app.appId],
		);

		return (
			<InstalledAppCard
				app={app}
				hasUpdate={hasUpdate}
				isUpdating={isUpdating}
				isUninstalling={isUninstalling}
				cardHeight={cardHeight}
				onUpdate={handleUpdate}
				onUninstall={handleUninstall}
				onShowReleaseNotes={handleShowReleaseNotes}
				onDeveloperClick={onDeveloperClick}
			/>
		);
	},
);
