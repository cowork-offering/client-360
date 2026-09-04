// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import shellSource from "./vendor/assets/review-shell.js?raw";
import { reviewerFor, withReviewShell, type MemoReviewer } from "./reviewShell";
import {
  applyEditedSections,
  attestationFrom,
  bindReviewBridge,
  editedSectionHtml,
  liftReview,
  type ReviewFrame,
  type ReviewFrameWindow,
} from "./reviewBridge";
import { sectionsFrom } from "./renderMemo";
import type { MemoSectionRecord } from "./store";

/* =============================================================================
   THE BRIDGE, AGAINST THE SHELL ITSELF.

   Nothing below mocks the review panel. `withReviewShell` produces the document
   the room puts in its frame; the scripts it injected are executed here IN
   DOCUMENT ORDER against a parsed copy of that document, which is exactly what
   a browser does with a `srcdoc`, and the assertions then drive the shell's own
   buttons. So "the reviewer was named before the shell looked" and "an approval
   reaches the room" are proved against the vendored file rather than against a
   description of it.

   THE MARKUP IS THE RENDERER'S CONTRACT, not the renderer's output: a module is
   `section.page[data-mod]` carrying an `.attestation` badge, and narrative the
   banker may rewrite is `[data-editable]`. The real thing is driven end to end
   in `src/memoRoom.render.test.tsx`, over the memo the renderer actually built;
   here the point is the bridge, and a small document keeps it about the bridge.
   ============================================================================= */

const REVIEWER: MemoReviewer = {
  name: "Fabian Goetzens",
  role: "Relationship Manager",
  date: "Sep 4, 2026",
  iso: "2026-09-04T09:12:00Z",
};

const section = (id: string, name: string, prose: string) =>
  `<section class="page" data-mod="${id}" data-modname="${name}">` +
  `<h2>${name}</h2>` +
  `<div class="attestation att-pending"><span class="att-dot"></span><span>pending</span></div>` +
  `<div class="rte-narrative" data-editable><p>${prose}</p></div>` +
  `</section>`;

const MEMO =
  "<html><body>" +
  section("executive_summary", "Executive Summary", "The recommendation is to approve the increase.") +
  section("collateral", "Collateral", "The Kokomo plant carries a first lien.") +
  "</body></html>";

const SECTIONS = sectionsFrom(MEMO);

/**
 * The document as the frame would hold it, with its own scripts run in the
 * order the HTML puts them in. The injected block is the last thing before
 * `</body>`: the reviewer assignment, then the shell.
 */
function openFrame(html = MEMO, attestation = {}): ReviewFrame {
  const doc = new DOMParser().parseFromString(withReviewShell(html, { reviewer: REVIEWER, attestation }), "text/html");
  const win: ReviewFrameWindow = {};
  for (const script of [...doc.querySelectorAll("script")]) {
    new Function("window", "document", script.textContent ?? "")(win, doc);
  }
  return { doc, win };
}

/** Click the first of the shell's own controls matching, and let the microtask
 *  the bridge defers on run, which is what a browser does inside the click. */
async function press(frame: ReviewFrame, selector: string): Promise<void> {
  frame.doc.querySelector<HTMLElement>(selector)!.click();
  await Promise.resolve();
}

/* ============================================================== THE INJECTION */

