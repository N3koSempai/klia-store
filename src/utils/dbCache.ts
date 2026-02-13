import { invoke } from "@tauri-apps/api/core";
import Database from "@tauri-apps/plugin-sql";
import type { AppOfTheDayWithDetails, AppOfTheWeekWithDetails } from "../types";

export class DBCacheManager {
	private static instance: DBCacheManager;
	private db: Database | null = null;

	private constructor() {}

	static getInstance(): DBCacheManager {
		if (!DBCacheManager.instance) {
			DBCacheManager.instance = new DBCacheManager();
		}
		return DBCacheManager.instance;
	}

	async initialize(): Promise<void> {
		if (this.db) return;

		try {
			const dbPath = await invoke<string>("get_app_data_path", {
				subpath: "kliastore.db",
			});
			this.db = await Database.load(`sqlite:${dbPath}`);

			// Ensure all required tables exist
			await this.ensureTables();
		} catch (error) {
			console.error("Error initializing database:", error);
			throw error;
		}
	}

	private async ensureTables(): Promise<void> {
		if (!this.db) return;

		try {
			// Create cache_metadata table if not exists
			await this.db.execute(`
				CREATE TABLE IF NOT EXISTS cache_metadata (
					section_name TEXT PRIMARY KEY,
					last_update_date TEXT NOT NULL,
					updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
				)
			`);

			// Create destacados table if not exists
			await this.db.execute(`
				CREATE TABLE IF NOT EXISTS destacados (
					app_id TEXT PRIMARY KEY,
					name TEXT,
					icon TEXT,
					data TEXT NOT NULL,
					cached_at DATETIME DEFAULT CURRENT_TIMESTAMP
				)
			`);

			// Create apps_of_the_week table if not exists
			await this.db.execute(`
				CREATE TABLE IF NOT EXISTS apps_of_the_week (
					app_id TEXT PRIMARY KEY,
					position INTEGER,
					name TEXT,
					icon TEXT,
					data TEXT NOT NULL,
					cached_at DATETIME DEFAULT CURRENT_TIMESTAMP
				)
			`);

			// Create categories table if not exists
			await this.db.execute(`
				CREATE TABLE IF NOT EXISTS categories (
					category_name TEXT PRIMARY KEY,
					cached_at DATETIME DEFAULT CURRENT_TIMESTAMP
				)
			`);

			// Create viewed_notifications table if not exists
			await this.db.execute(`
				CREATE TABLE IF NOT EXISTS viewed_notifications (
					notification_id TEXT PRIMARY KEY,
					viewed_at DATETIME DEFAULT CURRENT_TIMESTAMP
				)
			`);

			// Create app_permissions table if not exists
			await this.db.execute(`
				CREATE TABLE IF NOT EXISTS app_permissions (
					app_id TEXT NOT NULL,
					version TEXT NOT NULL,
					permissions TEXT NOT NULL,
					outdated INTEGER DEFAULT 0,
					cached_at DATETIME DEFAULT CURRENT_TIMESTAMP,
					PRIMARY KEY (app_id, version)
				)
			`);

			// Migration: Add outdated column if it doesn't exist (for existing databases)
			try {
				await this.db.execute(`
					ALTER TABLE app_permissions ADD COLUMN outdated INTEGER DEFAULT 0
				`);
				console.log("Added outdated column to app_permissions table");
			} catch (error) {
				// Column already exists, ignore error
			}

			console.log("All cache tables verified/created");
		} catch (error) {
			console.error("Error ensuring tables exist:", error);
			// Don't throw - let the app continue and handle errors per operation
		}
	}

	private getCurrentDate(): string {
		const now = new Date();
		return now.toISOString().split("T")[0]; // YYYY-MM-DD
	}

	private getDateDaysAgo(daysAgo: number): string {
		const date = new Date();
		date.setDate(date.getDate() - daysAgo);
		return date.toISOString().split("T")[0]; // YYYY-MM-DD
	}

