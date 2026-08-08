#!/usr/bin/env node
// Literal audit (SC-003): no visual literals outside the DesignSystem layer.
//
// Scans app-ios/VelaWallet/VelaWallet/{App,Components,Features,Localization}
// for hardcoded colors, system-font calls, and bare numeric values passed to
// layout modifiers. DesignSystem/ is exempt (it is the sanctioned home of
// values); test targets are out of scope.
//
// Heuristic is line-based: a layout call with a numeric argument passes when
// the same line references a sanctioned source (Tokens./WelcomeGeometry./
// Typography./Interaction./Brand.). This catches drive-by literals; it does
// not attempt cross-line data-flow analysis.
//
// Exit 1 with file:line:snippet on violations, 0 otherwise.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const appDir = join(root, "VelaWallet", "VelaWallet");
const scanDirs = ["App", "Components", "Features", "Localization"].map((d) => join(appDir, d));

const SANCTIONED = /(Tokens\.|WelcomeGeometry\.|WalletGeometry\.|Typography\.|Interaction\.|Brand\.)/;
const RULES = [
  // Swift hex colors are numeric literals (0xAARRGGBB) or "#RRGGBB" strings.
  // Quoted 0x… tokens are wallet ADDRESSES (spec 015 fixtures, ported
  // verbatim from data-model.md), so the 0x form skips string contents.
  { name: "hex color literal", re: /0x[0-9A-Fa-f]{6,8}/, stripStrings: true },
  { name: "hex color string", re: /"#[0-9A-Fa-f]{3,8}"/ },
  { name: "constructed Color", re: /Color\((red|hue|white|\.sRGB)/ },
  { name: "system font call", re: /\.font\(\.system|Font\.system\(|UIFont\(/ },
  {
    name: "bare layout number",
    re: /\.(padding|cornerRadius)\(\s*\d+(\.\d+)?\s*[,)]|\.frame\([^)]*\b(width|height|minWidth|minHeight|maxWidth|maxHeight):\s*\d+(\.\d+)?\b|\b(spacing|lineWidth|minLength):\s*\d+(\.\d+)?\b/,
    allowSanctionedLine: true,
    allowZeroOne: true,
  },
];

function* swiftFiles(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) yield* swiftFiles(p);
    else if (p.endsWith(".swift")) yield p;
  }
}

const violations = [];
let scanned = 0;
for (const dir of scanDirs) {
  for (const file of swiftFiles(dir)) {
    scanned += 1;
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      const code = line.split("//")[0]; // ignore comments
      for (const rule of RULES) {
        const target = rule.stripStrings ? code.replace(/"(?:[^"\\]|\\.)*"/g, '""') : code;
        const m = target.match(rule.re);
        if (!m) continue;
        if (rule.allowSanctionedLine && SANCTIONED.test(code)) continue;
        if (rule.allowZeroOne && /^\s*$/.test(code)) continue;
        if (rule.allowZeroOne) {
          const nums = (code.match(/\b\d+(\.\d+)?\b/g) ?? []).filter((n) => n !== "0" && n !== "1");
          if (nums.length === 0) continue;
        }
        violations.push(`${relative(root, file)}:${i + 1}: [${rule.name}] ${line.trim()}`);
      }
    });
  }
}

if (violations.length > 0) {
  console.error(`audit-literals: ${violations.length} violation(s) in ${scanned} file(s):`);
  for (const v of violations) console.error("  " + v);
  process.exit(1);
}
console.log(`audit-literals: clean (${scanned} files scanned)`);
