# 21st.dev design-variant track — generation log (2026-08-26)

Track spec: HANDOVER-2026-08-26.md ("The 21st.dev design-variant track" + the graft contract).
Server: MCP "21st" (HTTP, https://21st.dev/api/mcp), project-scoped in ~/.claude.json on Archy,
tier paid. The old broken "magic" npx entry was removed 2026-08-26 (backup
~/.claude.json.bak-magic-removal-20260826).

## Generations fired 2026-08-26 (sketch mode, 4 takes each)

| Surface | projectId | URL |
|---|---|---|
| Modification Workroom (flagship) | `d9cab516-48ad-4162-9eb7-cbfe61c4400f` | https://21st.dev/ai/d9cab516-48ad-4162-9eb7-cbfe61c4400f |
| Cockpit | `0bcf0331-1295-4a11-8e59-fecdf6110051` | https://21st.dev/ai/0bcf0331-1295-4a11-8e59-fecdf6110051 |

Four named directions, identical across both surfaces so one winning system can unify them:
1. **Museum Ledger** — gallery-white, hairline rules, ink-only hierarchy, #A100FF exactly once.
2. **Frosted Instrument** — frosted-glass strips over a faint radial wash, visionOS calm.
3. **Editorial Broadsheet** — financial-editorial typesetting, display numerals, term-sheet feel.
4. **Evening Console** — graphite dark, #A100FF as the single luminous primary.

Prompts embedded the full graft contract inline (real Hartwell figures verbatim: revolver
$15,000,000 → $18,000,000, new Equipment $2,000,000 Proposal, SOFR+275 7.60%, maturity 2027-03-15,
FCCR 1.22x vs 1.15x floor / 7 bps cushion, $46.0MM/$31.03MM, grade 4; package altitude; N of M;
governance beats as sacred UI moments; Exception ≠ breached; muted status inks; #A100FF restraint;
component inventory WorklistRow…ApproveBar; motion spec; AA). Note: the API's `context` object
returned `contextApplied:false` both times — harmless, every constraint was also in the prompt body.

## Workflow from here
1. Fabian opens the two URLs, watches the 4 takes build per surface, picks/comments.
2. Refinements from this session: `iterate_generation(projectId, instruction, take)` (paid, sketch-editable).
3. Winner grafts into `app/src/styles/tokens.css` + component classes ONLY (we keep data
   contracts, guards, wiring — variants donate the visual system, graft contract rule 5).
4. Full gates before republish: vitest (1,601), typecheck, contrast-check. Both artifact URLs.
