# Generator chunks

Numbered `.js` files whose bodies are passed **verbatim** to `mcp__penpot__execute_code` against the file "Vela Wallet — Design Source of Truth", in numeric order. Full rules: [../contracts/generator-contract.md](../contracts/generator-contract.md) (upsert-by-name, <15s/<200 shapes per chunk, `// inv:` fact anchors, cold-start tolerant).

Operating notes: run `10-lib.js` first after ANY plugin reload (it installs `storage.lib`; later chunks throw without it). On bridge errors see [../quickstart.md](../quickstart.md) §1. Audits are chunks 90–95; their committed output is `audit-report.md`.
