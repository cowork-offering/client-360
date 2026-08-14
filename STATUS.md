# Customer 360 — Status & Charter (2026-08-14, post-migration)

**Read this first.** This repo is the single source for Customer 360: code, plugin packaging,
and the full knowledge tree (`knowledge/`). New sessions start here, then
`knowledge/HANDOFF-2026-07-27.md` for deep context.

## Why this matters

Customer 360 is a **component of the Commercial Credit Brain** (alongside the Commercial Credit
Memo) and **the showcase for Dreamforce**. The story it carries: a governed, write-capable MCP
server built entirely Salesforce-native (Apex invocables + McpServerDefinition, no middleware),
with a product-grade cockpit on top. Deliverable quality bar: spot-on.

## What exists, all live-verified

| Layer | State |
|---|---|
| **Salesforce MCP server** | 24 Apex tools in org `bankinggpt`, `Customer360` McpServerDefinition (21 in artifact manifest). 9 reads + stage/execute write pairs (bulk collateral valuation, service request, annual + risk-rating reviews, new facility w/ package-first + borrowing structure, covenant review) + stage-only mod/renewal. Engine: plan/planHash/single-use decisionToken, write-guard transition allowlist, idempotency, verification re-queries. Apex suite 170/170. Rebuild mirror: `knowledge/sf-build-v2/wp2/`. |
| **Cockpit (React)** | `app/` — worklist-first, two zones (Client Overview / KYC & Onboarding), deal-grammar tickets (package-anchored mod/renewal, bulk collateral picker, review fork), email→action suggestions, sync tiers + persistent overlay, ~1,200 tests. Compiled to `artifact/customer-360-template.html`. |
| **Published artifact** | claude.ai artifact URLs (main `f7a6006f-…`, copy `95cf2a8d-…`), verified byte-identical to repo HEAD bundle + data. Page calls connectors live via `window.claude.mcp` with viewer credentials. |
| **Cowork plugin** | `.claude-plugin/` + `skills/customer-360-cockpit` + bundled template + `render/assemble-cockpit.mjs` (agent fetches data → assembler bakes JSON → Cowork artifact). ⚠️ Plugin bundle STALE at commit `6eda1b6` (Jul 26) — pre-deal-grammar. Sync = outstanding item 1. |
| **Demo data** | Hartwell Industrial Group (91 records, $46MM, 6 booked loans, ids in `knowledge/DEMO-RELATIONSHIP.md`) + Piedmont anchor. Live-observed envelope datasets baked in `artifact/live-data.json`. |

## Wiring map

- **Org:** `bankinggpt` (shared Accenture sandbox — refresh risk acknowledged; mirror in
  `knowledge/sf-build-v2/` is the rebuild path). sf CLI auth on the Archy box.
- **Connectors (claude.ai):** Customer 360 (org MCP), IDB Gateway (LLM, 3 tools),
  Microsoft 365 (`outlook_email_search`).
- **Publish pipeline:** `app/npm run build` → `scripts/release-artifact.mjs` →
  `app/scripts/assemble-artifact.mjs` (full-tag marker injection, slot-verified — NEVER ad-hoc
  replace, see HANDOFF hard lesson) → Artifact republish to both URLs.
- **Sibling product:** Commercial Credit Memo (plugin `credit-memo-reinvented`, Experience MCP at
  `experience-mcp.vercel.app`). Shared doctrine: skills carry methodology, servers carry facts and
  writes, plugins ship the parts.
- **Dev seats:** Archy box (original) + **Banksy** (`ubuntu@98.87.86.133`) — migration COMPLETE and
  verified 2026-08-14: repo cloned at `/home/ubuntu/projects/customer-360` with working GitHub push
  auth (Credit Brain Dev app token), all 39 knowledge docs indexed in hybrid recall (probes 0.99-1.00),
  ontology nodes linked (repo -> project -> product, server -> project). Banksy rule: everything
  ubuntu-owned, never sudo git.
- **Functionality status: COMPLETE and live.** Everything in the "What exists" table works today on
  the published artifact URLs against the real org. The outstanding list below is packaging, sign-off
  and gated-by-design items — not missing functionality.

## Outstanding (priority order)

1. **Plugin sync** — refresh bundled template/data/skill to repo HEAD (`20bf17a`), skill prose
   still says 8 read tools (24 exist), version bump 0.4.1 → 0.5.0.
2. **Fabian's 100%-certain click-through** — incl. staging a real modification on a Hartwell
   booked loan (task open since July campaign).
3. **Codex adversarial review** of the full campaign delta (planned closer, never run).
4. **⚠️ ARMED WARNING:** renewal clone field set does not exclude `Loan_Collateral_Aggregate` —
   re-probe before `execute_renewal` is ever unblocked (HANDOFF §2).
5. **Covenant execute** — deployed, out of manifest; first live run fires a real approval email
   (founder-gated).
6. **Mod/renewal execute** — stage-only by design (LV06/Booked wall).
7. Housekeeping: Piedmont test rows (CV-0000000002/3, R-4) deletion decision; Credit Memo 0.54.0
   connector swap (sibling, tracked there).
8. Dreamforce narrative/demo script — deliberately not written yet (Fabian's hold).

## Key doctrine (short form; full: knowledge/HANDOFF + LESSONS-NCINO-APEX)

- Stage = zero domain DML; execute = exactly `{idempotencyKey, stagingId, planHash, decisionToken,
  approverUserId}`; approver == running identity.
- Observe wire envelopes before pinning shapes (invocable `required=true` is REST-enforced,
  test-invisible).
- Aggregate-by-identity on every per-involvement list; honest empties; display correctness is a
  contract for ALL relationships.
- Never touch pre-existing bankinggpt build; additive deploys with receipts.
