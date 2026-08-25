# UAT findings, Fabian live test 2026-08-25 (ticket UX pass scope)
F1 layout: ticket should lead with the PP NAME as headline, member loans as clean sleek rows inside (current header+list reads dense and weird)
F2 challenge cards: no clear ask; verdict first, decision-oriented affordances (Acknowledge and proceed / Decline with reason); explain in one line what the panel is
F3 challenge freshness: cards computed from baked bundle timestamp (2026-07-25) even after live sync; must recompute from the live-synced bundle and show that timestamp
F4 provenance leak: raw contract paths (borrower.covenants...actualValue, tool names) shown to the banker; replace with banker-language gap notes, technical detail behind an info toggle; also fix covenant context not displaying cleanly in the ticket
F5 prefill + package selection: amount prefills per selected member from current commitment with explicit from->to; package selector when the relationship has more than one package; policy label "demo-2026-07" should read as what it is (demo policy pack) until WS2 lands
F6 collateral context (Fabian, same session): the ticket must show selected members' pledges (collateral, pledged share, advance rate, lien) as banker-readable rows, connected to the pro-forma coverage card; relationship covenants shown as context, junction covenants as "will carry onto the new loan". Scope sent to the running UX agent.
Concrete F3 case: revolver HAS the BBC loan-level junction; stale card claimed none. Regression test required.

## Discussion topics for the next working session (Fabian to weigh in)
1. Challenge panel long-term: local demo policy vs WS2 policy pack (Jon) as the computing layer; what the booth shows.
2. Ticket information depth: how much covenant/collateral context in the ticket vs one click away (density vs sleekness).
3. Amount semantics for multi-select (same target per member vs per-member targets, phase 2?).
4. Renewal ticket package-first pass (same treatment as modification; separate decision).
5. Home-screen sync affordance (book-level) for the polish pass.
