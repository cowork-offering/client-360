// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Workroom } from "./components/workroom/Workroom";
import { clearComposed } from "./workroom/engine";
import { createModifyEngine } from "./workroom/modifyEngine";
import { workroomContextFor } from "./workroom/openWorkroom";
import type { C360Data } from "./data/contract";
import live from "../../artifact/live-data.json";

/* =============================================================================
   THE FOUR FIELDS nCINO PRICES ON, IN THE ROOM (founder, 2026-09-02).

   nCino hides the rate and the payment stream on a loan until the amount, the
   term, the amortised term and the first payment date are all set. On Hartwell
   the last two are blank, so a modification that moves the $15M line to $20M
   leaves a version nobody can price in the nCino UI.

   The whole gate is deterministic: no brain is attached to any test here, and
   the questions, the chips and the payload are the room's own.
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
/** The artifact's own instant. Every month the room offers is computed from it. */
const GENERATED_AT = "2026-07-25T21:04:49Z";

function open(): HTMLElement {
  const bundle = data.borrowers![accountId];
  const context = workroomContextFor({ mode: "modify", data, bundle, accountId, accountName: bundle.snapshot!.name! });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <Workroom
        context={context}
        engine={createModifyEngine({ context, data, bundle })}
        reads={{
          bundle,
          accountName: bundle.snapshot!.name!,
          productPackageId: context.productPackageId,
          generatedAt: GENERATED_AT,
        }}
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
const said = (room: HTMLElement) => [...room.querySelectorAll(".wk-msg")].map((m) => m.textContent ?? "").join(" ");
const rail = (room: HTMLElement) => room.querySelector(".wk-lane")?.textContent ?? room.textContent ?? "";

/** Move the $15M line to $20M and confirm it. */
async function moveTheLine(room: HTMLElement) {
  await typeInto(room, "take the 15M line of credit to $20,000,000");
  await click(byText(/^Confirm$/));
}

describe("a change to the amount asks for the two fields nCino prices on", () => {
  it("asks the amortisation term in the same breath as the confirm, and says why", async () => {
    const room = open();
    await settle();
    await moveTheLine(room);

    expect(said(room)).toContain("What is the amortisation term on the");
    expect(said(room)).toContain(
      "nCino needs the amount, the term, the amortised term and the first payment date before it will price this loan.",
    );
    // The read carries no amortisation and the org holds it blank, so the room
    // says both rather than offering a default.
    expect(said(room)).toContain("This read carries no amortisation for it");
    expect(byText(/^240 months$/)).toBeTruthy();
    expect(byText(/^300 months$/)).toBeTruthy();
    expect(byText(/^Another figure$/)).toBeTruthy();
    expect(byText(/^Leave pricing for later$/)).toBeTruthy();
  });

  it("stages the answer as a field change on that facility, then asks the date", async () => {
    const room = open();
    await settle();
    await moveTheLine(room);
    await click(byText(/^240 months$/));

    expect(said(room)).toContain("The amortisation term on the $15.0MM Line of Credit goes onto the plan at 240 months");
    await click(byText(/^Confirm$/));
    expect(rail(room)).toContain("Amortisation term (months)");

    // AND THE SECOND QUESTION, with the months computed from the artifact's own
    // instant rather than from a clock.
    expect(said(room)).toContain("What is the first payment date on the");
    expect(byText(/^1 August 2026$/)).toBeTruthy();
    expect(byText(/^1 September 2026$/)).toBeTruthy();
  });

  it("carries both fields onto the manifest and asks nothing more", async () => {
    const room = open();
    await settle();
    await moveTheLine(room);
    await click(byText(/^240 months$/));
    await click(byText(/^Confirm$/));
    await click(byText(/^1 August 2026$/));
    await click(byText(/^Confirm$/));

    expect(rail(room)).toContain("Amortisation term (months)");
    expect(rail(room)).toContain("First payment date");
    // Three entries on one facility, and the room stops asking.
    expect(said(room)).not.toContain("What is the first payment date on the $8.0MM Equipment");
    const asks = said(room).match(/What is the first payment date/g) ?? [];
    expect(asks).toHaveLength(1);
  });

  it("reads the plan back with both fields under that facility", async () => {
    const room = open();
    await settle();
    await moveTheLine(room);
    await click(byText(/^240 months$/));
    await click(byText(/^Confirm$/));
    await click(byText(/^1 August 2026$/));
    await click(byText(/^Confirm$/));
    // The commitment change tripped a coverage check; settling it is the one
    // decision the room is waiting on before it takes a new line.
    await click(byText(/^Acknowledge$/));
    await typeInto(room, "what is on the plan");

    expect(room.textContent).toContain("The manifest holds 3");
    expect(room.textContent).toContain("Amortisation term (months)");
    expect(room.textContent).toContain("First payment date");
    expect(room.textContent).toContain("240 months");
  });

  it("takes a typed figure through 'another figure' and puts it on the same facility", async () => {
    const room = open();
    await settle();
    await moveTheLine(room);
    await click(byText(/^Another figure$/));

    expect(said(room)).toContain("Say the amortisation in months");
    await typeInto(room, "180");
    expect(said(room)).toContain("goes onto the plan at 180 months");
  });
});

describe("the amendment that became a $1 commitment (founder drive, 2026-09-02)", () => {
  /* THE LINE HE ACTUALLY TYPED. The room had asked for the first payment date;
     only YYYY-MM-DD was read as a date, so the line fell through to the general
     parser, the "1" was read as a COMMITMENT and the room staged
     "Commitment amount $15M -> $1" with a magnitude warning beside it. */
  const HIS_LINE = "actually change it to Oct 1, 2026";

  async function upToTheDateQuestion(room: HTMLElement) {
    await moveTheLine(room);
    await click(byText(/^Acknowledge$/));
    await click(byText(/^240 months$/));
    await click(byText(/^Confirm$/));
  }

  it("lands his own line on the open gate as the DATE", async () => {
    const room = open();
    await settle();
    await upToTheDateQuestion(room);
    expect(said(room)).toContain("What is the first payment date on the");

    await typeInto(room, HIS_LINE);

    // The room prints the date the way it prints every date; what went in is
    // the ISO the org coerces from, composed off his own words.
    expect(said(room)).toContain("The first payment date on the $15.0MM Line of Credit goes onto the plan at Oct 1, 2026");
  });

  it("stages no commitment at all off it", async () => {
    const room = open();
    await settle();
    await upToTheDateQuestion(room);
    await typeInto(room, HIS_LINE);

    expect(room.textContent).not.toContain("→ $1.00");
    expect(room.textContent).not.toContain("$15M → $1");
    expect(said(room)).not.toContain("is 20 times the");
  });

  it("carries the date onto the manifest, and nothing else", async () => {
    const room = open();
    await settle();
    await upToTheDateQuestion(room);
    await typeInto(room, HIS_LINE);
    await click(byText(/^Confirm$/));

    expect(rail(room)).toContain("First payment date");
    expect(rail(room)).toContain("Amortisation term (months)");
  });

  it("takes the same date in the other forms a banker writes it in", async () => {
    for (const form of ["1 October 2026", "October 1st, 2026", "2026-10-01"]) {
      const room = open();
      await settle();
      await upToTheDateQuestion(room);
      await typeInto(room, `make it ${form}`);
      expect(said(room)).toContain("The first payment date on the $15.0MM Line of Credit goes onto the plan at Oct 1, 2026");
      act(() => root?.unmount());
      container?.remove();
      clearComposed();
    }
  });

  it("still lets a real instruction through: a maturity is not the gate's answer", async () => {
    const room = open();
    await settle();
    await upToTheDateQuestion(room);
    await typeInto(room, "extend the maturity on the 8M equipment loan to 2027-06-30");

    expect(said(room)).not.toContain("The first payment date on the $8.0MM Equipment");
  });
});

describe("the banker can leave pricing for later", () => {
  it("records it on the plan, stages nothing, and stops asking", async () => {
    const room = open();
    await settle();
    await moveTheLine(room);
    await click(byText(/^Leave pricing for later$/));

    expect(said(room)).toContain("left for later");
    expect(said(room)).toContain("will not show a rate or a payment stream in nCino");
    // NOTHING WAS STAGED FOR IT. One entry on the rail: the amount.
    expect(rail(room)).not.toContain("Amortisation term (months)");
    expect(rail(room)).not.toContain("First payment date");
  });

  it("shows the decision on the plan read-back, under that facility", async () => {
    const room = open();
    await settle();
    await moveTheLine(room);
    await click(byText(/^Leave pricing for later$/));
    await click(byText(/^Acknowledge$/));
    await typeInto(room, "what is on the plan");

    expect(room.textContent).toContain("Pricing fields");
    expect(room.textContent).toContain("left for later, so no rate or payment stream on the new version");
  });

  it("does not ask again on the next confirm", async () => {
    const room = open();
    await settle();
    await moveTheLine(room);
    await click(byText(/^Leave pricing for later$/));
    await click(byText(/^Acknowledge$/));
    await typeInto(room, "take the 15M line of credit to $21,000,000");
    await click(byText(/^Confirm$/));

    const asks = said(room).match(/What is the amortisation term/g) ?? [];
    expect(asks).toHaveLength(1);
  });
});

describe("a change that does not move the amount or the term asks nothing", () => {
  it("stays silent on a rate change", async () => {
    const room = open();
    await settle();
    await typeInto(room, "reprice the 15M line of credit to 7.25%");
    await click(byText(/^Confirm$/));

    expect(said(room)).not.toContain("What is the amortisation term");
    expect(said(room)).not.toContain("What is the first payment date");
  });
});
