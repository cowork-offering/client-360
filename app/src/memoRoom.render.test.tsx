// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import live from "../../artifact/live-data.json";
import { Workroom, neutralAsk, type WorkroomRouter } from "./components/workroom/Workroom";
import { createModifyEngine } from "./workroom/modifyEngine";
import { workroomContextFor } from "./workroom/openWorkroom";
import { clearComposed } from "./workroom/engine";
import { resetCatalog } from "./channel/catalog";
import { resetSessionDoor } from "./channel/sampleDoor";
import { MemoRoom, steerTarget, type MemoContext, type MemoDeps } from "./components/memo/MemoRoom";
import { closeMemoRoom, openMemoRoom, useMemoRoom } from "./components/memo/memoSession";
import { changesFromFiled, splitOfFiled } from "./components/memo/carry";
import { memoGreeting, executedRead } from "./components/memo/memoGreeting";
import { buildMemoDossier } from "./memo/dossier";
import { renderPlanFor, sectionsFrom, renderMemo } from "./memo/renderMemo";
import { applyMemoOverrides, memoDateFrom, MEMO_TYPE_FOR } from "./memo/overrides";
import { NOT_WIRED_LINE } from "./memo/publish";
import type { MemoDraft } from "./memo/store";
import type { FiledLine } from "./components/workroom/FiledList";
import type { ActionHistoryRow, ActionStep, BorrowerBundle, C360Data } from "./data/contract";
import type { MemoChange } from "./memo/types";

/* =============================================================================
   THE CREDIT MEMO ROOM, AS A SESSION.

   What is proved here is the ROOM and its two doors: that the facility room
   offers the memo without pretending it is a fourth route, that a finale hands
   its ledger over, that the greeting states what the ORG says was executed and
   says so honestly when the org says nothing, that the reading pane holds the
   memo the renderer produced with its DRAFT banner and one attestation control
   per section, that the publish door stays shut with its reason on it until
   every section is approved, and that what comes back from the writeback seam
   is the truth about this build.

   The renderer is proved in memo/parity.test.ts, the substitution seam in
   memo/overrides.test.ts, the change list and the greeting's sentences in
   components/memo/memoGreeting.test.ts and the store in memo/store.test.ts.
   Nothing below reaches a connector: the narrator and the publisher are
   injected, which is the same discipline the other two rooms' tests follow.
   ============================================================================= */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => resetSessionDoor());

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  act(() => closeMemoRoom());
  document.body.className = "";
  delete (window as unknown as { claude?: unknown }).claude;
  clearComposed();
  resetCatalog();
});

const data = live as unknown as C360Data;
const HARTWELL = "001bb00001I7FPNAA3";
const PACKAGE = "a5Fbb000000IHFJEA4";
const bundle = data.borrowers![HARTWELL] as BorrowerBundle;

const text = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();

/* ----------------------------------------------------------------- fixtures */

/** The org's own step detail for an executed modification on this package. */
const STEPS: ActionStep[] = [
  {
    id: "write_amount",
    type: "write",
    label: "Increase the line of credit to $15.0M",
    objectName: "LLC_BI__Loan__c",
    targetLoanId: "a4Zbb0000027MaYEAU",
    targetLabel: "Line of Credit",
    field: "LLC_BI__Amount__c",
    before: "$12,000,000",
    after: "$15,000,000",
    state: "verified",
    verification: "Customer360Exposure returned committed 15000000",
    orgRecordId: "a4Zbb0000027MaYEAU",
  },
  {
    id: "write_loan",
    type: "write",
    label: "Book the $3.0M equipment term loan",
    objectName: "LLC_BI__Loan__c",
    targetLoanId: "a4Zbb000002CECXEA4",
    targetLabel: "Equipment",
    field: "LLC_BI__Amount__c",
    after: "$3,000,000",
    state: "verified",
    orgRecordId: "a4Zbb000002CECXEA4",
  },
];

const trailRow = (steps: ActionStep[] | undefined): ActionHistoryRow => ({
  stagingId: "a8abb00001NL6ZUAA1",
  actionId: "loan-modification",
  status: "Completed",
  executedAt: "2026-09-03T14:02:00Z",
  productPackageId: PACKAGE,
  accountId: HARTWELL,
  steps,
  stepCount: steps?.length,
  changeCounts: steps ? { requested: 1, derived: 1 } : undefined,
});

