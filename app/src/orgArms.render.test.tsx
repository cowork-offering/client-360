// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Workroom } from "./components/workroom/Workroom";
import { clearComposed } from "./workroom/engine";
import { createModifyEngine } from "./workroom/modifyEngine";
import { createRenewEngine } from "./workroom/renewEngine";
import { armStage } from "./components/workroom/orgArms";
import { resetCatalog } from "./channel/catalog";
import { workroomContextFor } from "./workroom/openWorkroom";
import type { BrainEnvelope, BrainReply } from "./channel/brainLane";
import type { C360Data } from "./data/contract";
import type { StagedOutput } from "./actions/stagedPlan";
import type { StagePayloads, ToolOutcome } from "./channel/writeTools";
import type { WorkroomMode } from "./workroom/types";
import live from "../../artifact/live-data.json";

/* =============================================================================
   THE ORG ARMS, IN THE ROOM.

   The founder's own drive lines, against the book the artifact ships with.

   ONE THING THE BOOK DECIDES FOR US. Hartwell's Minimum Liquidity covenant
   carries NO loan junction on this read (`attachedLoans: []`), so drive line 6
   is the honest refusal rather than the exclusion: there is nothing on that
   facility for the new version to leave behind, and the room says where the
   covenant actually is. The covenant that IS on the $15M line of credit is the
   catalog entry called `Accounts Receivable`, which is also the name of an asset
   pledged to the same facility (the N1/P4 collision), so the two lines below
   are the same words with one noun changed, and they reach different arms.

   NOTHING HERE NEEDS A BRIDGE. The last describe drives the same lines with a
   desk attached and proves the desk is never asked: channel-none parity is a
   contract, not a fallback.
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
  resetCatalog();
  delete (window as unknown as { claude?: unknown }).claude;
  vi.restoreAllMocks();
});

const data = live as unknown as C360Data;
const accountId = "001bb00001I7FPNAA3";

type Payload = StagePayloads["loan-modification"];

/** A plan the org would have returned, with whatever steps the test needs. */
const plan = (steps: string[]): StagedOutput => ({
  stagingId: "a3Sbb0000001STGAA2",
  decisionToken: "tok-0001",
  planHash: "hash-9999",
  summary: "Roll the package to a new version",
  steps: steps.map((id) => ({ id, type: "write" as const, label: "" })),
  warnings: [],
  suggestions: [],
});

function open(
  args: {
    brain?: (e: BrainEnvelope) => Promise<BrainReply>;
    mode?: WorkroomMode;
    stage?: (payload: Payload) => Promise<ToolOutcome<StagedOutput>>;
    /** Present only where a test has to prove the token was NEVER spent. */
    execute?: (approval: unknown) => Promise<ToolOutcome<unknown>>;
  } = {},
) {
  const bundle = data.borrowers![accountId];
  const mode = args.mode ?? "modify";
  const context = workroomContextFor({ mode, data, bundle, accountId, accountName: bundle.snapshot!.name! });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <Workroom
        context={context}
        engine={
          mode === "renew"
            ? createRenewEngine({ context, data, bundle })
            : createModifyEngine({
                context,
                data,
                bundle,
                deps: args.stage
                  ? {
                      stage: armStage(args.stage),
                      available: () => true,
                      ...(args.execute ? { execute: args.execute as never } : {}),
                    }
                  : undefined,
              })
        }
        reads={{ bundle, accountName: bundle.snapshot!.name!, productPackageId: context.productPackageId }}
        brain={args.brain}
        onClose={() => {}}
      />,
    );
  });
  return document.querySelector<HTMLElement>(".wk-room")!;
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
  for (let i = 0; i < 6; i += 1) await settle();
}

