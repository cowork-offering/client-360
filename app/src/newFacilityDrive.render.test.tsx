// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Workroom } from "./components/workroom/Workroom";
import { clearComposed } from "./workroom/engine";
import { createModifyEngine } from "./workroom/modifyEngine";
import { workroomContextFor } from "./workroom/openWorkroom";
import { armStage } from "./components/workroom/orgArms";
import type { StagePayloads, ToolOutcome } from "./channel/writeTools";
import type { StagedOutput } from "./actions/stagedPlan";
import type { C360Data } from "./data/contract";
import live from "../../artifact/live-data.json";

/* =============================================================================
   THE DRIVE FILE, REPLAYED IN THE ROOM.

   `knowledge/MOD-NEW-LOAN-DRIVE-20260903.md` is the sequence a founder types.
   This file types it, line for line, and asserts THE PAYLOAD that reaches the
   org at the end of it.

   THE PAYLOAD IS THE POINT. Every other test in this branch proves a reader or a
   card; this one proves the thing the org actually receives: a `facilityIds`
   carrying booked members and no label, a `newFacilitiesJson` carrying the
   facility, and a covenant, a party, a pledge and a fee each carrying
   `targetLoanId: "new:1"` so the org lands them on the loan it has just written.

   NOTHING IS STUBBED EXCEPT THE DOOR. The engine is the real one, the readers
   are the real ones, and `armStage` is the real transform. What is replaced is
   the call to the org, which records what it was handed.
   ============================================================================= */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  document.body.className = "";
  clearComposed();
});

const data = live as unknown as C360Data;
const accountId = "001bb00001I7FPNAA3";

type Payload = StagePayloads["loan-modification"];

function open() {
  const bundle = data.borrowers![accountId];
  const context = workroomContextFor({
    mode: "modify",
    data,
    bundle,
    accountId,
    accountName: bundle.snapshot!.name!,
  });
  const seen: Payload[] = [];
  /* THE DOOR, RECORDED. `armStage` is the real wrapper: the sentinel arms come
     out of `fieldChangesJson` here exactly as they do on the shipping path, so
     what is captured is the payload the org would be handed. */
  const stage = armStage(async (payload: Payload): Promise<ToolOutcome<StagedOutput>> => {
    seen.push(payload);
    return { ok: false, error: { code: "CHANNEL_NONE", message: "recorded by the drive replay" } };
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <Workroom
        context={context}
        engine={createModifyEngine({
          context,
          data,
          bundle,
          /* THE DOOR IS OPEN AND RECORDED. `available` is what the room asks
             before it builds a plan at all; in jsdom there is no connector, so
             the drive says the door is there and answers through it. */
          deps: { stage, available: () => true, newKey: () => "DRIVE-REPLAY-KEY" },
        })}
        reads={{
          bundle,
          accountName: bundle.snapshot!.name!,
          productPackageId: context.productPackageId,
          generatedAt: "2026-09-03T08:00:00.000Z",
        }}
        onClose={() => {}}
      />,
    );
  });
  return { room: document.querySelector<HTMLElement>(".wk-room")!, seen };
}

const settle = async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
};

async function typeInto(room: HTMLElement, text: string) {
  const input = room.querySelector<HTMLInputElement>(".wk-txt")!;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() => room.querySelector(".wk-send")!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  for (let i = 0; i < 8; i += 1) await settle();
}