/** The ledger the facility room's finale card is showing when it hands over. */
const FILED: FiledLine[] = [
  {
    key: "d1",
    icon: "commit",
    title: "Increase the line of credit",
    target: "Line of Credit",
    before: "$12.0M",
    after: "$15.0M",
    recordId: "a4Zbb0000027MaYEAU",
  },
  {
    key: "d2",
    icon: "pricing",
    title: "Reprice to SOFR + 250",
    target: "Line of Credit",
    after: "5.83%",
    recordId: "a4Kbb000001PRCEAA2",
    derivedReason: "nCino requires a pricing row when a commitment moves",
  },
];

const ctxFor = (over: Partial<MemoContext> = {}): MemoContext => ({
  accountId: HARTWELL,
  accountName: "Hartwell Precision Manufacturing LLC",
  packageId: PACKAGE,
  packageName: "Hartwell C&I Credit Package",
  trigger: "modify",
  user: "Fabian Goetzens",
  generatedAt: "2026-09-04T09:12:00Z",
  source: null,
  ...over,
});

interface Mounted {
  room: HTMLElement;
  prompts: string[];
  published: MemoDraft[];
  saved: MemoDraft[];
}

function openRoom(
  args: {
    rows?: ActionHistoryRow[];
    carried?: MemoChange[] | null;
    deps?: Partial<MemoDeps>;
    latest?: MemoDraft | null;
    ctx?: Partial<MemoContext>;
  } = {},
): Mounted {
  const executed = executedRead(args.rows ?? [], PACKAGE);
  const changes = executed.hasSteps ? executed.changes : (args.carried ?? []);
  const dossier = buildMemoDossier({
    bundle,
    changes,
    instanceUrl: data.meta?.instanceUrl ?? null,
    productPackageName: "Hartwell C&I Credit Package",
  });
  const greeting = memoGreeting({
    packageId: PACKAGE,
    trigger: "modify",
    executed,
    carried: args.carried ?? null,
    carriedSplit: args.carried ? splitOfFiled(FILED) : null,
    plan: renderPlanFor(dossier),
    hasStoredMemo: args.latest != null,
  });

  const prompts: string[] = [];
  const published: MemoDraft[] = [];
  const saved: MemoDraft[] = [];
  const deps: MemoDeps = {
    narrate: async ({ prompt, onText }) => {
      prompts.push(prompt);
      const reply = "The recommendation is to approve the increase.";
      onText?.(reply);
      return reply;
    },
    publish: async (draft) => {
      published.push(draft);
      return { memoId: draft.memoId, packageId: draft.packageId, status: "not-wired" as const, lanes: [], reason: NOT_WIRED_LINE };
    },
    save: async (draft) => {
      saved.push(draft);
      return draft;
    },
    ...args.deps,
  };

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <MemoRoom
        ctx={ctxFor(args.ctx)}
        dossier={dossier}
        changes={changes}
        greeting={greeting}
        latest={args.latest ?? null}
        deps={deps}
        onClose={() => {}}
      />,
    );
  });
  return { room: document.querySelector<HTMLElement>(".mm-room")!, prompts, published, saved };
}

/** Type into a controlled input the way React sees it: the native value setter,
 *  so React's own value tracker registers the change rather than ignoring it. */
async function type(room: HTMLElement, selector: string, value: string, enter = true) {
  const input = room.querySelector<HTMLInputElement>(selector)!;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await Promise.resolve();
  });
  if (!enter) return;
  await act(async () => {
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await Promise.resolve();
  });
}

const click = async (el: Element | null) => {
  await act(async () => {
    (el as HTMLButtonElement).click();
    await Promise.resolve();
  });
};

/* ======================================================== THE TWO DOORS IN */

describe("the door from the facility room", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("sits under the three routes and is not a fourth chip", async () => {
    const opened: string[] = [];
    const context = workroomContextFor({
      mode: "modify",
      data,
      bundle,
      accountId: HARTWELL,
      accountName: "Hartwell Precision Manufacturing LLC",
      productPackageId: PACKAGE,
    });
    const router: WorkroomRouter = {
      question: neutralAsk(),
      say: null,
      onBind: () => {},
      onRestart: () => {},
      onMemo: () => opened.push("memo"),
    };
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root!.render(
        <Workroom
          context={context}
          engine={createModifyEngine({ context, data, bundle })}
          router={router}
          reads={{ bundle, accountName: context.accountName, productPackageId: PACKAGE, generatedAt: data.meta?.generatedAt }}
          onClose={() => {}}
        />,
      );
    });
    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });

    const room = document.querySelector<HTMLElement>(".wk-room")!;
    // THE THREE ROUTES ARE STILL THREE. A memo binds no engine and stages
    // nothing, so it never took a seat in the row that picks one.
    expect(room.querySelectorAll(".wk-routes .wk-opt").length).toBe(3);

    const door = room.querySelector<HTMLElement>('.wk-memobtn[data-door="memo"]')!;
    expect(door).toBeTruthy();
    expect(text(door)).toBe("Credit memo");
    expect(text(room.querySelector(".wk-memonote"))).toContain("Nothing is staged");

    await click(door);
    expect(opened).toEqual(["memo"]);
  });
});

