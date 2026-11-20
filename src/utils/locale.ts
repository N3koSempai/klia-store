/**
 * Reduces a locale string to its primary language subtag, so the i18n
 * bootstrap maps every form to the same key: BCP-47 from the browser
 * ("zh-CN") and POSIX from the Rust `get_system_locale` command
 * ("zh_CN.UTF-8") both become "zh". Falls back to "en" when nothing usable
 * is left.
 */
export function primaryLanguage(locale: string): string {
	return locale.split(/[-_.]/)[0] || "en";
}