	async shouldUpdateSection(
		sectionName: string,
		maxDaysOld = 0,
	): Promise<boolean> {
		await this.initialize();
		if (!this.db) throw new Error("Database not initialized");

		const currentDate = this.getCurrentDate();

		const result = await this.db.select<Array<{ last_update_date: string }>>(
			"SELECT last_update_date FROM cache_metadata WHERE section_name = $1",
			[sectionName],
		);

		if (result.length === 0) {
			return true; // No cache exists, needs update
		}

		// If maxDaysOld is 0, compare with current date (daily behavior)
		if (maxDaysOld === 0) {
			return result[0].last_update_date !== currentDate;
		}

		// If maxDaysOld > 0, check if last update is older than maxDaysOld days
		const oldestAllowedDate = this.getDateDaysAgo(maxDaysOld);
		return result[0].last_update_date < oldestAllowedDate;
	}

	async updateSectionDate(sectionName: string): Promise<void> {
		await this.initialize();
		if (!this.db) throw new Error("Database not initialized");

		const currentDate = this.getCurrentDate();

		await this.db.execute(
			`INSERT OR REPLACE INTO cache_metadata (section_name, last_update_date, updated_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)`,
			[sectionName, currentDate],
		);
	}

	// App of the Day
	async getCachedAppOfTheDay(): Promise<AppOfTheDayWithDetails | null> {
		await this.initialize();
		if (!this.db) throw new Error("Database not initialized");

		try {
			const result = await this.db.select<
				Array<{
					app_id: string;
					name: string | null;
					icon: string | null;
					data: string;
				}>
			>("SELECT app_id, name, icon, data FROM destacados LIMIT 1");

			if (result.length === 0) return null;

			const row = result[0];
			const parsedData = JSON.parse(row.data);

			return {
				app_id: row.app_id,
				name: row.name || undefined,
				icon: row.icon || undefined,
				day: parsedData.day,
				appStream: parsedData.appStream,
				categoryApp: parsedData.categoryApp,
			};
		} catch (error) {
			console.error("Error reading app of the day cache:", error);
			// Return null if table doesn't exist or query fails
			return null;
		}
	}

	async cacheAppOfTheDay(app: AppOfTheDayWithDetails): Promise<void> {
		await this.initialize();
		if (!this.db) throw new Error("Database not initialized");

		// Limpiar tabla primero (solo debe haber 1 app destacada)
		await this.db.execute("DELETE FROM destacados");

		const dataStr = JSON.stringify({
			day: app.day,
			appStream: app.appStream,
			categoryApp: app.categoryApp,
		});

		await this.db.execute(
			`INSERT INTO destacados (app_id, name, icon, data)
       VALUES ($1, $2, $3, $4)`,
			[app.app_id, app.name || null, app.icon || null, dataStr],
		);

		await this.updateSectionDate("appOfTheDay");
	}

	// Apps of the Week
	async getCachedAppsOfTheWeek(): Promise<AppOfTheWeekWithDetails[]> {
		await this.initialize();
		if (!this.db) throw new Error("Database not initialized");

		try {
			const result = await this.db.select<
				Array<{
					app_id: string;
					position: number;
					name: string | null;
					icon: string | null;
					data: string;
				}>
			>(
				"SELECT app_id, position, name, icon, data FROM apps_of_the_week ORDER BY position",
			);

			return result.map((row) => {
				const parsedData = JSON.parse(row.data);
				return {
					app_id: row.app_id,
					position: row.position,
					isFullscreen: parsedData.isFullscreen,
					name: row.name || undefined,
					icon: row.icon || undefined,
					summary: parsedData.summary,
					appStream: parsedData.appStream,
					categoryApp: parsedData.categoryApp,
				};
			});
		} catch (error) {
			console.error("Error reading apps of the week cache:", error);
			// Return empty array if table doesn't exist or query fails
			return [];
		}
	}