describe("the door from the finale", () => {
  it("opens the memo room on the version that was just filed, carrying its ledger", () => {
    act(() =>
      openMemoRoom({
        accountId: HARTWELL,
        accountName: "Hartwell Precision Manufacturing LLC",
        productPackageId: PACKAGE,
        trigger: "modify",
        carried: changesFromFiled(FILED),
        carriedSplit: splitOfFiled(FILED),
      }),
    );

    let session: ReturnType<typeof useMemoRoom> = null;
    function Probe() {
      session = useMemoRoom();
      return null;
    }
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root!.render(<Probe />));

    expect(session!.productPackageId).toBe(PACKAGE);
    expect(session!.trigger).toBe("modify");
    expect(session!.carried).toHaveLength(2);
    expect(session!.carried![0].orgId).toBe("a4Zbb0000027MaYEAU");
    expect(session!.carriedSplit).toEqual({ requested: 1, derived: 1 });
  });

  it("opens from the FAB with no ledger at all, which is a legitimate state", () => {
    act(() =>
      openMemoRoom({ accountId: HARTWELL, accountName: "Hartwell", productPackageId: PACKAGE }),
    );
    let session: ReturnType<typeof useMemoRoom> = null;
    function Probe() {
      session = useMemoRoom();
      return null;
    }
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root!.render(<Probe />));

    expect(session!.trigger).toBe("adhoc");
    expect(session!.carried).toBeNull();
    act(() => closeMemoRoom());
  });

  it("carries the filed rows without recomputing one of them", () => {
    const changes = changesFromFiled(FILED);
    expect(changes.map((c) => c.label)).toEqual(["Increase the line of credit", "Reprice to SOFR + 250"]);
    expect(changes[0].before).toEqual({ printed: "$12.0M" });
    // A row with no before was a create, and the absence is preserved.
    expect(changes[1].before).toBeUndefined();
    expect(splitOfFiled(FILED)).toEqual({ requested: 1, derived: 1 });
  });
});

/* ========================================================== THE GREETING */

describe("the greeting on the glass", () => {
  it("states what the org says was executed", () => {
    const { room } = openRoom({ rows: [trailRow(STEPS)] });
    const said = text(room.querySelector(".wk-thread"));
    expect(said).toContain("Since the last memo on");
    expect(said).toContain("a modification filed 3 Sep");
    expect(said).toContain("2 changes");
    /* The render plan stands above the pane, not in the thread (founder, 2026-09-04). */
    expect(said).not.toContain("Render plan:");
    expect(said).toContain("Draft it, or steer me first?");
  });

  it("says the honest line when the org read carries no step detail", () => {
    const { room } = openRoom({ rows: [trailRow(undefined)], carried: changesFromFiled(FILED) });
    const said = text(room.querySelector(".wk-thread"));
    expect(said).toContain("Working from what this session just filed");
  });

  it("offers Draft and Steer, and the stored memo only when there is one", () => {
    const { room } = openRoom({ rows: [trailRow(STEPS)] });
    expect([...room.querySelectorAll(".mm-chip")].map(text)).toEqual(["Draft", "Steer"]);
  });

  it("says what asked for the memo, when an instruction did", () => {
    const { room } = openRoom({
      rows: [trailRow(STEPS)],
      ctx: { source: { kind: "email", from: "cfo@hartwell.example", subject: "Increase on the line" } },
    });
    expect(text(room.querySelector(".wk-thread"))).toContain(
      'This one was asked for by email from cfo@hartwell.example: "Increase on the line".',
    );
  });

  it("says nothing about a source when a banker simply opened the room", () => {
    const { room } = openRoom({ rows: [trailRow(STEPS)] });
    expect(text(room.querySelector(".wk-thread"))).not.toContain("asked for by");
  });
});

/* ======================================================== THE READING PANE */

