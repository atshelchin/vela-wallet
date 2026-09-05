/**
 * 保存图片 — the receive share card as a PNG (spec 028 Phase 9, T488).
 *
 * R4 (`ShareCard.svelte`) is the DRAWN card: a Svelte component in the page's
 * fonts and tokens. A saved image cannot be that component — it has to be
 * pixels, and pixels come from a document of their own. So the card is
 * composed a second time here as an SVG string: the same geometry (480×700,
 * the 344 code card, the identicon in the centre, the address in two mono
 * lines, the network note, the wordmark), the same colours read from the
 * live token layer, and the app's own faces embedded so the picture matches
 * the screen — then drawn to a canvas at 2× and handed over as a file.
 *
 * Three things ride together on purpose (`liveShareCard`): the address in
 * readable text so a person can check it without a scanner, the code so a
 * camera can, and the account's identicon in the middle — DERIVED from the
 * address, so a card someone doctored to swap the address carries artwork
 * that no longer matches it.
 *
 * Audit-whitelisted (tokens.test.ts): `@font-face` needs `font-family:`, and
 * the card is a render product, not product UI — its colours are still read
 * from the tokens at save time, never spelled here.
 */
import jakartaBold from '@fontsource/plus-jakarta-sans/files/plus-jakarta-sans-latin-700-normal.woff2?url';
import plexMono from '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2?url';
import { BRAND_MARK } from '$lib/ui/brand-mark';
import { saveBlob } from '$lib/services/file-io';
import type { ShareCardModel } from './model';

/** The drawn card's geometry (`--layout-shareCardW/H`, `--size-qrCard`). */
const CARD_W = 480;
const CARD_H = 700;
const PAD = 20;
const QR_CARD = 344;
const QR_PAD = 20;
const IDENTICON = 40;
const MARK = 26;
const BRAND = 56;
/** Rasterised at 2× so the code stays crisp on a phone screen. */
const SCALE = 2;

/** The colours the drawn card uses, as the live token layer resolves them. */
interface Palette {
	accent: string;
	onAccent: string;
	ink: string;
	border: string;
	mark: string;
}

function readPalette(): Palette {
	const style = getComputedStyle(document.documentElement);
	const read = (name: string) => style.getPropertyValue(name).trim();
	return {
		accent: read('--color-accent-base'),
		onAccent: read('--color-onAccent'),
		ink: read('--color-fixed-shadowInk'),
		border: read('--color-border-base'),
		mark: read('--color-fg-muted')
	};
}

function escape(text: string): string {
	return text
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}

/** A nested `<svg>` placed at x/y with a size, from a root `<svg …>` string. */
function place(svg: string, x: number, y: number, size: number): string {
	if (!svg.startsWith('<svg')) return '';
	return svg.replace(/^<svg\b/, `<svg x="${x}" y="${y}" width="${size}" height="${size}"`);
}

async function fontFace(family: string, url: string, weight: number): Promise<string> {
	try {
		const res = await fetch(url);
		if (!res.ok) return '';
		const bytes = new Uint8Array(await res.arrayBuffer());
		let binary = '';
		for (let i = 0; i < bytes.length; i += 0x8000) {
			binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
		}
		return `@font-face{font-family:'${family}';font-weight:${weight};src:url(data:font/woff2;base64,${btoa(binary)}) format('woff2');}`;
	} catch {
		// No face: the system's sans and mono stand in. The card is still the card.
		return '';
	}
}

/**
 * The card as an SVG document. Pure apart from the palette read, so a test
 * can assert what it says and decode the code it carries.
 */