	async cacheAppsOfTheWeek(apps: AppOfTheWeekWithDetails[]): Promise<void> {
		await this.initialize();
		if (!this.db) throw new Error("Database not initialized");

		// Limpiar tabla primero
		await this.db.execute("DELETE FROM apps_of_the_week");

		for (const app of apps) {
			const dataStr = JSON.stringify({
				isFullscreen: app.isFullscreen,
				summary: app.summary,
				appStream: app.appStream,
				categoryApp: app.categoryApp,
			});

			await this.db.execute(
				`INSERT INTO apps_of_the_week (app_id, position, name, icon, data)
         VALUES ($1, $2, $3, $4, $5)`,
				[app.app_id, app.position, app.name || null, app.icon || null, dataStr],
			);
		}

		await this.updateSectionDate("appsOfTheWeek");
	}

	// Categories (weekly cache)
	async getCachedCategories(): Promise<string[]> {
		await this.initialize();
		if (!this.db) throw new Error("Database not initialized");

		try {
			const result = await this.db.select<
				Array<{
					category_name: string;
				}>
			>("SELECT category_name FROM categories ORDER BY category_name");

			return result.map((row) => row.category_name);
		} catch (error) {
			console.error("Error reading categories cache:", error);
			// Return empty array if table doesn't exist or query fails
			return [];
		}
	}

	async cacheCategories(categories: string[]): Promise<void> {
		await this.initialize();
		if (!this.db) throw new Error("Database not initialized");

		// Clear table first
		await this.db.execute("DELETE FROM categories");

		for (const category of categories) {
			await this.db.execute(
				"INSERT INTO categories (category_name) VALUES ($1)",
				[category],
			);
		}

		await this.updateSectionDate("categories");
	}

	// Notifications
	async getViewedNotifications(): Promise<string[]> {
		await this.initialize();
		if (!this.db) throw new Error("Database not initialized");

		try {
			const result = await this.db.select<
				Array<{
					notification_id: string;
				}>
			>("SELECT notification_id FROM viewed_notifications");

			return result.map((row) => row.notification_id);
		} catch (error) {
			console.error("Error reading viewed notifications:", error);
			return [];
		}
	}

	async markNotificationAsViewed(notificationId: string): Promise<void> {
		await this.initialize();
		if (!this.db) throw new Error("Database not initialized");

		try {
			await this.db.execute(
				"INSERT OR IGNORE INTO viewed_notifications (notification_id) VALUES ($1)",
				[notificationId],
			);
		} catch (error) {
			console.error("Error marking notification as viewed:", error);
		}
	}

	// App Permissions
	async getCachedPermissions(
		appId: string,
		version: string,
	): Promise<string[] | null> {
		await this.initialize();
		if (!this.db) throw new Error("Database not initialized");

		try {
			const result = await this.db.select<
				Array<{
					permissions: string;
					outdated: number;
				}>
			>(
				"SELECT permissions, outdated FROM app_permissions WHERE app_id = $1 AND version = $2",
				[appId, version],
			);

			if (result.length === 0) return null;

			// If marked as outdated, return null to force refresh
			if (result[0].outdated === 1) return null;

			return JSON.parse(result[0].permissions);
		} catch (error) {
			console.error("Error reading cached permissions:", error);
			return null;
		}
	}

	async cachePermissions(
		appId: string,
		version: string,
		permissions: string[],
	): Promise<void> {
		await this.initialize();
		if (!this.db) throw new Error("Database not initialized");

		try {
			const permissionsStr = JSON.stringify(permissions);
			await this.db.execute(
				`INSERT OR REPLACE INTO app_permissions (app_id, version, permissions, outdated, cached_at)
         VALUES ($1, $2, $3, 0, CURRENT_TIMESTAMP)`,
				[appId, version, permissionsStr],
			);
		} catch (error) {
			console.error("Error caching permissions:", error);
		}
	}

