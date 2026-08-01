# Feature Specification: Web App Foundation + Onboarding Welcome Page

**Feature Branch**: `codex/006-web-onboarding`

**Created**: 2026-08-01

**Status**: Draft

**Input**: User description: "Vela Wallet Web 端重构（SvelteKit）：项目基础 + 首个页面 Onboarding。在 app-web/vela-wallet 现有脚手架上建立统一基础：设计系统接入（design-system.md 唯一规范来源，token 值来自 Penpot DTCG 导出），接入 vela-core 现有 i18n/l10n 资源与约定并验证 SSR 多语言渲染，按 design/onboarding 设计稿实现 Onboarding（Welcome）页，<1280px 移动布局 / ≥1280px 桌面布局，工程质量：单一来源、可复用组件、关键路径验证。分支名要求 codex/ 前缀。"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - First-time visitor lands on the Welcome page (Priority: P1)

A person who has never used Vela Wallet opens the web app's root URL. They immediately see the Vela brand (sailboat mark + wordmark), the product tagline, six short feature statements explaining why this wallet is different (no seed phrase, one address across 12+ networks, fully open source, keys live in the device password manager, audited Safe contracts, stablecoin gas), and two clear actions: a primary "Create Wallet" and a secondary "I already have a wallet". (An earlier draft included a quiet passkey-index-service link; the founder removed it from this page on 2026-08-01.)

**Why this priority**: This is the first page of the web rewrite and the entry point of every future journey. Without it there is nothing to ship or evaluate.

**Independent Test**: Open the app root in a browser with no stored state; the Welcome page renders fully (brand, tagline, six features, both actions) without errors and matches the reference designs.

**Acceptance Scenarios**:

1. **Given** a viewport ≥ 1280px wide, **When** the page loads, **Then** the desktop layout renders: left region with brand mark, wordmark, tagline and a 2×3 grid of numbered feature cards; right action column with primary "Create Wallet" and secondary "I already have a wallet".
2. **Given** a viewport < 1280px wide, **When** the page loads, **Then** the mobile layout renders: centered brand mark, wordmark and tagline; a single feature card with a 6-dot pager that the user can swipe/advance through all six features; and a bottom-anchored stack of the two action buttons.
3. **Given** any viewport between 320px and 1920px wide, **When** the page renders, **Then** no horizontal overflow, clipped content, or unreachable controls appear.
4. **Given** the Welcome page, **When** the user activates "Create Wallet" or "I already have a wallet", **Then** the app navigates to a defined destination route (placeholder pages are acceptable in this feature; the flows themselves are out of scope).

---

### User Story 2 - Consistent design language in light and dark mode (Priority: P2)

A visitor whose device prefers dark mode sees the dark Welcome design; a visitor preferring light mode sees the light design. Every color, spacing, radius, type style, shadow and motion value on the page comes from the shared design-token source, so future pages automatically inherit the same language.

**Why this priority**: The foundation (tokens + base components + theming) is the actual deliverable that all later pages build on; the Welcome page is its first consumer and proof.

**Independent Test**: Toggle the OS/browser color-scheme preference and reload: the page fully switches between the dark (D1) and light (D1L/W1L) treatments with readable contrast in both; a source audit of page code finds no hard-coded color/spacing/radius/shadow literals outside the token definitions.

**Acceptance Scenarios**:

1. **Given** a system preference of dark (or light), **When** the page loads, **Then** all surfaces, text, borders and actions use the corresponding mode's semantic token values, matching the respective reference design.
2. **Given** either mode, **When** contrast of body text and control labels against their surfaces is measured, **Then** it meets WCAG AA (≥ 4.5:1 for normal text, ≥ 3:1 for large text and UI boundaries) — with one recorded exception: the primary-CTA label on the brand accent (~3.6:1, the brand treatment the RN app also ships), carried in the delivery report as a pending founder decision.
3. **Given** the implemented page and base components, **When** the code is audited, **Then** color, spacing, radius, typography, shadow and motion values are defined once in the token layer and referenced semantically everywhere else (the orange accent appears only on the primary value-moving action).