describe("the review shell, into the frame", () => {
  it("names the reviewer in a script that stands before the shell's own", () => {
    const html = withReviewShell(MEMO, { reviewer: REVIEWER, attestation: {} });
    const at = html.indexOf("window.RV_REVIEWER=");
    const shellAt = html.indexOf("Interactive review shell (client-side)");
    expect(at).toBeGreaterThan(-1);
    expect(shellAt).toBeGreaterThan(at);
    // …and both are inside the body, which is what makes the order binding:
    // classic scripts in a parsed document run in document order.
    expect(html.indexOf("</body>")).toBeGreaterThan(shellAt);
  });

  it("so every badge carries the banker's name rather than the shell's fallback", () => {
    const frame = openFrame();
    expect(frame.win.RV_REVIEWER?.name).toBe("Fabian Goetzens");
    const bar = frame.doc.querySelector(".rv-bar .rv-id");
    expect(bar?.textContent).toContain("Fabian Goetzens");

    frame.doc.querySelector<HTMLElement>(".rv-approve")!.click();
    expect(frame.doc.querySelector(".attestation")!.textContent).toContain("Fabian Goetzens, Relationship Manager");
  });

  it("falls back to Reviewer when nothing was injected, which is what late is", () => {
    const doc = new DOMParser().parseFromString(MEMO, "text/html");
    const win: ReviewFrameWindow = {};
    new Function("window", "document", shellSource)(win, doc);
    doc.querySelector<HTMLElement>(".rv-approve")!.click();
    expect(doc.querySelector(".attestation")!.textContent).toContain("Reviewed by Reviewer");
  });

  it("takes the export button and its pre off the glass, and keeps review-all", () => {
    const html = withReviewShell(MEMO, { reviewer: REVIEWER, attestation: {} });
    expect(html).toContain(".rv-bar .rv-export{display:none!important}");
    expect(html).toContain("#rv-export{display:none!important}");
    // The shell still BUILDS both; what changes is that nobody can reach them,
    // because the room reads the map directly.
    const frame = openFrame();
    expect(frame.doc.querySelector(".rv-export")).toBeTruthy();
    expect(frame.doc.querySelector(".rv-all")).toBeTruthy();
  });

  it("takes every control off a stored memo, and leaves the badges it was saved with", () => {
    const html = withReviewShell(MEMO, { reviewer: REVIEWER, attestation: {}, readOnly: true });
    expect(html).toContain(".rv-bar,.rv-ctrl{display:none!important}");
    expect(withReviewShell(MEMO, { reviewer: REVIEWER, attestation: {} })).not.toContain(".rv-bar,.rv-ctrl{display");
  });

  it("replays a map into the shell, so a re-render never resets the checklist", () => {
    const frame = openFrame(MEMO, {
      executive_summary: { status: "approved", approvedBy: "Fabian Goetzens", approvedDate: "2026-09-04T09:12:00Z" },
    });
    const badges = [...frame.doc.querySelectorAll(".attestation")];
    expect(badges[0].className).toContain("att-approved");
    expect(badges[1].className).toContain("att-pending");
    expect(frame.win.RV_ATTESTATION!.executive_summary.status).toBe("approved");
    expect(frame.win.RV_ATTESTATION!.collateral.status).toBe("ai-drafted");
  });
});

/* =================================================================== THE LIFT */

describe("the lift out of the shell", () => {
  it("hears every approval through the shell's own progress hook", async () => {
    const frame = openFrame();
    const heard: number[] = [];
    const stop = bindReviewBridge(frame, (f) => {
      heard.push(Object.values(liftReview(f, SECTIONS).records).filter((r) => r.status !== "draft").length);
    });

    // The bind itself is a read: a replayed memo is already partly reviewed.
    expect(heard).toEqual([0]);
    await press(frame, ".rv-approve");
    expect(heard).toEqual([0, 1]);
    await press(frame, ".rv-all");
    expect(heard[heard.length - 1]).toBe(2);

    stop();
    await press(frame, ".rv-undo");
    expect(heard[heard.length - 1]).toBe(2);
  });

  it("leaves the memo's own progress pill on the hook it had first", async () => {
    const frame = openFrame();
    const pill: string[] = [];
    frame.win.__memoProgressSync = () => pill.push("pill");
    const stop = bindReviewBridge(frame, () => {});
    await press(frame, ".rv-approve");
    expect(pill).toEqual(["pill"]);
    stop();
    expect(frame.win.__memoProgressSync).toBeTypeOf("function");
    await press(frame, ".rv-all");
    expect(pill).toEqual(["pill", "pill"]);
  });

  it("reads an approval as a record the store can hold, titles and all", async () => {
    const frame = openFrame();
    await press(frame, ".rv-approve");
    const { records, attestation } = liftReview(frame, SECTIONS);

    expect(records.executive_summary).toEqual({
      id: "executive_summary",
      title: "Executive Summary",
      status: "approved",
      note: undefined,
      by: "Fabian Goetzens",
      at: "2026-09-04T09:12:00Z",
    });
    expect(records.collateral.status).toBe("draft");
    expect(attestation.executive_summary.status).toBe("approved");
    expect(attestation.collateral).toEqual({ status: "ai-drafted" });
  });
});