const buttons = () => [...document.body.querySelectorAll("button")];
const byText = (re: RegExp) => buttons().find((b) => re.test(b.textContent ?? ""));
const click = async (el: Element | undefined) => {
  act(() => el!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  for (let i = 0; i < 6; i += 1) await settle();
};
const chips = (room: HTMLElement) => [...room.querySelectorAll(".wk-chip")];
const said = (room: HTMLElement) => [...room.querySelectorAll(".wk-msg")].map((m) => m.textContent ?? "").join(" ");
/** The last thing the room said, for an assertion about a WORD it must not use. */
const lastSaid = (room: HTMLElement) => {
  const all = [...room.querySelectorAll(".wk-msg")];
  return all[all.length - 1]?.textContent ?? "";
};
const rail = (room: HTMLElement) => [...room.querySelectorAll(".wk-ent")].map((e) => e.textContent ?? "").join(" ");

const NEVER: BrainReply = { type: "clarify", text: "the desk should never have been asked this" };

describe("a covenant carry exclusion on a modification (P2)", () => {
  it("stages the exclusion for a covenant the facility actually carries", async () => {
    const room = open();
    await settle();
    await typeInto(room, "remove the accounts receivable covenant from the 15M line of credit");

    expect(chips(room)).toHaveLength(1);
    const chip = chips(room)[0].textContent ?? "";
    expect(chip).toContain("Accounts Receivable");
    expect(chip).toContain("not carried onto the new version");
    expect(said(room)).toContain("will not carry onto the new version");
    expect(said(room)).toContain("the booked loan keeps it");
    expect(said(room)).toContain("Nothing is deleted");
  });

  it("does not answer it with the covenant DETACH fence any more", async () => {
    const room = open();
    await settle();
    await typeInto(room, "remove the accounts receivable covenant from the 15M line of credit");
    expect(said(room)).not.toContain("covenant DETACH");
    expect(said(room)).not.toContain("this room does not file one");
  });

  it("puts it on the manifest as an exclusion, and the confirm says the booked loan is untouched", async () => {
    const room = open();
    await settle();
    await typeInto(room, "remove the accounts receivable covenant from the 15M line of credit");
    await click(byText(/^Confirm$/));

    expect(rail(room)).toContain("Accounts Receivable");
    expect(rail(room)).toContain("not carried onto the new version");
    expect(said(room)).toContain("The booked loan keeps it");
    expect(said(room)).toContain("the covenant record itself is not touched");
    expect(said(room)).not.toContain("staged on the clone");
  });

  it("reads the plan back as an exclusion, never as a delete", async () => {
    const room = open();
    await settle();
    await typeInto(room, "remove the accounts receivable covenant from the 15M line of credit");
    await click(byText(/^Confirm$/));
    await typeInto(room, "what is on the plan");

    expect(said(room)).toMatch(/The manifest holds 1: Accounts Receivable on [^,]+, on the booked facility[^,]*, and carried onto the clone today to not carried onto the new version/);
  });

  it("REFUSES a covenant the facility does not carry, and says where it is (drive line 6)", async () => {
    const room = open();
    await settle();
    await typeInto(room, "remove the Minimum Liquidity covenant from the 15M line of credit");

    expect(chips(room)).toHaveLength(0);
    expect(said(room)).toContain("Minimum Liquidity is not attached to the");
    expect(said(room)).toContain("relationship level, with no loan junction on it at all");
    expect(said(room)).toContain("nothing has come off the manifest");
  });

  it("leaves the banker's own staged entries alone when a removal refuses (E1 holds)", async () => {
    const room = open();
    await settle();
    await typeInto(room, "increase the 15M line of credit to 20M");
    await click(byText(/^Confirm$/));
    await typeInto(room, "remove the Minimum Liquidity covenant from the 15M line of credit");

    expect(rail(room)).toContain("Commitment");
  });

  it("keeps the honest fence on a renewal: that tool does not take the arm", async () => {
    const room = open({ mode: "renew" });
    await settle();
    await typeInto(room, "remove the accounts receivable covenant from the 15M line of credit");

    expect(chips(room)).toHaveLength(1);
    expect(chips(room)[0].textContent).toContain("Detach Accounts Receivable");
  });
});

describe("a pledge carry exclusion on a modification (P2 + P4)", () => {
  it("stages the exclusion for an asset the facility actually carries (drive line 9)", async () => {
    const room = open();
    await settle();
    await typeInto(room, "remove the accounts receivable pledge from the 15M line of credit");

    expect(chips(room)).toHaveLength(1);
    const chip = chips(room)[0].textContent ?? "";
    expect(chip).toContain("All present and future accounts receivable");
    expect(chip).toContain("not carried onto the new version");
    expect(said(room)).toContain("the booked loan keeps the pledge");
  });

  it("speaks collateral, not covenants, though the catalog carries a test of the same name (N1)", async () => {
    const room = open();
    await settle();
    await typeInto(room, "remove the accounts receivable pledge from the 15M line of credit");

    expect(lastSaid(room)).not.toMatch(/covenant/i);
    expect(lastSaid(room)).toContain("relationship records");
  });

  it("is the same words with one noun changed, and reaches the other arm", async () => {
    const room = open();
    await settle();
    await typeInto(room, "remove the accounts receivable covenant from the 15M line of credit");
    await click(byText(/^Confirm$/));
    await typeInto(room, "remove the accounts receivable pledge from the 15M line of credit");

    const staged = chips(room).map((c) => c.textContent ?? "");
    expect(staged).toHaveLength(2);
    expect(staged[0]).toContain("Covenant carry exclusion");
    expect(staged[1]).toContain("Pledge carry exclusion");
  });

  it("the confirm says the asset and the ownership junction are not touched", async () => {
    const room = open();
    await settle();
    await typeInto(room, "remove the accounts receivable pledge from the 15M line of credit");
    await click(byText(/^Confirm$/));

    expect(said(room)).toContain("The booked facility keeps the pledge exactly as it holds it today");
    expect(said(room)).toContain("nothing is deleted anywhere");
    expect(rail(room)).toContain("not carried onto the new version");
  });
});

describe("associating an existing covenant, in the room (P1)", () => {
  it("stages the junction card and confirms it onto the manifest", async () => {
    const room = open();
    await settle();
    await typeInto(room, "add a debt service coverage of borrower covenant of 1.25x on the 8M equipment loan");
    await click(byText(/^Associate the existing Debt Service Coverage of Borrower to this facility$/));
    await click(byText(/^Confirm$/));

    expect(rail(room)).toContain("Debt Service Coverage of Borrower");
    expect(rail(room)).toContain("associated to this facility");
    expect(said(room)).toContain("is associated to the");
    expect(said(room)).toContain("The covenant record itself is not touched");
    expect(said(room)).toContain("what this authors is the junction alone");
  });

  it("keeps the handoff on a renewal, and names the route that carries the arm", async () => {
    const room = open({ mode: "renew" });
    await settle();
    await typeInto(room, "add a debt service coverage of borrower covenant of 1.25x on the 8M equipment loan");
    await click(byText(/^Associate the existing Debt Service Coverage of Borrower to this facility$/));

    expect(room.textContent).toContain("rides the modification alone");
    expect(room.textContent).toContain("Run it as a modification");
    expect(room.textContent).not.toContain("being built on the org side");
  });
});

describe("channel-none parity", () => {
  it("stages the same exclusion with a desk attached, and never asks it", async () => {
    const asked: BrainEnvelope[] = [];
    const room = open({
      brain: async (e) => {
        asked.push(e);
        return NEVER;
      },
    });
    await settle();
    await typeInto(room, "remove the accounts receivable covenant from the 15M line of credit");

    expect(chips(room)).toHaveLength(1);
    expect(said(room)).toContain("will not carry onto the new version");
    expect(asked.filter((e) => e.line.startsWith("remove the accounts receivable"))).toHaveLength(0);
  });
});

/* ======================================================= the write-back (item 4) */

describe("what the plan says back about an arm", () => {
  it("names the arms on the card the banker signs, and says nothing is deleted", async () => {
    const sent: Payload[] = [];
    const room = open({
      stage: async (payload) => {
        sent.push(payload);
        return { ok: true as const, result: plan(["covenant_exclusion_0", "covenant_exclusion_verify_0"]) };
      },
    });
    await settle();
    await typeInto(room, "remove the accounts receivable covenant from the 15M line of credit");
    await click(byText(/^Confirm$/));
    await click(room.querySelector(".wk-propose")!);

    // The arm reached the wire as the org's own key, and the sentinel did not.
    expect(JSON.parse(sent[0].covenantExclusionsJson!)).toHaveLength(1);
    expect(sent[0].fieldChangesJson).toBeUndefined();
    expect(room.textContent).toContain("1 covenant left off the new version");
    expect(room.textContent).toContain("Nothing is deleted");
    // AND WHAT THE PLAN SAYS IT WILL DO ABOUT IT, in the org's own words where
    // it sent them and in banker language where it did not.
    expect(room.querySelector(".wk-armsteps")?.textContent).toContain("Carry the facility's covenants without the named one");
  });

  it("says so where the plan came back WITHOUT a step for a staged arm", async () => {
    const room = open({ stage: async () => ({ ok: true as const, result: plan(["apply_changes_0"]) }) });
    await settle();
    await typeInto(room, "remove the accounts receivable covenant from the 15M line of credit");
    await click(byText(/^Confirm$/));
    await click(room.querySelector(".wk-propose")!);

    expect(said(room)).toContain("The plan came back without a step for Accounts Receivable on");
    expect(said(room)).toContain("I will not tell you it is going to happen");
  });

  /* AND SAYING IT IS NOT ENOUGH: IT IS A GATE (2026-09-02, second pass).

     The sentence went up while `setFlow` had already stored the staging with
     its decision token, so the ink button stayed live and a banker who read the
     line and pressed it anyway executed a plan that does not carry their
     exclusion. The plan's own steps close the approval now. */
  it("closes the approval where the plan carries no step for a staged arm", async () => {
    const room = open({ stage: async () => ({ ok: true as const, result: plan(["apply_changes_0"]) }) });
    await settle();
    await typeInto(room, "remove the accounts receivable covenant from the 15M line of credit");
    await click(byText(/^Confirm$/));
    await click(room.querySelector(".wk-propose")!);

    const approve = document.querySelector<HTMLButtonElement>(".wk-approve")!;
    expect(approve.disabled).toBe(true);
    expect(approve.textContent).toBe("Approval closed");
    // The card says why, and offers the way out.
    expect(room.querySelector(".wk-armheld")?.textContent).toContain("This plan carries no step for Accounts Receivable on");
    expect(byText(/^Discard the plan$/)).toBeTruthy();
  });

  it("spends no token on it: the approval is refused, not merely discouraged", async () => {
    const executed: unknown[] = [];
    const room = open({
      stage: async () => ({ ok: true as const, result: plan(["apply_changes_0"]) }),
      execute: async (approval) => {
        executed.push(approval);
        return { ok: true as const, result: { outcome: "filed", steps: [] } as never };
      },
    });
    await settle();
    await typeInto(room, "remove the accounts receivable covenant from the 15M line of credit");
    await click(byText(/^Confirm$/));
    await click(room.querySelector(".wk-propose")!);
    await click(document.querySelector<HTMLButtonElement>(".wk-approve")!);

    // NOTHING REACHED THE ORG and the room never moved to the filed scene. The
    // same list is checked inside `execute` itself, so the refusal does not
    // depend on a rendered control being the only thing in the way.
    expect(executed).toHaveLength(0);
    expect(room.querySelector(".wk-dossier")).toBeNull();
    expect(document.querySelector<HTMLButtonElement>(".wk-approve")!.disabled).toBe(true);
  });

  it("keeps the approval OPEN where every staged arm has its step", async () => {
    const room = open({
      stage: async () => ({ ok: true as const, result: plan(["covenant_exclusion_0", "covenant_exclusion_verify_0"]) }),
    });
    await settle();
    await typeInto(room, "remove the accounts receivable covenant from the 15M line of credit");
    await click(byText(/^Confirm$/));
    await click(room.querySelector(".wk-propose")!);

    expect(document.querySelector<HTMLButtonElement>(".wk-approve")!.disabled).toBe(false);
    expect(room.querySelector(".wk-armheld")).toBeNull();
    expect(byText(/^Cancel$/)).toBeTruthy();
  });

  it("shows the ORG's own refusal, attached to the entry, with the rest reported honestly", async () => {
    /* `design/proposals/org-arms-addendum.md` verbatim. It names the RECORD and
       no covenant type at all, which is why keying the match on the entry's
       title found nothing: the room's own id is the only thing both sides hold. */
    const org =
      "Covenant a3Bbb000000S0bNEAS is not attached to Line of Credit, so there is nothing for the new version to leave behind.";
    const room = open({
      stage: async () => ({ ok: false as const, error: { code: "tool_error", message: org, retryable: false } as never }),
    });
    await settle();
    await typeInto(room, "remove the accounts receivable covenant from the 15M line of credit");
    await click(byText(/^Confirm$/));
    await click(room.querySelector(".wk-propose")!);

    expect(said(room)).toContain("is not attached to Line of Credit");
    expect(said(room)).toContain("That is Accounts Receivable on");
    expect(said(room)).toContain("Staging writes nothing");
  });
});

/* ======================================== the chips come from the org (item 5) */

const CATALOG_FIELDS = [
  {
    objectName: "LLC_BI__Legal_Entities__c",
    fieldName: "LLC_BI__Borrower_Type__c",
    source: "picklist",
    values: ["Borrower", "Guarantor", "Limited Guarantor", "Co-Borrower", "Related Entity", "Grantor", "Contractor"].map(
      (v) => ({ label: v, value: v }),
    ),
    acceptedValues: ["Borrower", "Co-Borrower", "Guarantor", "Limited Guarantor", "Related Entity"],
  },
  {
    objectName: "LLC_BI__Collateral__c",
    fieldName: "LLC_BI__Collateral_Type__c",
    source: "catalog",
    /* THE ORG'S OWN SHAPE (2026-09-02). The Real Estate family is eleven names
       on twelve records, which is what the org's staging refusal listed back at
       the founder when the room sent it the WORD. */
    values: [
      "Equipment",
      "Real Estate-1-4 Family",
      "Real Estate-Construction",
      "Real Estate-Farm Land",
      "Real Estate-Land",
      "Real Estate-Lot",
      "Real Estate-Mobile Home",
      "Real Estate-Multi-Family",
      "Real Estate-Office",
      "Real Estate-Other RE",
      "Real Estate-Retail",
      "Real Estate-Warehouse",
      "Inventory",
      "Accounts Receivable",
      "Vehicle",
      "Cash",
      "Securities",
      "Aircraft",
      "Marine Vessel",
      "Livestock",
    ].map((label, i) => ({ label, value: `a3Kbb00000${String(i).padStart(2, "0")}AAA` })),
    acceptedValues: [
      "Equipment",
      "Real Estate-1-4 Family",
      "Real Estate-Construction",
      "Real Estate-Farm Land",
      "Real Estate-Land",
      "Real Estate-Lot",
      "Real Estate-Mobile Home",
      "Real Estate-Multi-Family",
      "Real Estate-Office",
      "Real Estate-Other RE",
      "Real Estate-Retail",
      "Real Estate-Warehouse",
      "Inventory",
      "Accounts Receivable",
      "Vehicle",
      "Cash",
      "Securities",
      "Aircraft",
      "Marine Vessel",
    ],
  },
  {
    objectName: "LLC_BI__Covenant2__c",
    fieldName: "LLC_BI__Covenant_Type__c",
    source: "catalog",
    values: ["Leverage", "Minimum Liquidity", "Net Worth", "Fixed Charge Coverage", "Collateral Insurance"].map(
      (label, i) => ({ label, value: `a3Bbb000000${i}AAA` }),
    ),
    acceptedValues: [],
  },
];

function stubCatalog(fields: unknown = CATALOG_FIELDS) {
  (window as unknown as { claude?: unknown }).claude = {
    mcp: {
      // `callTool` in mcp.ts reads `result.payload`, so the stub returns the
      // platform envelope rather than the invocable one directly.
      callTool: vi.fn(async () => ({ payload: { content: [{ isSuccess: true, outputValues: { fields, note: "read live" } }] } })),
    },
  };
}

describe("the create chips come from the org, not from a mirror", () => {
  it("names Grantor and Contractor as refused rather than hiding them", async () => {
    stubCatalog();
    const room = open();
    await settle();
    await typeInto(room, "add Elena Hartwell to the 8M equipment loan");

    expect(said(room)).toContain("Grantor and Contractor are on the object too");
    expect(said(room)).toContain("not borrowing structure");
    expect(byText(/^Grantor$/)).toBeUndefined();
    expect(byText(/^Limited Guarantor$/)).toBeTruthy();
  });

  it("draws collateral kinds from the org's catalog and names the count it did not show", async () => {
    stubCatalog();
    const room = open();
    await settle();
    await typeInto(room, "pledge some collateral to the construction loan");
    await click(byText(/^A new asset$/));

    expect(said(room)).toContain("The catalog carries 19 types the bank will lend against");
    expect(said(room)).toContain("in 9 families");
    expect(byText(/^Aircraft$/)).toBeTruthy();
    // ONE CHIP PER FAMILY. The eleven Real Estate names are the family's own
    // second question, not eleven chips in front of the other eight families.
    expect(byText(/^Real Estate$/)).toBeTruthy();
    expect(byText(/^Real Estate-Warehouse$/)).toBeUndefined();
    // The tenth carries no advance rate of its own and the write path refuses
    // it, so it is never a chip.
    expect(byText(/^Livestock$/)).toBeUndefined();
  });

  it("keeps covenant chips to the nine, and names the rest as present and not fileable", async () => {
    stubCatalog();
    const room = open();
    await settle();
    await typeInto(room, "add a covenant to the 8M equipment loan");

    expect(said(room)).toContain("more types beyond these");
    expect(said(room)).toContain("this room cannot settle one from a name");
    expect(byText(/^Collateral Insurance$/)).toBeUndefined();
  });
});

describe("channel-none: the mirror stands", () => {
  it("offers the shell's own five roles, and names the same two as refused", async () => {
    const room = open();
    await settle();
    await typeInto(room, "add Elena Hartwell to the 8M equipment loan");

    expect(said(room)).toContain("What role does Elena Hartwell take?");
    // PARITY, not a degraded mode: the mirror carries the same five and the
    // same two refusals, so the sentence a banker reads does not move.
    expect(said(room)).toContain("Grantor and Contractor are on the object too");
    expect(byText(/^Limited Guarantor$/)).toBeTruthy();
    expect(byText(/^Grantor$/)).toBeUndefined();
  });

  it("offers the shell's own collateral kinds, and claims no org count", async () => {
    const room = open();
    await settle();
    await typeInto(room, "pledge some collateral to the construction loan");
    await click(byText(/^A new asset$/));

    /* E6: the mirror carries the ORG's own family names now, so it has a count
       of its own to state. What it must never do is claim the count is the
       CATALOG's, which is the only thing a room with no bridge cannot know. */
    expect(said(room)).toContain("I resolve a name against");
    expect(said(room)).toContain("families");
    expect(said(room)).not.toContain("types the bank will lend against");
    expect(byText(/^Real Estate$/)).toBeTruthy();
    expect(byText(/^Real Estate-Warehouse$/)).toBeUndefined();
  });
});