---

### User Story 3 - Localized, indexable first screen (Priority: P3)

A visitor whose browser requests one of the wallet's 15 supported languages receives the Welcome page already translated in the initial server response — headings, feature cards and buttons — so search engines index localized content and users on slow connections never see untranslated flashes.

**Why this priority**: The i18n foundation must be proven SSR-capable before more pages are built on it, and the localization corpus/conventions already exist in the product core and must be reused, not forked.

**Independent Test**: Request the page with different language preferences and inspect the raw HTML response (no client scripts executed): the first-screen text appears in the requested language; unsupported languages fall back to English.

**Acceptance Scenarios**:

1. **Given** a request preferring a supported locale (e.g. `zh`, `ja`, `ru`), **When** the server responds, **Then** the initial HTML already contains the Welcome copy in that locale, using the existing translation corpus's keys, namespaces and interpolation conventions.
2. **Given** a request preferring an unsupported locale, **When** the server responds, **Then** English content is served as fallback and the page declares its language correctly for assistive tech and crawlers (`lang` attribute).
3. **Given** the delivery of this feature, **When** the founder reads the delivery report, **Then** it contains an explicit conclusion on server-rendered multilingual support: feasibility, SEO impact, recommended approach, limitations, and required technical adjustments.

---

### Edge Cases

- JavaScript disabled or failed: first-screen content (brand, tagline, six features as content, actions) is still present in the served HTML; the mobile pager may degrade to a static list/stack but must not hide content from crawlers.
- Viewport exactly at 1280px: desktop layout applies (breakpoint is `≥ 1280px` desktop, `< 1280px` mobile); resizing across the boundary must not break layout or lose state.
- No color-scheme preference expressed: default to dark (the "default" reference design W1 is dark) while still switching correctly when a preference exists.
- Long translations (e.g. German/Russian feature descriptions): cards grow vertically without truncation or overflow; buttons wrap or scale without clipping.
- Very narrow (320px) and very tall/short mobile viewports: action buttons remain visible and tappable; content scrolls rather than clips.
- Carousel boundaries on mobile: swiping past the last card or before the first card must not dead-end or scroll the page horizontally.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The web app MUST expose a root Welcome page implementing the reference designs `design/onboarding/` (W1 mobile dark, W1L mobile light, D1 desktop dark, D1L desktop light), with the desktop layout at viewport width ≥ 1280px and the mobile layout below 1280px.
- **FR-002**: The Welcome page MUST present: the in-app brand mark and "Vela Wallet" wordmark, the tagline, six numbered feature statements (01–06 as in the designs), a primary "Create Wallet" action, and a secondary "I already have a wallet" action. (The passkey-index-service link was removed per founder direction, 2026-08-01.)
- **FR-003**: The mobile layout MUST present the six features as a single-card carousel with a six-dot pager and swipe/advance interaction; the desktop layout MUST present them as a 2-row × 3-column card grid.
- **FR-004**: All visual values used by the page and its components (color, typography, spacing, radius, sizing, shadow, opacity, motion) MUST be sourced from a single design-token layer whose values derive from the Penpot DTCG export, with `design-system.md` as the governing intent document; no literal visual values in page/component code.
- **FR-005**: The app MUST support light and dark modes driven by the visitor's system preference, defaulting to dark when no preference exists, and MUST keep both modes at WCAG AA contrast.
- **FR-006**: The orange brand accent MUST appear only on the primary value-moving action (Create Wallet) and equivalent focused states — not on navigation, decoration, or secondary controls.
- **FR-007**: The app MUST reuse the existing product translation corpus and its conventions (locale set, namespaced key paths, `{{...}}` interpolation) for all Welcome copy that already exists in the corpus, and MUST add any new Welcome copy following those same conventions for all 15 locales.
- **FR-008**: The server response for the Welcome page MUST already contain the localized first-screen text for the negotiated locale (one of the 15 supported), falling back to English for unsupported locales, and MUST declare the document language.
- **FR-009**: Locale negotiation MUST be deterministic and crawler-friendly; the chosen approach and its SEO consequences MUST be documented in the delivery report.
- **FR-010**: The foundation MUST include reusable base components at minimum for: button (primary/secondary, disabled, hover/focus/active states, minimum 44px touch target), feature card, and page-level layout/theming primitives — each defined once and consumed by the Welcome page.
- **FR-011**: Both action buttons MUST navigate to defined placeholder destinations; the create/import flows themselves are out of scope for this feature.
- **FR-012**: The feature MUST ship automated verifications for: token single-sourcing (no stray literals), theme switching, locale resolution/fallback on the server-rendered output, and the 1280px layout switch.
- **FR-013**: Rendering MUST NOT depend on client-side translation loading for first-screen indexable text (no flash of untranslated content).

