/**
 * Wallet icon corpus — the web port of
 * `specs/015-wallet-home-ui/contracts/icons.json` (research.md D2).
 *
 * All glyphs are lucide v1.11.0 (ISC), 24×24, currentColor. Nav outline =
 * verbatim lucide stroke defs; nav solid = fills derived from the same
 * geometry (closed subpaths filled, evenodd holes; the users back-person arcs
 * stay stroked), so selection swaps style without the tab shifting.
 */

export type IconElement =
	| { tag: 'path'; d: string }
	| { tag: 'circle'; cx: string; cy: string; r: string }
	| { tag: 'rect'; width: string; height: string; x: string; y: string; rx: string }
	| { tag: 'polyline'; points: string }
	| { tag: 'line'; x1: string; x2: string; y1: string; y2: string };

export type MixedElement = IconElement & { mode: 'fill' | 'stroke'; fillRule?: 'evenodd' };

export type IconDef =
	| { style: 'stroke'; elements: IconElement[] }
	| { style: 'fill'; paths: string[] }
	| { style: 'mixed'; elements: MixedElement[] };

export type NavIconId = 'wallet' | 'contacts' | 'explore' | 'settings';

export const NAV_ICONS: Record<NavIconId, { outline: IconDef; solid: IconDef }> = {
	wallet: {
		outline: {
			style: 'stroke',
			elements: [
				{
					tag: 'path',
					d: 'M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1'
				},
				{ tag: 'path', d: 'M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4' }
			]
		},
		solid: {
			style: 'mixed',
			elements: [
				{
					tag: 'path',
					mode: 'fill',
					d: 'M18 3a1 1 0 0 1 1 1v3h1a1 1 0 0 1 1 1v3h-4a2 2 0 0 0 0 4h4v4a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h13z'
				}
			]
		}
	},
	contacts: {
		outline: {
			style: 'stroke',
			elements: [
				{ tag: 'path', d: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2' },
				{ tag: 'path', d: 'M16 3.128a4 4 0 0 1 0 7.744' },
				{ tag: 'path', d: 'M22 21v-2a4 4 0 0 0-3-3.87' },
				{ tag: 'circle', cx: '9', cy: '7', r: '4' }
			]
		},
		solid: {
			style: 'mixed',
			elements: [
				{ tag: 'path', mode: 'fill', d: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2z' },
				{ tag: 'circle', mode: 'fill', cx: '9', cy: '7', r: '4' },
				{ tag: 'path', mode: 'stroke', d: 'M16 3.128a4 4 0 0 1 0 7.744' },
				{ tag: 'path', mode: 'stroke', d: 'M22 21v-2a4 4 0 0 0-3-3.87' }
			]
		}
	},
	explore: {
		outline: {
			style: 'stroke',
			elements: [
				{ tag: 'circle', cx: '12', cy: '12', r: '10' },
				{
					tag: 'path',
					d: 'm16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z'
				}
			]
		},
		solid: {
			style: 'mixed',
			elements: [
				{
					tag: 'path',
					mode: 'fill',
					fillRule: 'evenodd',
					d: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM16.24 7.76l-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z'
				}
			]
		}
	},
	settings: {
		outline: {
			style: 'stroke',
			elements: [
				{
					tag: 'path',
					d: 'M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915'
				},
				{ tag: 'circle', cx: '12', cy: '12', r: '3' }
			]
		},
		solid: {
			style: 'mixed',
			elements: [
				{
					tag: 'path',
					mode: 'fill',
					fillRule: 'evenodd',
					d: 'M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'
				}
			]
		}
	}
};

export type UtilityIconId =
	| 'arrow-down-left'
	| 'arrow-up-right'
	| 'scan-line'
	| 'eye'
	| 'eye-off'
	| 'search'
	| 'x'
	| 'copy'
	| 'chevron-right'
	| 'chevron-down'
	| 'link-2'
	| 'triangle-alert'
	| 'refresh-cw'
	| 'check'
	| 'inbox'
	| 'wallet'
	// spec 018 additions (specs/018-contacts-ui/contracts/icons.json)
	| 'user-round-plus'
	| 'users-round'
	| 'folder-plus'
	| 'download'
	| 'upload'
	| 'pencil'
	| 'trash-2'
	| 'ellipsis'
	| 'qr-code'
	| 'plus'
	| 'chevron-left';

export const UTILITY_ICONS: Record<UtilityIconId, IconDef> = {
	'arrow-down-left': {
		style: 'stroke',
		elements: [
			{ tag: 'path', d: 'M17 7 7 17' },
			{ tag: 'path', d: 'M17 17H7V7' }
		]
	},
	'arrow-up-right': {
		style: 'stroke',
		elements: [
			{ tag: 'path', d: 'M7 7h10v10' },
			{ tag: 'path', d: 'M7 17 17 7' }
		]
	},
	'scan-line': {
		style: 'stroke',
		elements: [
			{ tag: 'path', d: 'M3 7V5a2 2 0 0 1 2-2h2' },
			{ tag: 'path', d: 'M17 3h2a2 2 0 0 1 2 2v2' },
			{ tag: 'path', d: 'M21 17v2a2 2 0 0 1-2 2h-2' },
			{ tag: 'path', d: 'M7 21H5a2 2 0 0 1-2-2v-2' },
			{ tag: 'path', d: 'M7 12h10' }
		]
	},
	eye: {
		style: 'stroke',
		elements: [
			{
				tag: 'path',
				d: 'M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0'
			},
			{ tag: 'circle', cx: '12', cy: '12', r: '3' }
		]
	},
	'eye-off': {
		style: 'stroke',
		elements: [
			{
				tag: 'path',
				d: 'M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49'
			},
			{ tag: 'path', d: 'M14.084 14.158a3 3 0 0 1-4.242-4.242' },
			{
				tag: 'path',
				d: 'M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143'
			},
			{ tag: 'path', d: 'm2 2 20 20' }
		]
	},
	search: {
		style: 'stroke',
		elements: [
			{ tag: 'path', d: 'm21 21-4.34-4.34' },
			{ tag: 'circle', cx: '11', cy: '11', r: '8' }
		]
	},
	x: {
		style: 'stroke',
		elements: [
			{ tag: 'path', d: 'M18 6 6 18' },
			{ tag: 'path', d: 'm6 6 12 12' }
		]
	},
	copy: {
		style: 'stroke',
		elements: [
			{ tag: 'rect', width: '14', height: '14', x: '8', y: '8', rx: '2' },
			{ tag: 'path', d: 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2' }
		]
	},
	'chevron-right': { style: 'stroke', elements: [{ tag: 'path', d: 'm9 18 6-6-6-6' }] },
	'chevron-down': { style: 'stroke', elements: [{ tag: 'path', d: 'm6 9 6 6 6-6' }] },
	'link-2': {
		style: 'stroke',
		elements: [
			{ tag: 'path', d: 'M9 17H7A5 5 0 0 1 7 7h2' },
			{ tag: 'path', d: 'M15 7h2a5 5 0 1 1 0 10h-2' },
			{ tag: 'line', x1: '8', x2: '16', y1: '12', y2: '12' }
		]
	},
	'triangle-alert': {
		style: 'stroke',
		elements: [
			{
				tag: 'path',
				d: 'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3'
			},
			{ tag: 'path', d: 'M12 9v4' },
			{ tag: 'path', d: 'M12 17h.01' }
		]
	},
	'refresh-cw': {
		style: 'stroke',
		elements: [
			{ tag: 'path', d: 'M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8' },
			{ tag: 'path', d: 'M21 3v5h-5' },
			{ tag: 'path', d: 'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16' },
			{ tag: 'path', d: 'M8 16H3v5' }
		]
	},
	check: { style: 'stroke', elements: [{ tag: 'path', d: 'M20 6 9 17l-5-5' }] },
	inbox: {
		style: 'stroke',
		elements: [
			{ tag: 'polyline', points: '22 12 16 12 14 15 10 15 8 12 2 12' },
			{
				tag: 'path',
				d: 'M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z'
			}
		]
	},
	wallet: {
		style: 'stroke',
		elements: [
			{
				tag: 'path',
				d: 'M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1'
			},
			{ tag: 'path', d: 'M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4' }
		]
	},
	'user-round-plus': {
		style: 'stroke',
		elements: [
			{ tag: 'path', d: 'M2 21a8 8 0 0 1 13.292-6' },
			{ tag: 'circle', cx: '10', cy: '8', r: '5' },
			{ tag: 'path', d: 'M19 16v6' },
			{ tag: 'path', d: 'M22 19h-6' }
		]
	},
	'users-round': {
		style: 'stroke',
		elements: [
			{ tag: 'path', d: 'M18 21a8 8 0 0 0-16 0' },
			{ tag: 'circle', cx: '10', cy: '8', r: '5' },
			{ tag: 'path', d: 'M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3' }
		]
	},
	'folder-plus': {
		style: 'stroke',
		elements: [
			{ tag: 'path', d: 'M12 10v6' },
			{ tag: 'path', d: 'M9 13h6' },
			{
				tag: 'path',
				d: 'M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z'
			}
		]
	},
	download: {
		style: 'stroke',
		elements: [
			{ tag: 'path', d: 'M12 15V3' },
			{ tag: 'path', d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' },
			{ tag: 'path', d: 'm7 10 5 5 5-5' }
		]
	},
	upload: {
		style: 'stroke',
		elements: [
			{ tag: 'path', d: 'M12 3v12' },
			{ tag: 'path', d: 'm17 8-5-5-5 5' },
			{ tag: 'path', d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' }
		]
	},
	pencil: {
		style: 'stroke',
		elements: [
			{
				tag: 'path',
				d: 'M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z'
			},
			{ tag: 'path', d: 'm15 5 4 4' }
		]
	},
	'trash-2': {
		style: 'stroke',
		elements: [
			{ tag: 'path', d: 'M10 11v6' },
			{ tag: 'path', d: 'M14 11v6' },
			{ tag: 'path', d: 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6' },
			{ tag: 'path', d: 'M3 6h18' },
			{ tag: 'path', d: 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' }
		]
	},
	ellipsis: {
		style: 'stroke',
		elements: [
			{ tag: 'circle', cx: '12', cy: '12', r: '1' },
			{ tag: 'circle', cx: '19', cy: '12', r: '1' },
			{ tag: 'circle', cx: '5', cy: '12', r: '1' }
		]
	},
	'qr-code': {
		style: 'stroke',
		elements: [
			{ tag: 'rect', width: '5', height: '5', x: '3', y: '3', rx: '1' },
			{ tag: 'rect', width: '5', height: '5', x: '16', y: '3', rx: '1' },
			{ tag: 'rect', width: '5', height: '5', x: '3', y: '16', rx: '1' },
			{ tag: 'path', d: 'M21 16h-3a2 2 0 0 0-2 2v3' },
			{ tag: 'path', d: 'M21 21v.01' },
			{ tag: 'path', d: 'M12 7v3a2 2 0 0 1-2 2H7' },
			{ tag: 'path', d: 'M3 12h.01' },
			{ tag: 'path', d: 'M12 3h.01' },
			{ tag: 'path', d: 'M12 16v.01' },
			{ tag: 'path', d: 'M16 12h1' },
			{ tag: 'path', d: 'M21 12v.01' },
			{ tag: 'path', d: 'M12 21v-1' }
		]
	},
	plus: {
		style: 'stroke',
		elements: [
			{ tag: 'path', d: 'M5 12h14' },
			{ tag: 'path', d: 'M12 5v14' }
		]
	},
	'chevron-left': { style: 'stroke', elements: [{ tag: 'path', d: 'm15 18-6-6 6-6' }] }
};

export function navIcon(id: NavIconId, selected: boolean): IconDef {
	return selected ? NAV_ICONS[id].solid : NAV_ICONS[id].outline;
}
