/**
 * Client-side `{{var}}` template fill (spec 014).
 *
 * The corpus ships i18next-style interpolation templates; on this route the
 * engine resolves keys at build time WITHOUT params, and the frozen numbers
 * (step counter, waited seconds, timeout seconds) are filled in the browser
 * from presentation state. One authority for that fill — the gallery and the
 * Welcome flow hosts both use it. Unknown placeholders are left intact so a
 * missing param is visible, never silently blanked.
 */
export function fillTemplate(template: string, params?: Record<string, string | number>): string {
	if (!params) return template;
	return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name: string) =>
		name in params ? String(params[name]) : match
	);
}
