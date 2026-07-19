import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useCallback, useEffect, useState } from "react";
import type {
	BackupAppRequest,
	BackupSession,
	BackupSessionSummary,
} from "../types";

interface CompressProgress {
	written: number;
	sourceSize: number;
}

interface UseBackupsReturn {
	backups: BackupSessionSummary[];
	isLoadingBackups: boolean;
	reloadBackups: (backupsPath: string) => Promise<void>;
	isCreatingBackup: boolean;
	createProgress: string[];
	compressProgress: CompressProgress | null;
	createBackup: (
		destDir: string,
		apps: BackupAppRequest[],
	) => Promise<BackupSession | null>;
	clearCreateBackup: () => void;
	restoringArchivePath: string | null;
	isRestoringBackup: boolean;
	restoreProgress: string[];
	restoreBackup: (archivePath: string, appIds?: string[]) => Promise<boolean>;
	clearRestoreBackup: () => void;
	deleteBackup: (archivePath: string) => Promise<boolean>;
}

export function useBackups(): UseBackupsReturn {
	const [backups, setBackups] = useState<BackupSessionSummary[]>([]);
	const [isLoadingBackups, setIsLoadingBackups] = useState(false);

	const [isCreatingBackup, setIsCreatingBackup] = useState(false);
	const [createProgress, setCreateProgress] = useState<string[]>([]);
	const [compressProgress, setCompressProgress] =
		useState<CompressProgress | null>(null);

	const [restoringArchivePath, setRestoringArchivePath] = useState<
		string | null
	>(null);
	const [isRestoringBackup, setIsRestoringBackup] = useState(false);
	const [restoreProgress, setRestoreProgress] = useState<string[]>([]);

	useEffect(() => {
		let unlisten: UnlistenFn | undefined;
		listen<string>("backup-progress", (event) => {
			if (isCreatingBackup) {
				setCreateProgress((prev) => [...prev, event.payload]);
			}
			if (isRestoringBackup) {
				setRestoreProgress((prev) => [...prev, event.payload]);
			}
		}).then((fn) => {
			unlisten = fn;
		});
		return () => {
			unlisten?.();
		};
	}, [isCreatingBackup, isRestoringBackup]);

	// Emitted periodically by the backend while it compresses the session
	// archive, since a large backup (app + data + runtime) can take a while
	// and would otherwise show no feedback during that step.
	useEffect(() => {
		let unlisten: UnlistenFn | undefined;
		listen<CompressProgress>("backup-compress-progress", (event) => {
			if (isCreatingBackup) {
				setCompressProgress(event.payload);
			}
		}).then((fn) => {
			unlisten = fn;
		});
		return () => {
			unlisten?.();
		};
	}, [isCreatingBackup]);

	const reloadBackups = useCallback(async (backupsPath: string) => {
		setIsLoadingBackups(true);
		try {
			const result = await invoke<BackupSessionSummary[]>("list_backups", {
				backupsPath,
			});
			setBackups(result);
		} catch (error) {
			console.error("Error loading backups:", error);
		} finally {
			setIsLoadingBackups(false);
		}
	}, []);

	const createBackup = useCallback(
		async (destDir: string, apps: BackupAppRequest[]) => {
			setIsCreatingBackup(true);
			setCreateProgress([]);
			setCompressProgress(null);
			try {
				const session = await invoke<BackupSession>("create_backup", {
					destDir,
					apps,
				});
				return session;
			} catch (error) {
				setCreateProgress((prev) => [...prev, `✗ Error: ${error}`]);
				return null;
			} finally {
				setIsCreatingBackup(false);
			}
		},
		[],
	);

	const clearCreateBackup = useCallback(() => {
		setCreateProgress([]);
		setCompressProgress(null);
	}, []);

	const restoreBackup = useCallback(
		async (archivePath: string, appIds?: string[]) => {
			setRestoringArchivePath(archivePath);
			setIsRestoringBackup(true);
			setRestoreProgress([]);
			try {
				await invoke("restore_backup", { archivePath, appIds });
				return true;
			} catch (error) {
				setRestoreProgress((prev) => [...prev, `✗ Error: ${error}`]);
				return false;
			} finally {
				setIsRestoringBackup(false);
			}
		},
		[],
	);

	const clearRestoreBackup = useCallback(() => {
		setRestoringArchivePath(null);
		setRestoreProgress([]);
	}, []);

	const deleteBackup = useCallback(async (archivePath: string) => {
		try {
			await invoke("delete_backup", { archivePath });
			setBackups((prev) => prev.filter((b) => b.archive_path !== archivePath));
			return true;
		} catch (error) {
			console.error("Error deleting backup:", error);
			return false;
		}
	}, []);

	return {
		backups,
		isLoadingBackups,
		reloadBackups,
		isCreatingBackup,
		createProgress,
		compressProgress,
		createBackup,
		clearCreateBackup,
		restoringArchivePath,
		isRestoringBackup,
		restoreProgress,
		restoreBackup,
		clearRestoreBackup,
		deleteBackup,
	};
}