/* ================================================================== THE EDIT */

describe("the banker's own words", () => {
  it("keeps the edit note and the edited narrative when a section is rewritten", () => {
    const frame = openFrame();
    const sec = frame.doc.querySelector<HTMLElement>('section[data-mod="collateral"]')!;
    sec.querySelector<HTMLElement>(".rv-edit")!.click();
    sec.querySelector<HTMLElement>("[data-editable]")!.innerHTML = "<p>The Kokomo appraisal is stale.</p>";
    sec.querySelector<HTMLElement>(".rv-save")!.click();

    const { records, edits } = liftReview(frame, SECTIONS);
    expect(records.collateral.status).toBe("edited");
    expect(records.collateral.note).toBe("Revised in review");
    expect(edits.collateral).toContain("The Kokomo appraisal is stale.");
    // The shell's own furniture never rides along into the record.
    expect(edits.collateral).not.toContain("rv-ctrl");
    expect(edits.collateral).not.toContain("contenteditable");
  });

  it("splices the edit into the rendered memo and leaves every other byte alone", () => {
    const frame = openFrame();
    const sec = frame.doc.querySelector<HTMLElement>('section[data-mod="collateral"]')!;
    sec.querySelector<HTMLElement>(".rv-edit")!.click();
    sec.querySelector<HTMLElement>("[data-editable]")!.innerHTML = "<p>Reappraisal ordered $ due Q4.</p>";
    sec.querySelector<HTMLElement>(".rv-save")!.click();

    const out = applyEditedSections(MEMO, liftReview(frame, SECTIONS).edits);
    expect(out).toContain("Reappraisal ordered $ due Q4.");
    expect(out).not.toContain("The Kokomo plant carries a first lien.");
    // The section that was not touched is the renderer's bytes, unchanged.
    expect(out).toContain(SECTIONS[0].html);
  });

  it("returns nothing for a section that is not in the frame, or an id that is not one", () => {
    const frame = openFrame();
    expect(editedSectionHtml(frame.doc, "not_a_module")).toBeNull();
    expect(editedSectionHtml(frame.doc, 'x"], section')).toBeNull();
    expect(applyEditedSections(MEMO, {})).toBe(MEMO);
  });
});

/* ================================================================ THE REPLAY */

describe("the stored map, replayed", () => {
  const stored: MemoSectionRecord[] = [
    { id: "executive_summary", title: "Executive Summary", status: "approved", by: "Fabian Goetzens", at: "2026-09-04T09:12:00Z" },
    { id: "collateral", title: "Collateral", status: "edited", by: "Fabian Goetzens", at: "2026-09-04T09:12:00Z", note: "Revised in review" },
  ];

  it("turns stored records back into the shell's vocabulary", () => {
    expect(attestationFrom(stored)).toEqual({
      executive_summary: {
        status: "approved",
        approvedBy: "Fabian Goetzens",
        approvedDate: "2026-09-04T09:12:00Z",
        editNote: undefined,
      },
      collateral: {
        status: "edited",
        approvedBy: "Fabian Goetzens",
        approvedDate: "2026-09-04T09:12:00Z",
        editNote: "Revised in review",
      },
    });
    expect(attestationFrom([{ id: "risk", title: "Risk", status: "draft" }])).toEqual({ risk: { status: "ai-drafted" } });
  });

  it("comes back through the shell as the sign-offs it went in as", () => {
    const frame = openFrame(MEMO, attestationFrom(stored));
    const { records } = liftReview(frame, SECTIONS);
    expect(records.executive_summary.status).toBe("approved");
    expect(records.collateral.status).toBe("edited");
    expect(records.collateral.note).toBe("Revised in review");
  });
});

describe("the reviewer the room signs with", () => {
  it("is the view's own user, on the room's clock", () => {
    expect(reviewerFor("Fabian Goetzens", "Sep 4, 2026", "2026-09-04T09:12:00Z")).toEqual(REVIEWER);
  });

  it("says Reviewer where the view carries no user, rather than inventing one", () => {
    expect(reviewerFor(null, "Sep 4, 2026", "2026-09-04T09:12:00Z").name).toBe("Reviewer");
    expect(reviewerFor("  ", null, "").date).toBe("");
  });
});