	async getCachedPermissionsBatch(
		apps: Array<{ appId: string; version: string }>,
	): Promise<Record<string, string[]>> {
		await this.initialize();
		if (!this.db) throw new Error("Database not initialized");

		const result: Record<string, string[]> = {};

		try {
			for (const app of apps) {
				const permissions = await this.getCachedPermissions(
					app.appId,
					app.version,
				);
				if (permissions) {
					result[app.appId] = permissions;
				}
			}
		} catch (error) {
			console.error("Error reading cached permissions batch:", error);
		}

		return result;
	}

	async cachePermissionsBatch(
		permissionsMap: Record<string, { version: string; permissions: string[] }>,
	): Promise<void> {
		await this.initialize();
		if (!this.db) throw new Error("Database not initialized");

		try {
			const entries = Object.entries(permissionsMap);
			if (entries.length === 0) return;

			// Use explicit transaction for batch inserts (10-100x faster)
			await this.db.execute("BEGIN TRANSACTION");

			try {
				for (const [appId, data] of entries) {
					const permissionsStr = JSON.stringify(data.permissions);
					await this.db.execute(
						`INSERT OR REPLACE INTO app_permissions (app_id, version, permissions, outdated, cached_at)
             VALUES (?, ?, ?, 0, CURRENT_TIMESTAMP)`,
						[appId, data.version, permissionsStr],
					);
				}

				await this.db.execute("COMMIT");
			} catch (error) {
				await this.db.execute("ROLLBACK");
				throw error;
			}
		} catch (error) {
			console.error("Error caching permissions batch:", error);
		}
	}

	// Mark permissions as outdated for a specific app (all versions)
	async markPermissionsAsOutdated(appId: string): Promise<void> {
		await this.initialize();
		if (!this.db) throw new Error("Database not initialized");

		try {
			await this.db.execute(
				"UPDATE app_permissions SET outdated = 1 WHERE app_id = $1",
				[appId],
			);
		} catch (error) {
			console.error("Error marking permissions as outdated:", error);
		}
	}

	// Mark permissions as outdated for multiple apps
	async markPermissionsAsOutdatedBatch(appIds: string[]): Promise<void> {
		await this.initialize();
		if (!this.db) throw new Error("Database not initialized");

		try {
			for (const appId of appIds) {
				await this.markPermissionsAsOutdated(appId);
			}
		} catch (error) {
			console.error("Error marking permissions as outdated batch:", error);
		}
	}

	// Clean old cached versions for a specific app (keep only the current version)
	async cleanOldPermissions(appId: string, currentVersion: string): Promise<void> {
		await this.initialize();
		if (!this.db) throw new Error("Database not initialized");

		try {
			// Delete all versions except the current one
			await this.db.execute(
				"DELETE FROM app_permissions WHERE app_id = $1 AND version != $2",
				[appId, currentVersion],
			);
		} catch (error) {
			console.error("Error cleaning old permissions:", error);
		}
	}

	// Clean old cached versions for all apps based on currently installed versions
	async cleanOldPermissionsBatch(
		currentApps: Array<{ appId: string; version: string }>,
	): Promise<void> {
		await this.initialize();
		if (!this.db) throw new Error("Database not initialized");

		try {
			if (currentApps.length === 0) return;

			// Build a more efficient query to delete in one statement
			// Keep only entries that match (app_id, version) pairs in currentApps
			const placeholders = currentApps
				.map(() => "(?, ?)")
				.join(", ");

			const values = currentApps.flatMap((app) => [app.appId, app.version]);

			// Delete all entries that are NOT in the current apps list
			await this.db.execute(
				`DELETE FROM app_permissions
         WHERE (app_id, version) NOT IN (VALUES ${placeholders})`,
				values,
			);
		} catch (error) {
			console.error("Error cleaning old permissions batch:", error);
		}
	}
}

export const dbCacheManager = DBCacheManager.getInstance();
