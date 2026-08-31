import { useMemo } from "react";
import { useApp } from "../state/appState";
import { buildWorklistRows } from "../data/worklistRows";
import { Briefing } from "./Briefing";
import { KpiBand } from "./KpiBand";
import { Worklist } from "./Worklist";
import { Weave } from "./Weave";

/* =============================================================================
   SURFACE 1 — THE LANDING.

   Briefing, then the KPI band, then the queue, over the weave. The order is the
   argument: what needs you, what the book is worth, which files. Rule 21 keeps
   the ground clean — no purple bloom on the page; the only ambient violet on
   this surface is the weave, which is sanctioned identity texture.

   The `view show` classes are the mint's view contract (the entry animation and
   the suppression hook the name flight will need in Surface 2). Only one view
   is mounted at a time here, so `show` is always on.
   ============================================================================= */

export function Landing() {
  const { data, worklist } = useApp();
  const rows = useMemo(() => buildWorklistRows(data, worklist), [data, worklist]);
  const bookSize = data.portfolio?.accounts?.length ?? rows.length;

  return (
    <div className="view show" id="view-home">
      <Weave />
      <div className="page" style={{ paddingTop: 40, paddingBottom: 100, position: "relative", zIndex: 1 }}>
        <Briefing rows={rows} bookSize={bookSize} generatedAt={data.meta?.generatedAt ?? ""} />
        <KpiBand />
        <Worklist />
      </div>
    </div>
  );
}