### Key Entities

- **Design token**: A named visual decision (e.g. background role, spacing step, radius, type role) with a value per mode where applicable; single source shared by all pages; derived from the Penpot export, governed by `design-system.md`.
- **Locale catalog**: The existing per-locale, per-namespace translation resources with established key paths and interpolation syntax; the Welcome page consumes existing keys and contributes new ones in the same shape.
- **Welcome feature card**: One of six numbered marketing statements (number, title, description) rendered as a grid cell (desktop) or carousel slide (mobile); copy is localized content, not hard-coded markup.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Fetching the Welcome page with each of the 15 supported language preferences returns initial HTML containing that locale's tagline and button labels (15/15 pass), and an unsupported locale returns English.
- **SC-002**: Visual comparison against the four reference designs (W1, W1L, D1, D1L) shows layout structure, hierarchy and color roles match; any deliberate deviations are listed in the delivery report with reasons.
- **SC-003**: At viewport widths 320, 375, 768, 1279, 1280, 1440 and 1920px, the page shows no horizontal scroll, no clipped or overlapping content, and all controls remain operable; 1279→mobile and 1280→desktop layout is verified.
- **SC-004**: Automated contrast checks of text/surface pairs used on the page pass WCAG AA in both modes.
- **SC-005**: A source audit (automated) finds zero hard-coded color/spacing/radius/shadow literals in page and component code outside the token layer.
- **SC-006**: Switching the system color scheme swaps the full page treatment without reload artifacts; verified in both directions.
- **SC-007**: The delivery report includes the SSR multilingual conclusion (feasibility, SEO impact, recommended approach, limitations, adjustments) and a token map for the page's key surfaces, text and actions as required by the design brief.
- **SC-008**: All existing repository quality gates that cover the web app pass (typecheck, lint, unit tests, e2e smoke), plus the new verifications from FR-012.

## Assumptions

- The existing SvelteKit scaffold under `app-web/vela-wallet` (already committed) is the starting point; this feature builds inside it rather than re-scaffolding.
- The six feature-card statements and the desktop tagline "您的密钥，您的资产" seen in the designs are new copy not fully present in the existing corpus; new keys will be added to the corpus's onboarding namespace in all 15 locales following existing conventions. English and Chinese are authored carefully; other locales receive best-effort translations flagged for later human review (consistent with the project's i18n history).
- Reference designs disagree on small details across modes (primary button corner radius pill vs rounded-rect). Default resolution: one consistent button shape from the token radius scale, listed as a deviation in the delivery report for founder review. The passkey-index link seen in the dark desktop mock was removed entirely per founder direction (2026-08-01); its corpus string is kept for the future settings screen.
- The mobile carousel advances by user swipe/tap only (no auto-play), matching the product's calm-UX stance; pager dots reflect position.
- Deployment target remains the scaffold's existing hosting setup; production deployment is out of scope for this feature.
- Text-scale support (six user levels) is a token-layer concern; the Welcome page must not break at larger scales, but the user-facing text-scale setting UI is out of scope.