describe("the reading pane", () => {
  it("holds the rendered memo, with the DRAFT banner in it", () => {
    const { room } = openRoom({ rows: [trailRow(STEPS)] });
    const frame = room.querySelector<HTMLIFrameElement>(".mm-doc")!;
    const html = frame.getAttribute("srcdoc") ?? "";
    expect(html).toContain("Commercial Credit Memo");
    expect(html).toContain("DRAFT, PENDING CREDIT COMMITTEE REVIEW");
    expect(html).toContain("Hartwell Precision Manufacturing LLC");
    // And it is the memo the seam finished with, not the vendored renderer's.
    expect(html).not.toContain("Demo Commercial RM");
    expect(html).toContain("Fabian Goetzens");
  });

  it("carries one edge control per section the renderer anchored", () => {
    const dossier = buildMemoDossier({ bundle, changes: [], instanceUrl: data.meta?.instanceUrl ?? null });
    const expected = sectionsFrom(
      applyMemoOverrides(renderMemo(dossier).html, {
        rmName: "Fabian Goetzens",
        memoDate: memoDateFrom("2026-09-04T09:12:00Z"),
        memoType: MEMO_TYPE_FOR.modify,
      }),
    );

    const { room } = openRoom();
    const controls = [...room.querySelectorAll<HTMLElement>(".mm-ctl")];
    expect(controls).toHaveLength(expected.length);
    expect(controls.map((c) => c.dataset.section)).toEqual(expected.map((s) => s.id));
    // Every one of them offers the two decisions, and nothing else.
    expect(controls.every((c) => !!c.querySelector(".mm-ok") && !!c.querySelector(".mm-flag"))).toBe(true);
  });

  it("states the attestation progress and the render plan, and keeps suppressed quiet", () => {
    const { room } = openRoom({ rows: [trailRow(STEPS)] });
    const total = room.querySelectorAll(".mm-ctl").length;
    expect(text(room.querySelector(".mm-prog"))).toBe(`0 of ${total} sections attested`);
    expect(text(room.querySelector(".mm-plan"))).toMatch(/^\d+ modules on$/);

    // SUPPRESSED IS NOT A GAP: one line, collapsed, with the reasons inside it.
    const supp = room.querySelector<HTMLDetailsElement>(".mm-supp")!;
    expect(supp.open).toBe(false);
    expect(text(supp.querySelector("summary"))).toMatch(/^\d+ suppressed by the deal's flags$/);
    expect(supp.querySelectorAll("li").length).toBeGreaterThan(0);
  });
});

/* ======================================================== THE ATTESTATION */

describe("the publish door", () => {
  it("is shut, with its reason on it, until every section is approved", async () => {
    const { room } = openRoom({ rows: [trailRow(STEPS)] });
    const controls = [...room.querySelectorAll<HTMLElement>(".mm-ctl")];

    /* THE DOOR IS NOT THERE UNTIL THE WORK IS DONE (founder, 2026-09-04): no
       greyed button, one quiet line of where the attestation stands. */
    expect(room.querySelector(".mm-publish")).toBeNull();
    expect(text(room.querySelector(".mm-why"))).toBe(`${controls.length} sections still to attest`);

    // One approval is not enough, and the count says how far there is to go.
    await click(controls[0].querySelector(".mm-ok"));
    expect(room.querySelector(".mm-publish")).toBeNull();
    expect(text(room.querySelector(".mm-prog"))).toBe(`1 of ${controls.length} sections attested`);

    for (const control of [...room.querySelectorAll<HTMLElement>(".mm-ctl")].slice(1)) {
      await click(control.querySelector(".mm-ok"));
    }

    expect(room.querySelector<HTMLButtonElement>(".mm-publish")!.disabled).toBe(false);
    expect(room.querySelector(".mm-why")).toBeNull();
    expect(text(room.querySelector(".mm-prog"))).toBe(`${controls.length} of ${controls.length} sections attested`);
  });

  it("a flag is not an approval, and it keeps the banker's own words", async () => {
    const { room } = openRoom();
    const control = room.querySelector<HTMLElement>(".mm-ctl")!;
    await click(control.querySelector(".mm-flag"));

    await type(room, ".mm-note-i", "the Kokomo appraisal is stale", false);
    await click(room.querySelector(".mm-note-b"));

    const flagged = room.querySelector<HTMLElement>(".mm-ctl")!;
    expect(flagged.className).toContain("mm-flagged");
    expect(room.querySelector(".mm-publish")).toBeNull();
    expect(text(room.querySelector(".mm-prog"))).toMatch(/^0 of \d+ sections attested$/);
  });
});

/* ============================================================ THE FINALE */

describe("the finale", () => {
  it("exhales into one card and says the truth about this build's writeback", async () => {
    const { room, published, saved } = openRoom({ rows: [trailRow(STEPS)] });
    for (const control of [...room.querySelectorAll<HTMLElement>(".mm-ctl")]) {
      await click(control.querySelector(".mm-ok"));
    }
    await click(room.querySelector(".mm-publish"));

    // The seam was called with the draft the room is holding.
    expect(published).toHaveLength(1);
    expect(published[0].packageId).toBe(PACKAGE);
    expect(published[0].sections.every((s) => s.status === "approved")).toBe(true);
    expect(saved).toHaveLength(1);

    // The pane is gone and the card is alone on the stage.
    expect(room.dataset.finale).toBe("still");
    expect(room.querySelector(".mm-pane")!.getAttribute("data-finale")).toBe("still");

    const card = room.querySelector<HTMLElement>(".mm-card")!;
    expect(text(card)).toContain("Credit memo attested");
    expect(text(card)).toContain(PACKAGE);
    expect(card.querySelector(".aura")).toBeTruthy();
    expect(text(card)).toContain(NOT_WIRED_LINE);

    // One door, the room's own word for it, and one quiet line.
    const afterglow = room.querySelector<HTMLElement>(".wk-afterglow")!;
    expect(text(afterglow.querySelector(".wk-ag-close"))).toBe("Close workroom");
    expect(text(afterglow.querySelector(".wk-ag-note"))).toBe(NOT_WIRED_LINE);
    // And the composer has gone with the rest of the room.
    expect(room.querySelector<HTMLElement>(".wk-composer")!.hidden).toBe(true);
  });
});

/* ========================================================== THE NARRATIVE */

describe("drafting and steering", () => {
  it("draws the prose section by section, around figures it is forbidden to invent", async () => {
    const { room, prompts } = openRoom({ rows: [trailRow(STEPS)] });
    await click([...room.querySelectorAll(".mm-chip")].find((c) => text(c) === "Draft")!);

    expect(prompts.length).toBeGreaterThan(3);
    for (const prompt of prompts) {
      expect(prompt).toContain("EVERY FIGURE YOU USE MUST APPEAR VERBATIM IN THE FIGURES BLOCK");
      expect(prompt).toContain("FIGURES (the memo's own; use these and no others)");
      expect(prompt).toContain("Hartwell Precision Manufacturing LLC");
    }
    // Each arrival is announced in one short line, and the chips have retired.
    expect(text(room.querySelector(".wk-thread"))).toContain("written.");
    expect(room.querySelector(".mm-chip")).toBeNull();
  });

  it("stores the draft once the prose has landed, so it can be opened again", async () => {
    const { room, saved } = openRoom({ rows: [trailRow(STEPS)] });
    await click([...room.querySelectorAll(".mm-chip")].find((c) => text(c) === "Draft")!);
    expect(saved).toHaveLength(1);
    expect(saved[0].packageId).toBe(PACKAGE);
    expect(saved[0].generator).toBe("cockpit");
    expect(Object.keys(saved[0].narratives).length).toBeGreaterThan(0);
    expect(saved[0].html).toContain("Commercial Credit Memo");
  });

  it("says which half is missing when the desk is not connected", async () => {
    const { room } = openRoom({ rows: [trailRow(STEPS)], deps: { narrate: undefined } });
    await click([...room.querySelectorAll(".mm-chip")].find((c) => text(c) === "Draft")!);
    expect(text(room.querySelector(".wk-thread"))).toContain("The desk is not connected");
  });

  it("rewrites one named section and no others", async () => {
    const { room, prompts } = openRoom({ rows: [trailRow(STEPS)] });
    await type(room, ".wk-txt", "tighten the covenant paragraph");

    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain("The banker asked for this specifically: tighten the covenant paragraph");
    expect(text(room.querySelector(".wk-thread"))).toContain("Rewriting");
  });

  it("asks rather than guessing when a line names no section", async () => {
    const { room, prompts } = openRoom({ rows: [trailRow(STEPS)] });
    await type(room, ".wk-txt", "make it better");
    expect(prompts).toHaveLength(0);
    expect(text(room.querySelector(".wk-thread"))).toContain("Name the section");
  });

  it("resolves a steer against the sections the renderer actually stamped", () => {
    const sections = sectionsFrom(renderMemo(buildMemoDossier({ bundle, changes: [] })).html);
    expect(steerTarget("tighten the covenant paragraph", sections)).toBe("covenant_conditions");
    expect(steerTarget("mention the Kokomo appraisal in collateral", sections)).toBe("collateral");
    expect(steerTarget("make it better", sections)).toBeNull();
  });
});