const buttons = () => [...document.body.querySelectorAll("button")];
const byText = (re: RegExp) => buttons().find((b) => re.test(b.textContent ?? ""));
const click = async (el: Element | undefined) => {
  act(() => el!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  for (let i = 0; i < 8; i += 1) await settle();
};
const chips = (room: HTMLElement) => [...room.querySelectorAll(".wk-chip")];
const said = (room: HTMLElement) => [...room.querySelectorAll(".wk-msg")].map((m) => m.textContent ?? "").join(" ");
const rail = (room: HTMLElement) => room.textContent ?? "";

/** THE ROOM TAKES ONE DECISION AT A TIME. Every staged card holds Confirm until
 *  the banker presses it, and the next line is refused while one is open. The
 *  drive presses it, exactly as a founder does. */
const confirmOpen = async () => {
  for (let i = 0; i < 10; i += 1) {
    /* AND THE ROOM'S OWN CHECKS ARE ANSWERED. Adding $3MM to the package thins
       the collateral cover, and the room says so and holds an Acknowledge. That
       is a real gate a founder presses, not a test artefact. */
    const btn = buttons().find((b) => {
      const t = (b.textContent ?? "").trim();
      return t === "Confirm" || t === "Acknowledge";
    });
    if (!btn) return;
    await click(btn);
  }
};

/** The drive file's first three lines: the facility, the amortisation, the date. */
async function stageTheFacility(room: HTMLElement) {
  await typeInto(room, "add a new 3M equipment loan with a 60 month term for CNC line expansion");
  await click(byText(/^Same as the term \(60 months\)$/));
  await click(byText(/^1 October 2026$/));
  await confirmOpen();
}

describe("the drive file, replayed", () => {
  it("stages the facility from one sentence and two chips, and SAYS the purpose handoff", async () => {
    const { room } = open();
    await settle();

    await typeInto(room, "add a new 3M equipment loan with a 60 month term for CNC line expansion");
    expect(chips(room)).toHaveLength(0);
    expect(said(room)).toContain("amortisation term");

    await click(byText(/^Same as the term \(60 months\)$/));
    expect(chips(room)).toHaveLength(0);
    expect(said(room)).toContain("first payment date");

    await click(byText(/^1 October 2026$/));
    expect(chips(room)).toHaveLength(1);
    expect(said(room)).toContain("$3MM Equipment goes onto the new version");
    /* THE PURPOSE IS SAID, not silently dropped. It lands on the Loan Detail
       nCino creates after the filing, and a room that carried it on the wire and
       said nothing about where it goes reads as a field that was filed. */
    expect(said(room)).toContain("Purpose goes on the Loan Detail after filing, handed off");
    expect(rail(room)).toContain("Purpose goes on the Loan Detail after filing, handed off");
  });

  it("puts a party on the facility it is creating, by the founder's own words", async () => {
    const { room } = open();
    await settle();
    await stageTheFacility(room);

    await typeInto(room, "add Elena Hartwell as limited guarantor on the new equipment loan");
    expect(chips(room)).toHaveLength(2);
    expect(rail(room)).toContain("Elena Hartwell");
    // The rail shows it under the facility this plan is creating, not under a
    // booked equipment loan that shares the product word.
    expect(rail(room)).toContain("$3MM Equipment");
  });

  it("puts a covenant on it from \"the new loan\", with no facility named twice", async () => {
    const { room } = open();
    await settle();
    await stageTheFacility(room);

    await typeInto(room, "add a debt service coverage of borrower covenant of 1.30 on the new loan");
    /* THE SCOPE SETTLED ON THE FACILITY THIS PLAN IS CREATING, and the room then
       does what it does for any covenant the book already carries at
       relationship level: it names the three instruments. That is the existing
       grammar reaching a member that did not exist before this branch. */
    expect(said(room)).toContain("it is NOT associated to $3MM Equipment");
    await click(byText(/^Create a new one on this facility$/));
    await confirmOpen();
    expect(chips(room).length).toBeGreaterThanOrEqual(2);
    expect(rail(room)).toContain("Debt Service Coverage of Borrower");
  });

  it("pledges an asset the borrower already owns TO the facility it is creating", async () => {
    const { room } = open();
    await settle();
    await stageTheFacility(room);

    await typeInto(room, "pledge the fort wayne inventory to the new loan");
    await confirmOpen();
    expect(chips(room).length).toBeGreaterThanOrEqual(2);
    expect(rail(room)).toContain("$3MM Equipment");
    // The asset and the borrower's ownership of it are relationship records: what
    // this authors is the pledge onto a loan that does not exist yet.
    expect(said(room)).toContain("$3MM Equipment");
  });

  it("REFUSES a removal on a facility it is creating, by name", async () => {
    const { room } = open();
    await settle();
    await stageTheFacility(room);

    await typeInto(room, "remove the accounts receivable covenant from the new equipment loan");
    expect(said(room)).toContain("is a facility this plan is CREATING");
    expect(said(room)).toContain("everything on it is an ADD");
    expect(said(room)).toContain("nothing has come off the manifest");
    // And the manifest is exactly where it was left.
    expect(chips(room)).toHaveLength(1);
  });

  it("carries the whole sequence onto ONE payload the org can read", async () => {
    const { room, seen } = open();
    await settle();

    await stageTheFacility(room);
    await typeInto(room, "add Elena Hartwell as limited guarantor on the new equipment loan");
    await confirmOpen();
    await typeInto(room, "add a debt service coverage of borrower covenant of 1.30 on the new loan");
    await click(byText(/^Create a new one on this facility$/));
    await confirmOpen();
    await typeInto(room, "pledge the fort wayne inventory to the new loan");
    await confirmOpen();
    await typeInto(room, "add a 1% origination fee on the new equipment loan");
    await confirmOpen();
    await typeInto(room, "increase the 15M line of credit to 20M");
    await confirmOpen();
    /* AND THE BOOKED CHANGE GETS THE PRICING GATE IT HAS ALWAYS GOT. Moving the
       $15M line's commitment is what opens it, and "leave pricing for later" is
       a real answer: it is recorded on the plan and the room says what the
       consequence is. */
    await click(byText(/^Leave pricing for later$/));
    await confirmOpen();

    await click(room.querySelector('.wk-propose') ?? undefined);
    expect(seen).toHaveLength(1);
    const payload = seen[0];

    /* THE SELECTION IS BOOKED MEMBERS ONLY. `wirePayload` unions every delta's
       target, so the label would otherwise be in here and the org validates
       every entry as a booked facility on the package. */
    expect(payload.facilityIds).toBeDefined();
    expect(payload.facilityIds!.some((id) => /^new:/.test(id))).toBe(false);
    expect(payload.facilityIds).toContain("a4Zbb0000027MaYEAU");

    // THE FACILITY, on its own arm.
    expect(JSON.parse(String(payload.newFacilitiesJson))).toEqual([
      {
        label: "new:1",
        product: "Equipment",
        amount: 3_000_000,
        termMonths: 60,
        purpose: "business_expansion",
        amortizedTermMonths: 60,
        firstPaymentDate: "2026-10-01",
      },
    ]);

    // AND EVERY ARM AIMED AT IT NAMES IT BY LABEL.
    const parties = JSON.parse(String(payload.involvementChangesJson)) as Array<Record<string, unknown>>;
    expect(parties).toHaveLength(1);
    expect(parties[0]).toMatchObject({ op: "add", role: "Limited Guarantor", targetLoanId: "new:1" });
    expect(String(parties[0].accountName)).toContain("Elena Hartwell");

    const covenants = JSON.parse(String(payload.covenantAddsJson)) as Array<Record<string, unknown>>;
    expect(covenants).toHaveLength(1);
    expect(covenants[0]).toMatchObject({
      typeName: "Debt Service Coverage of Borrower",
      threshold: 1.3,
      targetLoanId: "new:1",
    });

    const pledges = JSON.parse(String(payload.pledgeAddsJson)) as Array<Record<string, unknown>>;
    expect(pledges).toHaveLength(1);
    expect(pledges[0]).toMatchObject({ targetLoanId: "new:1" });
    // An asset the borrower already owns travels as the org's own record id, and
    // never as a newCollateral the room would have authored from a description.
    expect(typeof pledges[0].collateralId).toBe("string");
    expect(pledges[0].newCollateral).toBeUndefined();

    const fees = JSON.parse(String(payload.feeAddsJson)) as Array<Record<string, unknown>>;
    expect(fees).toHaveLength(1);
    expect(fees[0]).toMatchObject({
      feeType: "Loan Origination",
      calculationType: "Percentage",
      percentage: 1,
      targetLoanId: "new:1",
    });
    // A percentage fee sends NO money figure: the org derives it.
    expect(fees[0].amount).toBeUndefined();

    // THE BOOKED CHANGE RIDES THE SAME PLAN, keyed to the booked member.
    const scalars = JSON.parse(String(payload.scalarChangesJson ?? "[]")) as Array<Record<string, unknown>>;
    const flat = payload.requestedAmount;
    expect(scalars.length > 0 || flat === 20_000_000).toBe(true);
    if (scalars.length) {
      expect(scalars[0]).toMatchObject({ key: "requestedAmount", value: 20_000_000, targetLoanId: "a4Zbb0000027MaYEAU" });
    }

    // AND THE SENTINEL NEVER REACHES THE ORG.
    expect(String(payload.fieldChangesJson ?? "")).not.toContain("__c360OrgArm");
  });
});
