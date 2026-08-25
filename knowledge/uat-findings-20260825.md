# UAT findings, Fabian live test 2026-08-25 (ticket UX pass scope)
F1 layout: ticket should lead with the PP NAME as headline, member loans as clean sleek rows inside (current header+list reads dense and weird)
F2 challenge cards: no clear ask; verdict first, decision-oriented affordances (Acknowledge and proceed / Decline with reason); explain in one line what the panel is
F3 challenge freshness: cards computed from baked bundle timestamp (2026-07-25) even after live sync; must recompute from the live-synced bundle and show that timestamp
F4 provenance leak: raw contract paths (borrower.covenants...actualValue, tool names) shown to the banker; replace with banker-language gap notes, technical detail behind an info toggle; also fix covenant context not displaying cleanly in the ticket
F5 prefill + package selection: amount prefills per selected member from current commitment with explicit from->to; package selector when the relationship has more than one package; policy label "demo-2026-07" should read as what it is (demo policy pack) until WS2 lands
