# Quickstart — validation runbook

Prerequisites: local Penpot docker stack up (`localhost:9001`), `~/.claude.json` project MCP entry `penpot` pointing at `http://localhost:9001/mcp/stream?userToken=<claude-agent key>`, chrome-devtools automation browser logged in as `claude-agent@vela.local` with the file **"Vela Wallet — Design Source of Truth"** open (toolbar MCP menu shows "MCP connected").

## 1. Connection check (10s)

`mcp__penpot__execute_code` → `return { file: penpot.currentFile?.name, pages: penpotUtils.getPages().length }` — expect the file name and 11 pages (1 before generation). On "No plugin instance connected": reload the workspace tab (chrome-devtools); if a duplicate-connection loop appears in `docker logs penpot-penpot-mcp-1`, `docker restart penpot-penpot-mcp-1` and retry (sessions are auto-adopted).

## 2. Generate / resume

Run `generator/10-lib.js` first, then remaining chunks in numeric order (each via `execute_code`, checking the returned `{created, updated}` summary). Resume after any interruption by re-running the failed chunk — upsert discipline makes this safe. See [contracts/generator-contract.md](contracts/generator-contract.md).

## 3. Audits (map 1:1 to Success Criteria)

Run chunks `90`–`95`; all must return PASS:

- `90` idempotency: full re-run produces `created: 0` everywhere, stable name-set/geometry (SC-005)
- `91` token parity vs `src/constants/theme.ts` (SC-001)
- `92` coverage matrix: zero blank cells, ≥95% boards (SC-003)
- `93` graph connectivity from `S/home/default` (SC-007)
- `94` name-lookup sample (SC-006)
- `95` visual spot-check exports vs live web app (SC-002): compare against `npx expo start --web` (or parallel space) screenshots at 390×844 via chrome-devtools

Committed report: `generator/audit-report.md`.

## 4. Rebuild-readiness gate (SC-004, US5)

Spawn a FRESH agent with only Penpot MCP access (no repo). Prompt it to produce implementation specs for: (a) Home incl. rate-limited state, (b) Send end-to-end incl. gas/fee and funding edge states, (c) an ERC-20 approve signing request. Diff its output against the running app; any factual error (color, missing state, invented element, wrong flow) → fix the FILE (or docs pages), re-run the gate. Log gaps + fixes in `generator/gate-log.md`.

## 5. Re-sync procedure (FR-011)

When the app changes: re-run the relevant inventory agent(s) → update `inventory/` + `generator/manifest.json` → re-run affected generator chunks (suffix of pipeline) → re-run audits 90–94 → commit inventory + manifest + audit report together, noting the app git revision in the coverage matrix header.
