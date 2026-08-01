#!/usr/bin/env node
/**
 * Locale-catalog sync (spec 009-ios-onboarding-swiftui).
 *
 * Source  <-  public/i18n/<lng>.json                                (repo root)
 * Output  ->  VelaWallet/VelaWallet/Localization/Catalogs/<lng>.json
 *
 * The destination files are byte-for-byte COPIES so the iOS bundle can load
 * them offline; the source of truth is the i18n corpus, regenerated into
 * public/i18n by the repo-root scripts/gen-i18n.mjs. NEVER hand-edit either
 * side — fix the corpus, rerun gen-i18n, then rerun this sync.
 *
 * The locale list is derived from the files present in public/i18n and pinned
 * at exactly 15; a mismatch fails loudly so a corpus change is a conscious
 * decision here too. `--check` byte-compares every pair and flags extra or
 * missing destination files, for use as a CI drift gate.
 */

import { copyFileSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const APP_ROOT = join(import.meta.dirname, '..');
const SOURCE_DIR = join(APP_ROOT, '..', 'public', 'i18n');
const DEST_DIR = join(APP_ROOT, 'VelaWallet', 'VelaWallet', 'Localization', 'Catalogs');

/** public/i18n must carry exactly this many <lng>.json files (corpus pin). */
const LOCALE_COUNT = 15;

function jsonFiles(dir) {
	let entries;
	try {
		entries = readdirSync(dir);
	} catch {
		return [];
	}
	return entries.filter((f) => f.endsWith('.json')).sort();
}

function loadLocales() {
	const files = jsonFiles(SOURCE_DIR);
	if (files.length !== LOCALE_COUNT) {
		throw new Error(
			`expected exactly ${LOCALE_COUNT} locale files in ${SOURCE_DIR}, found ${files.length}` +
				(files.length ? `:\n  ${files.join('\n  ')}` : '') +
				`\nif the corpus legitimately changed, update LOCALE_COUNT in ${basename(import.meta.filename)}`
		);
	}
	return files;
}

function sync() {
	const files = loadLocales();
	mkdirSync(DEST_DIR, { recursive: true });
	for (const file of files) {
		copyFileSync(join(SOURCE_DIR, file), join(DEST_DIR, file));
	}
	console.log(`copied ${files.length} catalogs -> ${DEST_DIR}`);
}

function check() {
	const files = loadLocales();
	const destFiles = jsonFiles(DEST_DIR);
	const drift = [];
	for (const file of files) {
		if (!destFiles.includes(file)) {
			drift.push(`missing: ${file}`);
			continue;
		}
		const src = readFileSync(join(SOURCE_DIR, file));
		const dest = readFileSync(join(DEST_DIR, file));
		if (!src.equals(dest)) drift.push(`differs: ${file}`);
	}
	for (const file of destFiles) {
		if (!files.includes(file)) drift.push(`extra:   ${file}`);
	}
	if (drift.length) {
		console.error(
			`catalogs drift from public/i18n — run \`node app-ios/scripts/sync-catalogs.mjs\`:\n  ${drift.join('\n  ')}`
		);
		process.exit(1);
	}
	console.log(`catalogs in sync (${files.length} files)`);
}

function main() {
	if (process.argv.includes('--check')) check();
	else sync();
}

if (process.argv[1] && import.meta.filename === process.argv[1]) {
	main();
}
