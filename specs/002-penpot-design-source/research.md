# Research — Penpot Design Source of Truth (Phase 0)

All Technical-Context unknowns resolved. Decisions below were verified **empirically against the live Penpot 2.16 instance over MCP** on 2026-07-29 (not assumed).

## R1. Write path & connection topology

- **Decision**: Generate exclusively through `mcp__penpot__execute_code` (Penpot plugin API + `penpotUtils` + persistent `storage`), with chrome-devtools MCP keeping the `claude-agent@vela.local` workspace tab alive (integrated MCP mode, toolbar "MCP" button).
- **Rationale**: Verified end-to-end (board create/verify/remove smoke test passed). Integrated mode auto-reconnects (reconnect watcher); the manually-installed plugin variant is broken in multi-user mode ("Missing userToken parameter") and was removed.
- **Alternatives considered**: Penpot backend RPC/import (`.penpot` file generation) — undocumented, bypasses the only supported API, no incremental update; manual design work — not reproducible, violates FR-008.
- **Operational facts** (for whoever operates this next): token is per-account (Your account → Integrations → MCP Server); client config change requires `/mcp` reconnect; ONE plugin connection per token (duplicates rejected); `docker restart penpot-penpot-mcp-1` clears zombie bridge state and clients' sessions are auto-adopted afterward; never "Regenerate MCP key" (invalidates `~/.claude.json`).

## R2. Prototype interactions (FR-005a)

- **Decision**: Wire the state graph with native interactions: `shape.addInteraction(trigger, action)` — verified available on all shapes; e.g. `btn.addInteraction('click', { type: 'navigate-to', destination: board })`. Overlay surfaces use `open-overlay` / `close-overlay`; back affordances use `previous-screen`. Non-navigational transitions (loading→loaded, default→error) get an **annotation chip** on the source board (small tagged text, name-prefixed `edge:`) stating trigger condition and destination board name, because Penpot triggers are pointer/delay-based only.
- **Rationale**: Native interactions are machine-readable via the same API (`Interaction.action.destination`), satisfying the traversability acceptance (SC-007) without a parallel bespoke format.
- **Alternatives**: drawing arrows (not machine-readable); external JSON graph (second source of truth — rejected; the annotation chips live inside the file).

## R3. Typography

- **Decision**: `Plus Jakarta Sans` (verified present: `gfont-plus-jakarta-sans`, weights 200–800 incl. the needed 400/500/600/700). Mono zone: **IBM Plex Mono** (verified present) as depiction stand-in, every mono usage annotated "runtime: platform mono (iOS Menlo / Android monospace)". Numeric zone: Plus Jakarta Sans 400 with a documented mandate note that rebuilds SHOULD use tabular figures (inventory 02 flags the RN app lacks true tabular alignment).
- **Rationale**: Matches the real app (inventory 01: the `inter` export name is a misnomer; actual family is Plus Jakarta Sans). Menlo is not distributable/available (verified absent).
- **Alternatives**: uploading Menlo (license risk, adds nothing normative); naming the token "Inter" after the code export (would propagate the misnomer — token name records truth, with a code-name cross-reference note).

## R4. Token mirroring & themes

- **Decision**: Three token sets — `core` (spacing, radius, text sizes/weights, borders, opacity, motion durations as number tokens), `color-light`, `color-dark` — plus two themes: `Light` (core + color-light), `Dark` (core + color-dark). Token names use dot notation identical to `theme.ts` semantics (`color.bg.base`, `space.xl`, `radius.xl`, `text.lg`, `shadow.sm`, `motion.duration.fast`). Non-tokenizable values (spring configs, press scales, haptic patterns) live on the `Patterns` documentation page with exact parameters.
- **Rationale**: 1:1 name parity makes the SC-001 audit a mechanical diff; light/dark as parallel sets under themes is Penpot's native model and matches the app's `getThemeColors` structure.
- **Alternatives**: one set with mode suffixes in names (breaks Penpot theme switching); mirroring the legacy `Spacing`/`Fonts` exports (excluded — inventory 01 marks them legacy; recorded as exclusions in the coverage matrix).

## R5. Idempotency & resumability (FR-008)

- **Decision**: Every asset is addressed by **stable name** (grammar in data-model.md). Each generator chunk follows upsert discipline: find by name → update in place; missing → create; obsolete (name no longer in manifest) → flagged by audit, removed only by an explicit cleanup chunk. Generator chunks are numbered repo files in `generator/` executed sequentially; each records completion in `storage.progress[<chunk-id>]` AND is safe to re-run cold (storage may be wiped by plugin reload — storage is a cache, names are the truth). Chunks stay < ~15s / ~200 shapes so a bridge drop can't corrupt a phase.
- **Rationale**: Survives plugin disconnects, container restarts, and full re-runs (SC-005: second run ⇒ zero duplicates/diffs). Repo-side scripts keep the pipeline reviewable in git.
- **Alternatives**: ID-based addressing (IDs are file-local, break on fresh-file regeneration); one mega-script (timeout + non-resumable).

## R6. Page organization (single file)

- **Decision**: 11 pages, numbered for stable ordering: `00 Start Here`, `01 Design Language`, `02 Tokens & Type`, `03 Components`, `04 IA & Flows`, `05 Screens · Wallet`, `06 Screens · Browser & Connect`, `07 Screens · Settings & Onboarding`, `08 Overlays`, `09 Patterns` (motion/a11y/platform/i18n), `10 Dev & Parallel Space` (excluded from acceptance).
- **Rationale**: Mirrors the spec's story order; numbered prefixes give agents a deterministic reading order (consumption contract).
- **Alternatives**: multiple files (splits the interaction graph — Penpot interactions cannot cross files; rejected per spec assumption).

## R7. Verification tooling

- **Decision**: Four mechanical audits (scripts in `generator/`): token parity (Penpot tokens vs `theme.ts` export), coverage matrix (inventory manifest vs boards-by-name), idempotency diff (shape-count + name-set + geometry hash before/after re-run), graph connectivity (BFS from `S/home/default` over `Interaction.action.destination` + `edge:` chips). Visual spot-checks: `export_shape` PNG vs screenshots of the live web app (chrome-devtools drives the parallel-space test env at 390×844).
- **Rationale**: Each SC maps to one audit; all run over the same MCP channel with no extra infrastructure.
- **Alternatives**: manual review only (not repeatable; fails SC-005/SC-007 measurement).

## R8. Inventory corrections precede generation

- **Decision**: Apply `inventory/09-gaps.md` as the first implementation tasks: fix the 3 reports carrying the stale entrance-animation platform rule (entrances are iOS-only; Android AND web render settled) and the stale text-scale range (truth: 6 levels, 0.82–1.35, × web 1.2 boost); spec the missed surfaces (dApp-browser chrome + account pill trigger, LanguagePickerModal, web-request.tsx full spec); mark BundlerFundingModal standalone wrapper dead-code (do not board); add the i18n-resilience section; record scope rulings (safari-extension popup = documented exclusion with palette-drift warning; safe-recovery-extension = out of scope).
- **Rationale**: FR-001 traceability — generating from known-wrong facts would bake errors into the authority file.

## R9. Depiction policy (resolved from spec assumptions)

- English copy, 1.0× text scale, light theme boards; dark theme via token themes + one representative dark board per major surface family (home, signing sheet, send confirm, settings root). Screens whose shipped style lags the design language are drawn **normative** and flagged `drift:` in the coverage matrix. iPhone-class frame 390×844 as canonical board size (matches the app's web phone frame); platform divergences annotated, not duplicated per platform.