export function composeShareSvg(model: ShareCardModel, palette: Palette, fonts = ''): string {
	const sans = "'Plus Jakarta Sans', 'Noto Sans SC', system-ui, sans-serif";
	const mono = "'IBM Plex Mono', ui-monospace, monospace";
	const sheetX = PAD;
	const sheetW = CARD_W - PAD * 2;
	const headlineY = PAD + 12 + 26;
	const sheetY = headlineY + 20 + 8;
	const qrX = (CARD_W - QR_CARD) / 2;
	const qrY = sheetY + QR_PAD;
	const codeSize = QR_CARD - QR_PAD * 2;
	const modules = model.code?.modules ?? 0;
	const code =
		model.code === undefined
			? ''
			: `<svg x="${qrX + QR_PAD}" y="${qrY + QR_PAD}" width="${codeSize}" height="${codeSize}" viewBox="0 0 ${modules} ${modules}" shape-rendering="crispEdges"><path d="${model.code.path}" fill="${palette.ink}"/></svg>`;
	const centreX = qrX + QR_CARD / 2;
	const centreY = qrY + QR_CARD / 2;
	const identicon = place(
		model.identiconSvg,
		centreX - IDENTICON / 2,
		centreY - IDENTICON / 2,
		IDENTICON
	);
	const nameY = qrY + QR_CARD + 8 + 8 + 15;
	const line1Y = nameY + 8 + 11 + 4;
	const line2Y = line1Y + 15;
	const noteY = line2Y + 8 + 4;
	const noteH = MARK + 8;
	const noteText = escape(model.networkNote);
	// The pill hugs its text: a mark, a gap, the note, in the drawn 11px face.
	const noteTextW = Math.max(40, Math.ceil(noteText.length * 6.2));
	const noteW = 4 + MARK + 6 + noteTextW + 12;
	const noteX = CARD_W / 2 - noteW / 2;
	const sheetBottom = noteY + noteH + QR_PAD;
	const brandY = CARD_H - PAD - 16 - BRAND;
	const brandMark = BRAND_MARK.paths
		.map((path) => `<path d="${path.d}" fill="${path.fill}"/>`)
		.join('');
	const wordmark = escape(model.wordmark);
	const wordmarkW = Math.ceil(wordmark.length * 14);
	const brandX = CARD_W / 2 - (BRAND + 12 + wordmarkW) / 2;
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">
<style>${fonts}</style>
<rect width="${CARD_W}" height="${CARD_H}" fill="${palette.accent}"/>
<text x="${CARD_W / 2}" y="${headlineY}" text-anchor="middle" font-family="${sans}" font-size="26" font-weight="700" fill="${palette.onAccent}">${escape(model.headline)}</text>
<rect x="${sheetX}" y="${sheetY}" width="${sheetW}" height="${sheetBottom - sheetY}" rx="20" fill="${palette.onAccent}"/>
<rect x="${qrX}" y="${qrY}" width="${QR_CARD}" height="${QR_CARD}" rx="16" fill="${palette.onAccent}"/>
${code}
<circle cx="${centreX}" cy="${centreY}" r="${IDENTICON / 2 + 4}" fill="${palette.onAccent}"/>
${identicon}
<text x="${CARD_W / 2}" y="${nameY}" text-anchor="middle" font-family="${sans}" font-size="15" font-weight="700" fill="${palette.ink}">${escape(model.name)}</text>
<text x="${CARD_W / 2}" y="${line1Y}" text-anchor="middle" font-family="${mono}" font-size="11" fill="${palette.ink}" opacity="0.4">${escape(model.lines[0])}</text>
<text x="${CARD_W / 2}" y="${line2Y}" text-anchor="middle" font-family="${mono}" font-size="11" fill="${palette.ink}" opacity="0.4">${escape(model.lines[1])}</text>
<rect x="${noteX}" y="${noteY}" width="${noteW}" height="${noteH}" rx="${noteH / 2}" fill="none" stroke="${palette.border}"/>
<circle cx="${noteX + 4 + MARK / 2}" cy="${noteY + noteH / 2}" r="${MARK / 2}" fill="${model.networkMark.badgeColor}"/>
<text x="${noteX + 4 + MARK / 2}" y="${noteY + noteH / 2 + 4}" text-anchor="middle" font-family="${sans}" font-size="10" font-weight="700" fill="${palette.onAccent}">${escape(model.networkMark.ticker)}</text>
<text x="${noteX + 4 + MARK + 6}" y="${noteY + noteH / 2 + 4}" font-family="${sans}" font-size="11" fill="${palette.ink}">${noteText}</text>
<svg x="${brandX}" y="${brandY}" width="${BRAND}" height="${BRAND}" viewBox="${BRAND_MARK.viewBox}">${brandMark}</svg>
<text x="${brandX + BRAND + 12}" y="${brandY + BRAND / 2 + 9}" font-family="${sans}" font-size="26" font-weight="700" fill="${palette.onAccent}">${wordmark}</text>
</svg>`;
}

/** The card drawn to pixels — its own document, so a canvas can read it. */
export async function renderShareCanvas(model: ShareCardModel): Promise<HTMLCanvasElement> {
	const fonts = (
		await Promise.all([
			fontFace('Plus Jakarta Sans', jakartaBold, 700),
			fontFace('IBM Plex Mono', plexMono, 400)
		])
	).join('');
	const svg = composeShareSvg(model, readPalette(), fonts);
	const image = new Image();
	image.decoding = 'async';
	await new Promise<void>((resolve, reject) => {
		image.onload = () => resolve();
		image.onerror = () => reject(new Error('share image: the card did not render'));
		image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
	});
	const canvas = document.createElement('canvas');
	canvas.width = CARD_W * SCALE;
	canvas.height = CARD_H * SCALE;
	const ctx = canvas.getContext('2d');
	if (ctx === null) throw new Error('share image: no 2d context');
	ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
	return canvas;
}

/** Compose, rasterise, hand over. Resolves false when the browser refused. */
export async function saveShareImage(model: ShareCardModel, fileName: string): Promise<boolean> {
	try {
		const canvas = await renderShareCanvas(model);
		const blob = await new Promise<Blob | null>((resolve) =>
			canvas.toBlob((result) => resolve(result), 'image/png')
		);
		if (blob === null) return false;
		await saveBlob(fileName, blob);
		return true;
	} catch {
		return false;
	}
}
