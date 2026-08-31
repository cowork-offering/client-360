import { newRequestId } from "../channel/adapter";
import { mcpAvailable } from "../channel/mcp";
import {
  executeAction,
  resolveApproverUserId,
  stageAction,
  type ExecuteResult,
  type StagePayloads,
  type ToolOutcome,
} from "../channel/writeTools";
import { assertNoRecordIds, type PlanStep, type StagedOutput } from "../actions/stagedPlan";
import { packageRecords } from "../actions/schemas";
import { validatePlan } from "../actions/transitionAllowlist";
import { facilityProduct, facilityStagesStaged } from "../data/facilityStage";
import { fmtDate, fmtMoney } from "../data/format";
import { isActiveFacility } from "../data/worklist";
import type { BorrowerBundle, C360Data, Facility } from "../data/contract";
import type { PackageChoice, WorkroomBrief, WorkroomEngine, WorkroomSuggestion } from "./engine";
import { gatewayRestate, type Restate } from "./gatewayRestate";
import { WorkroomRefusalError } from "./modifyEngine";
import { vocabularyFor } from "./modes";
import {
  createField,
  CREATE_PRODUCTS,
  parseCreate,
  parseCreateAnswer,
  type CreateField,
  type CreateOutcome,
  type CreateValue,
} from "./parseCreate";
import { greetingFor } from "./viewer";
import type { SourceChip, WhyRow } from "./scripts";
import type {
  HaveRow,
  IntentResult,
  PackageMember,
  StagedWorkroomPlan,
  WorkroomAcknowledgement,
  WorkroomApproval,
  WorkroomChallenge,
  WorkroomContext,
  WorkroomDelta,
  WorkroomExecution,
} from "./types";

/* =============================================================================
   THE CREATION ENGINE. ONE ROOM, TWO DOORS.

     account door — the relationship has no credit package, so the plan CREATES
                    one and files the first facility into it. The tool takes
                    `accountId` and returns a plan opening with `create_package`,
                    named the way nCino's own wizard names it.
     package door — a package is already on the table, so it arrives pre-pinned
                    and the tool takes `productPackageId`. Everything else about
                    the room is identical: same questions, same manifest, same
                    approval.

   EXACTLY ONE ANCHOR travels. Sending both is refused by the tool, and the
   payload type makes sending both a compile error rather than a refusal the
   banker has to read.

   THE TWO-INVOCATION PROTOCOL IS THE PART THAT MATTERS. nCino creates the Loan
   Detail in an AFTER-COMMIT flow, so no synchronous call can ever see it: the
   in-transaction wait hit the Apex CPU ceiling before its own timeout could fire
   (PROBE-LEDGER wave 4). So `execute_new_facility` returns `partial` with the
   facility written and `wait_loan_detail` waiting, and a SECOND invocation —
   same stagingId, same planHash, same idempotency key, the same token resent
   because the platform requires its presence — re-queries once and either
   finishes the purpose write and the Qualification→Proposal hop, or reports it
   is still waiting. STILL WAITING IS NEVER A FAILURE. Nothing has gone wrong;
   the org simply has not finished, and the room says exactly that.

   Envelopes: `knowledge/sf-build-v2/wp2/observed-envelopes-relationship-actions.json`
   (`stage_new_facility`, `execute_new_facility_invocation_1`, `…_2`), live on
   the org 2026-08-24.
   ============================================================================= */

const RATIONALE_PREFIX = "New Facility Workroom";

/** How long the room waits between the two invocations before re-querying.
 *  ONE deliberate pause, never a poll: the observed Loan Detail landed in about
 *  eight seconds, well inside the tool's own 30-second wait budget, and a room
 *  that spun on the org would be a room polling a write. */
const RESUME_SETTLE_MS = 9_000;

const MM = (n: number) => n / 1_000_000;

function packageMembers(bundle: BorrowerBundle | null, packageId: string | null): Facility[] {
  const all = (bundle?.exposure?.facilities ?? []).filter(isActiveFacility);
  if (!packageId) return all;
  const on = all.filter((f) => f.productPackageId === packageId);
  return on.length ? on : all;
}

/** Every package on the relationship. A creation can file into ANY of them, so
 *  unlike a modification none of them is ineligible: a package with nothing
 *  booked is still a package a new facility can join. */
function packageChoices(bundle: BorrowerBundle | null): PackageChoice[] {
  const facilities = (bundle?.exposure?.facilities ?? []).filter(isActiveFacility);
  return packageRecords(bundle).map((pkg) => {
    const on = facilities.filter((f) => f.productPackageId === pkg.id);
    const committed = on.reduce((sum, f) => sum + (typeof f.committed === "number" ? f.committed : 0), 0);
    return {
      id: pkg.id,
      label: pkg.label,
      figure: `${fmtMoney(committed)} committed · ${on.length} ${on.length === 1 ? "member" : "members"}`,
      eligible: true,
    };
  });
}

function memberTag(f: Facility, staged: boolean): { tag: string; proposed: boolean } {
  if (!staged) return { tag: "Stage not staged", proposed: true };
  const stage = (f.stage ?? "").trim();
  if (!stage) return { tag: "Stage not staged", proposed: true };
  return { tag: stage, proposed: stage.toLowerCase() !== "booked" };
}

function toPackageMember(f: Facility, relationship: string, staged: boolean): PackageMember {
  const { tag, proposed } = memberTag(f, staged);
  const label = facilityProduct(f, relationship);
  const detail = [
    typeof f.outstanding === "number" ? `${fmtMoney(f.outstanding)} outstanding` : null,
    typeof f.interestRate === "number" ? `${f.interestRate}%` : null,
    f.maturityDate ? `matures ${fmtDate(f.maturityDate)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return {
    id: f.loanId ?? label,
    key: label,
    short: label,
    tag,
    product: label,
    amount: typeof f.committed === "number" ? `$${MM(f.committed).toFixed(1)}MM` : "—",
    detail: detail || "No terms staged on this member",
    available: typeof f.available === "number" ? `${fmtMoney(f.available)} available` : undefined,
    proposed,
  };
}

/** The order the room asks in, and the order the tool refuses in. Product first
 *  because the org rebuilds the facility's NAME from it. */
const REQUIRED_ORDER = ["create.product", "create.amount", "create.purpose"];

function valueText(v: CreateValue): string {
  switch (v.value.kind) {
    case "currency":
      return fmtMoney(v.value.amount);
    case "months":
      return `${v.value.months} months`;
    default:
      return v.value.text;
  }
}

export function createCreateEngine(args: {
  context: WorkroomContext;
  data: C360Data;
  bundle: BorrowerBundle | null;
  deps?: CreateEngineDeps;
}): WorkroomEngine {
  const { context, data, bundle } = args;
  const deps = { ...defaultDeps, ...args.deps };
  const vocabulary = vocabularyFor(context);
  const relationship = (bundle?.snapshot?.name ?? context.accountName ?? "").trim();

  /* THE DOOR. `productPackageId` decides it and nothing else: a package on the
     table is the package door, no package is the account door. A relationship
     with SEVERAL packages and none chosen is neither, and it asks. */
  const choices = packageChoices(bundle);
  const unanchored = !context.productPackageId && choices.length > 1;
  const createsPackage = !context.productPackageId && choices.length === 0;

  const members = unanchored ? [] : packageMembers(bundle, context.productPackageId);
  const stagesStaged = facilityStagesStaged(bundle);
  const entities = (bundle?.graph?.legalEntities ?? []).filter(
    (e) => !context.productPackageId || !e.packageId || e.packageId === context.productPackageId,
  );
  const committed = members.reduce((sum, f) => sum + (typeof f.committed === "number" ? f.committed : 0), 0);
  const request = (bundle?.requests ?? []).find((r) => (r.ask?.type ?? "").includes("facility")) ?? (bundle?.requests ?? [])[0];

  /** THE HOUSEHOLD. Who is already around this relationship, because an entity a
   *  banker names on a new facility is almost always one of them. */
  function household(): Array<{ name: string; role: string; onDeal: boolean }> {
    const onDeal = new Map<string, string>();
    for (const e of entities) {
      const name = (e.accountName ?? "").trim();
      if (name) onDeal.set(name, e.borrowerType ?? "on the deal");
    }
    const out = [...onDeal].map(([name, role]) => ({ name, role, onDeal: true }));
    for (const c of bundle?.graph?.connections ?? []) {
      const name = (c.counterpartyName ?? "").trim();
      if (!name || onDeal.has(name)) continue;
      out.push({
        name,
        role: [c.role, typeof c.ownershipPercent === "number" ? `${c.ownershipPercent}%` : null].filter(Boolean).join(" · ") || "related",
        onDeal: false,
      });
    }
    return out;
  }

  /** What the read says the package already carries most of. A basis for an
   *  offer, never a claim about what the client asked for. */
  function dominantProduct(): string | null {
    const counts = new Map<string, number>();
    for (const f of members) {
      const p = facilityProduct(f, relationship);
      if (CREATE_PRODUCTS.includes(p)) counts.set(p, (counts.get(p) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }

  const suggestions = buildSuggestions();
  let suggestionIndex = 0;
  let asked = false;
  let staged: StagedWorkroomPlan | null = null;
  let stagedDeltas: WorkroomDelta[] = [];
  let idempotencyKey: string | null = null;
  const spent = new Set<string>();
  let deltaSeq = 0;
  let awaiting: CreateField | null = null;
  /** What the rail held the last time a confirm landed. The engine's read of
   *  what is still missing, refreshed from the manifest the shell passes in. */
  let onManifest: WorkroomDelta[] = [];

  /* ------------------------------------------------------------- the deltas */

  function toDelta(v: CreateValue, seq: number): WorkroomDelta {
    const { field } = v;
    const after = valueText(v);
    // THE FACILITY GETS ITS NAME AS SOON AS THE ROOM KNOWS IT. Before the
    // product lands there is only "the new facility"; after it, every entry
    // names the thing being built.
    const product = composedProduct(onManifest);
    const facilityWord = product ? `the new ${product} facility` : "the new facility";

    if (!field.wireKey) {
      // The borrowing structure. Real, understood, and not this tool's to file.
      return {
        id: `${field.id}:${v.party?.name ?? "structure"}:${seq}`,
        group: field.group,
        op: "add",
        kind: "Add borrowing structure",
        kindTone: "refusal",
        badge: `${v.party?.name ?? after} · handed off`,
        title: field.label,
        target: v.party?.name ?? "the borrowing structure",
        before: "not on the facility this plan creates",
        after,
        map: [
          ["Object", field.object],
          ["Field", "LLC_BI__Account__c · LLC_BI__Loan__c · LLC_BI__Borrower_Type__c"],
          ["Written as", "Nothing. The tool files one involvement row and it is the borrower's; a second is a handoff."],
        ],
        fields: [field.object],
        caveat: field.gap,
        filed: { recordId: "not filed", verification: "Handed off — nothing was written" },
        fileable: false,
        handoff: { reason: field.gap ?? "No tool files this today.", closes: field.closes },
        chainLinks: [
          {
            object: "LLC_BI__Legal_Entities__c",
            via: "LLC_BI__Loan__c",
            label: `Add ${v.party?.name ?? "the entity"} to the facility's borrowing structure as ${v.party?.role ?? "a party"}`,
            note: "The Is_* role fields are formulas derived from Borrower_Type and cannot be written; Contingent Amount is mutually exclusive with Ownership on one row.",
          },
        ],
      };
    }

    const wireValue = v.value.kind === "currency" ? v.value.amount : v.value.kind === "months" ? v.value.months : v.value.text;
    return {
      id: `${field.id}:new:${seq}`,
      group: field.group,
      op: "add",
      // The purpose is not a term: it lands on the Loan Detail, on the resume,
      // and the manifest should not read as though it sat on the facility.
      kind: field.id === "create.product" ? "New facility" : field.id === "create.purpose" ? "Loan purpose" : "Facility term",
      kindTone: field.id === "create.product" ? "new" : undefined,
      badge: `${field.label} → ${after}`,
      title: field.label,
      target: facilityWord,
      // A CREATION HAS NO BEFORE. Saying "not set" would read as a field sitting
      // empty on a record; there is no record until this plan runs.
      before: "not on the deal — this plan creates it",
      after,
      // THE PRODUCT IS THE FACILITY. It is the entry that moves the member
      // count, and the amount is the entry that moves the committed total.
      newMember: field.id === "create.product",
      committedDeltaMM: field.id === "create.amount" && v.value.kind === "currency" ? MM(v.value.amount) : undefined,
      map: [
        ["Object", field.object],
        ["Field", field.apiName ?? "not established on this org"],
        [
          "Written as",
          field.id === "create.purpose"
            ? `${field.apiName} on the Loan Detail the org creates after the facility is filed. It is written on the second invocation, never the first.`
            : `${field.apiName} on the facility this plan creates.`,
        ],
      ],
      fields: field.apiName ? [`${field.object}.${field.apiName}`] : [field.object],
      caveat: field.caveat,
      filed: {
        recordId: "assigned by the org on execution",
        verification: field.id === "create.purpose" ? "Re-queried on the Loan Detail after the resume" : "Re-queried on the facility after the write",
      },
      fileable: true,
      // `facilityId` on a creation is THE ANCHOR the plan files against, because
      // the facility itself does not exist yet and will not until the plan runs.
      // It is never sent: `wirePayload` reads the key and the value and resolves
      // the anchor from the context, where the XOR rule can be enforced.
      wire: { key: field.wireKey, value: wireValue, facilityId: context.productPackageId ?? context.accountId },
      chainLinks:
        field.id === "create.product"
          ? [
              { object: "LLC_BI__Loan__c", via: "LLC_BI__Product_Package__c", label: "Create the facility at Qualification, status Open", note: "The org REBUILDS the name as Account - Product - Amount and assigns the loan officer itself." },
              { object: "LLC_BI__Legal_Entities__c", via: "LLC_BI__Loan__c", label: "Add the borrower to the borrowing structure at 100 percent", note: "A facility insert creates none on its own: without this the facility would have no borrowing structure at all." },
              { object: "LLC_BI__Loan_Detail__c", via: "LLC_BI__Loan__c", label: "Wait for the org's own after-commit flow, then write the purpose and hop to Proposal", note: "Created in a separate transaction. It is why execution is two invocations." },
            ]
          : undefined,
    };
  }

  /** The product the manifest has settled on, if it has. */
  function composedProduct(entries: WorkroomDelta[]): string | null {
    const hit = entries.find((e) => e.id.startsWith("create.product:"));
    return hit ? hit.after : null;
  }

  function composedIds(entries: WorkroomDelta[]): Set<string> {
    return new Set(entries.map((e) => e.id.slice(0, e.id.indexOf(":"))));
  }

  function missingRequired(entries: WorkroomDelta[]): CreateField[] {
    const have = composedIds(entries);
    return REQUIRED_ORDER.filter((id) => !have.has(id)).map((id) => createField(id)!);
  }

  /** The question for a field, with what the room already knows beside it. */
  function questionFor(field: CreateField): string {
    switch (field.id) {
      case "create.product":
        return `Which product? The Commercial Loan record type offers ${CREATE_PRODUCTS.join(", ")}. Left blank the org files Construction and names the facility from it.`;
      case "create.amount":
        return "What amount? Say it with its magnitude — $5MM or $5,000,000 — and it must be greater than zero: the org gates the stage hop on it.";
      case "create.purpose":
        return "What is the primary loan purpose? The org leaves it null on the Loan Detail it creates, and it gates the move to Proposal.";
      default:
        return `What should ${field.label.toLowerCase()} be?`;
    }
  }

  /* ------------------------------------------------------------ suggestions */

  function buildSuggestions(): WorkroomSuggestion[] {
    if (unanchored) return [];
    const out: WorkroomSuggestion[] = [];

    /* THE PILL OFFERS A PRODUCT ONLY WHERE THE READ SUPPLIES ONE. The client's
       own request first; failing that, the product this package already carries
       most of, which is an offer with a basis rather than a guess. A room with
       neither asks instead, and asking is a better move than inventing. */
    const asked = request?.ask?.facilityName;
    const fromRequest = asked ? CREATE_PRODUCTS.find((p) => asked.toLowerCase().includes(p.toLowerCase())) : undefined;
    const product = fromRequest ?? dominantProduct();
    if (product) {
      out.push({
        label: fromRequest ? `Add the ${product} the client asked for` : `Add another ${product}`,
        say: `add a ${product} facility`,
      });
    }
    // The client's own figure. This one IS a target, so it reads as one.
    if (typeof request?.ask?.to === "number") {
      out.push({ label: `Size it at ${fmtMoney(request.ask.to)}`, say: `${fmtMoney(request.ask.to)}` });
    }
    const related = household().find((h) => !h.onDeal);
    if (related) out.push({ label: `Add ${related.name} as a guarantor`, say: `add ${related.name} as a guarantor` });
    return out;
  }

  /* ------------------------------------------------------------------ brief */

  function haveRows(): HaveRow[] {
    const rows: HaveRow[] = [
      createsPackage
        ? {
            label: "Package position",
            value: "No credit package on this relationship",
            detail:
              "The plan creates one before it files the facility, named the way nCino's own wizard names it. That is the account door: one extra step at the top of the same plan.",
          }
        : {
            label: "Package position",
            value: `${members.length} ${members.length === 1 ? "member" : "members"} · ${fmtMoney(committed)} committed`,
            detail: [
              bundle?.snapshot?.packageStage ? `Stage ${bundle.snapshot.packageStage}` : null,
              bundle?.snapshot?.primaryRiskRating ? `risk rating ${bundle.snapshot.primaryRiskRating}` : null,
              "A new facility joins this package and the committed total moves with it.",
            ]
              .filter(Boolean)
              .join(" · "),
          },
      {
        label: "What the org names, not us",
        value: "The facility name, the loan officer, the Loan Detail",
        detail:
          "A before-save flow REBUILDS the name as Account - Product - Amount, ACNPEX_AccountOwnerAsLoanOfficer assigns the officer from the account owner, and an after-commit flow creates the Loan Detail in its own transaction. Anything this room sent for those three would be discarded.",
      },
      {
        label: "Borrowing structure",
        value: entities.length ? `${entities.length} involvement ${entities.length === 1 ? "row" : "rows"} on the package` : "None staged on this package",
        detail:
          "The tool adds exactly one row to the new facility: the borrower, at 100 percent ownership. A facility insert creates none on its own, so without that step the facility would have no borrowing structure at all. A second entity is a handoff.",
      },
    ];

    const people = household().filter((h) => !h.onDeal);
    if (people.length) {
      rows.push({
        label: "The household",
        value: people.map((h) => h.name).join(", "),
        detail: people.map((h) => `${h.name} · ${h.role}`).join("; ") + ". Related to the relationship and not on this deal.",
      });
    }
    if (request?.summary) {
      rows.push({
        label: request.channel ? `Client request · ${request.channel}` : "Client request",
        value: typeof request.ask?.to === "number" ? fmtMoney(request.ask.to) : (request.status ?? "open"),
        detail: request.summary,
      });
    }
    return rows;
  }

  function sources(): SourceChip[] {
    const have = haveRows();
    const pick = (label: string) => have.filter((r) => r.label === label);
    const out: SourceChip[] = [
      { id: "package", label: "Package", kicker: createsPackage ? "There is none yet" : "What the package holds today", icon: "package", have: pick("Package position") },
      { id: "entities", label: "Structure", kicker: "Who would be on it", icon: "account", have: [...pick("Borrowing structure"), ...pick("The household")] },
      { id: "org", label: "The org's own", kicker: "What we do not name", icon: "covenants", have: pick("What the org names, not us") },
    ];
    const client = have.filter((r) => r.label.startsWith("Client request"));
    if (client.length) out.push({ id: "email", label: "Client request", kicker: `Received ${fmtDate(request?.receivedAt) || "recently"}`, icon: "email", have: client });
    return out;
  }

  function why(): WhyRow[] {
    return [
      {
        label: createsPackage ? "No package yet" : "The package",
        detail: createsPackage
          ? `${relationship} carries no credit package, so this plan creates one and files the facility into it. Exactly one anchor travels: the account, never both.`
          : `${members.length} ${members.length === 1 ? "member" : "members"}, ${fmtMoney(committed)} committed. The facility is anchored on the package, which is what the org hangs a loan off.`,
      },
      {
        label: "What this room files",
        detail:
          "Four values reach the org: product, amount, term and the primary loan purpose. Product, amount and purpose are REQUIRED — the tool refuses a plan without them, in its own words — and the term is optional.",
      },
      {
        label: "Why it runs twice",
        detail:
          "nCino creates the Loan Detail after the commit, in its own transaction, so no synchronous call can see it. The first invocation files the facility and the borrower row; the second writes the purpose and moves the facility one step to Proposal. Nothing is approved: post-approval stages are unreachable from here.",
      },
    ];
  }

  function position(): string {
    if (unanchored) {
      return `${choices.length} packages on this relationship. Pick the one this facility joins: a facility is anchored on one package, and one package is one plan under one approval.`;
    }
    if (createsPackage) {
      return `${relationship} carries no credit package, so this plan creates one and files the first facility into it. Tell me the product and the amount and I will compose it.`;
    }
    return `${context.packageName} holds ${members.length} ${members.length === 1 ? "member" : "members"} and ${fmtMoney(committed)} committed. A new facility joins that total. Tell me the product and the amount.`;
  }

  function brief(): WorkroomBrief {
    return {
      greeting: greetingFor(data.meta?.user, context.approver),
      packageChoices: unanchored ? choices : [],
      packageName: context.packageName,
      baselineCommittedMM: MM(committed),
      baselineMembers: members.length,
      showsMembers: members.length > 0,
      covenantFigure: "—",
      loadSteps: createsPackage
        ? ["Reading the relationship", "Who is around it", "What the org will name", "Ready"]
        : ["Reading the package", "Members and structure", "What the org will name", "Ready"],
      askPin: typeof request?.ask?.to === "number" ? `Client asks ${fmtMoney(request.ask.to)}` : "",
      position: position(),
      sources: sources(),
      why: why(),
      whyCaveat:
        "Recommendation only. Nothing is written until the single approval, and the approval redeems one use of one token. The agent recommends, the banker decides.",
      composeTarget: REQUIRED_ORDER.length,
      members: members.map((f) => toPackageMember(f, relationship, stagesStaged)),
      have: haveRows(),
    };
  }

  /* ------------------------------------------------------------ parseIntent */

  function settle(result: IntentResult, question: boolean): IntentResult {
    asked = result.kind === "unparsed" || question;
    if (result.kind !== "unparsed") {
      deltaSeq += 8;
      suggestionIndex = Math.min(suggestionIndex + 1, suggestions.length);
    }
    return result;
  }

  /**
   * WHAT LANDED, AND THE ONE THING STILL MISSING.
   *
   * One question per value (law 4), and it travels WITH the chips rather than
   * after them: a room that puts chips on the table and then goes quiet is a
   * room the banker has to guess at. A question also suppresses the next
   * suggestion, so there is never a pill and an open question at once.
   */
  /** The closed answer set for a question, where the org holds one. The product
   *  catalog is the one every creation starts with; clicking a chip SAYS the
   *  product and the answer path reads it like a typed one. */
  function optionsFor(field: CreateField | null): Array<{ label: string; say: string }> | undefined {
    if (field?.id === "create.product") {
      return CREATE_PRODUCTS.map((product) => ({ label: product, say: product }));
    }
    return undefined;
  }

  function toResult(outcome: CreateOutcome, seq: number): IntentResult | null {
    if (outcome.kind === "clarify") {
      awaiting = outcome.awaiting ?? awaiting;
      return { kind: "unparsed", reply: outcome.question, options: optionsFor(awaiting) };
    }
    if (outcome.kind === "none") return null;

    const deltas = outcome.values.map((v, i) => toDelta(v, seq + i));
    const fileable = deltas.filter((d) => d.fileable).length;
    const handed = deltas.length - fileable;
    // What is still missing counts the manifest AND what is on the table now:
    // a chip the banker has not confirmed yet is still an answer they gave.
    const missing = missingRequired([...onManifest, ...deltas]);
    awaiting = missing[0] ?? null;
    const reply = [
      fileable ? `${fileable} of these ${deltas.length === 1 ? "goes" : "go"} on the facility.` : null,
      handed
        ? `${handed} ${handed === 1 ? "is" : "are"} staged for the record and handed off: the tool files one borrowing-structure row and it is the borrower's.`
        : null,
      missing.length ? questionFor(missing[0]) : "That is everything the tool requires. Confirm and I will file it.",
    ]
      .filter(Boolean)
      .join(" ");
    return { kind: "deltas", reply, deltas };
  }

  async function parseIntent(text: string): Promise<IntentResult> {
    if (unanchored) {
      asked = true;
      return {
        kind: "unparsed",
        reply: `This relationship carries ${choices.length} packages and a facility is anchored on one of them. Pick the package above and I will compose inside it.`,
      };
    }

    // AN ANSWER TO THE LAST QUESTION comes first: "Equipment" is a complete
    // reply to "which product", and reading it as a new instruction would work
    // here but would lose a purpose like "for the tooling ramp".
    if (awaiting) {
      const answered = parseCreateAnswer(awaiting, text);
      if (answered) {
        const result = toResult(answered, deltaSeq);
        // `toResult` has just moved `awaiting` on to whatever is still missing,
        // and an outstanding question is what suppresses the next pill. Reading
        // the result's own kind here instead would offer a move under an open
        // question, which is what wires the scene bar to the wrong one.
        if (result) return settle(result, awaiting !== null);
      }
    }

    const parsed = parseCreate(text, { household: household(), relationship });
    const direct = toResult(parsed, deltaSeq);
    if (direct) return settle(direct, awaiting !== null);

    if (deps.restate && deps.available()) {
      const restated = await deps.restate(text, [...CREATE_PRODUCTS, "facility", "amount", "term", "purpose", "guarantor"]);
      if (restated) {
        const second = toResult(parseCreate(restated, { household: household(), relationship }), deltaSeq);
        if (second) return settle(second, awaiting !== null);
      }
    }

    const missing = missingRequired(onManifest);
    awaiting = missing[0] ?? null;
    asked = true;
    return {
      kind: "unparsed",
      reply: missing.length
        ? `I could not place that on the facility. ${questionFor(missing[0])}`
        : "I could not place that. Product, amount and purpose are all set, so the next move is to file it — or name a term to change.",
      options: optionsFor(missing[0] ?? null),
    };
  }

  /* ----------------------------------------------------------- picking a member */

  function pick(memberId: string): IntentResult | null {
    const facility = members.find((f) => (f.loanId ?? "") === memberId) ?? null;
    if (!facility) return null;
    asked = true;
    const held = [
      typeof facility.committed === "number" ? `${fmtMoney(facility.committed)} committed` : null,
      typeof facility.interestRate === "number" ? `${facility.interestRate}%` : null,
      facility.maturityDate ? `matures ${fmtDate(facility.maturityDate)}` : null,
    ]
      .filter(Boolean)
      .join(", ");
    const missing = missingRequired(onManifest);
    awaiting = missing[0] ?? null;
    // A MEMBER PICK IS NOT A CREATE, and saying so is the honest answer. The
    // strip in this room is context: what the new facility will sit beside.
    return {
      kind: "unparsed",
      reply: `${facilityProduct(facility, relationship)} is already on the package${held ? `: ${held}` : ""}. This room adds a new facility beside it. ${
        missing.length ? questionFor(missing[0]) : "Product, amount and purpose are set — confirm and I will file it."
      }`,
    };
  }

  /* ------------------------------------------------- the confirm's answer */

  /** WHAT A LANDED ENTRY DID TO THE PACKAGE. The founder's reading: the package
   *  total is what counts and the facilities are where the money sits. A
   *  creation is the one move that adds to both. */
  function packageMove(entries: WorkroomDelta[]): string {
    const addedMM = entries.reduce((sum, d) => sum + (d.committedDeltaMM ?? 0), 0);
    if (!addedMM) {
      return createsPackage ? "The package does not exist yet; this plan creates it." : `The package total holds at ${fmtMoney(committed)}.`;
    }
    return createsPackage
      ? `That opens the package at ${fmtMoney(addedMM * 1_000_000)}.`
      : `That takes the package from ${fmtMoney(committed)} to ${fmtMoney(committed + addedMM * 1_000_000)}.`;
  }

  /** THE CHECK AN ADDITION TRIPS, on the org's own collateral figures. A new
   *  facility enlarges the commitment and brings no security with it, which is
   *  exactly the fact a credit committee asks about first. */
  function coverageCheck(entries: WorkroomDelta[]): WorkroomChallenge | undefined {
    const addedMM = entries.reduce((sum, d) => sum + (d.committedDeltaMM ?? 0), 0);
    if (!addedMM) return undefined;
    const lendable = bundle?.exposure?.totalUniqueCollateralLendableValue;
    if (typeof lendable !== "number" || lendable <= 0 || committed <= 0) return undefined;
    const after = committed + addedMM * 1_000_000;
    const was = lendable / committed;
    const now = lendable / after;
    return {
      id: `coverage:${after}`,
      verdict: now >= 1 ? "Coverage holds" : "Coverage thins",
      tone: now >= 1 ? "ok" : "warn",
      kicker: "Derived here from the org's collateral pool",
      line: `Committed goes to ${fmtMoney(after)} against ${fmtMoney(lendable)} of lendable collateral. This facility pledges nothing of its own: fully drawn, the existing pool covers ${now.toFixed(2)}x, from ${was.toFixed(2)}x.`,
      rows: [
        ["Lendable collateral, distinct pool", fmtMoney(lendable)],
        ["Committed today", fmtMoney(committed)],
        ["Committed with this facility", fmtMoney(after), "key"],
        ["Coverage if fully drawn", `${was.toFixed(2)}x → ${now.toFixed(2)}x`, "sum"],
      ],
      say: "This cockpit's arithmetic on a fully drawn position, not the org's own coverage ratio. Pledging collateral to the new facility is its own credit action and no tool here files one.",
    };
  }

  function acknowledge(delta: WorkroomDelta, entries: WorkroomDelta[]): WorkroomAcknowledgement {
    onManifest = entries;
    const missing = missingRequired(entries);
    awaiting = missing[0] ?? null;
    asked = missing.length > 0;
    const landed = delta.fileable
      ? `${delta.title} on ${delta.target}: ${delta.after}.`
      : `${delta.title} for ${delta.target} is on the plan for the record. ${delta.handoff?.reason ?? "No tool files it today."}`;
    return {
      reply: `${landed} ${packageMove(entries)} ${missing.length ? questionFor(missing[0]) : vocabulary.nextMove}`,
      challenge: coverageCheck(entries),
    };
  }

  /* -------------------------------------------------------------- stagePlan */

  function withHandoffs(plan: StagedOutput, handed: WorkroomDelta[]): StagedOutput {
    if (!handed.length) return plan;
    const steps: PlanStep[] = [];
    handed.forEach((d, i) => {
      steps.push({
        id: `handoff_${i}`,
        type: "handoff",
        label: `HANDOFF: ${d.title} for ${d.target} — ${d.handoff?.reason ?? "no tool files this today"}`,
      });
      (d.chainLinks ?? []).forEach((link, j) => {
        steps.push({
          id: `handoff_${i}_chain_${j}`,
          type: "handoff",
          label: `${j + 1}. ${link.label} (${link.object} via ${link.via})${link.note ? ` — ${link.note}` : ""}`,
        });
      });
    });
    return {
      ...plan,
      steps: [...plan.steps, ...steps],
      warnings: [
        ...plan.warnings,
        `${handed.length} staged ${handed.length === 1 ? "entry is" : "entries are"} handed off rather than filed: no deployed tool writes ${handed.length === 1 ? "it" : "them"}. The filed summary names each one and why.`,
      ],
    };
  }

  /** ONE value per key. A manifest carrying two amounts is a banker who restated
   *  and did not take the first one out, and filing either would be a coin toss. */
  function wirePayload(fileable: WorkroomDelta[], rationale: string): StagePayloads["new-facility-request"] {
    const byKey = new Map<string, Set<number | string>>();
    for (const d of fileable) {
      if (!d.wire) continue;
      const set = byKey.get(d.wire.key) ?? new Set<number | string>();
      set.add(d.wire.value);
      byKey.set(d.wire.key, set);
    }
    for (const [key, values] of byKey) {
      if (values.size > 1) {
        throw new WorkroomRefusalError(
          `The plan carries ${values.size} different values for ${key}, and one facility has one. Take the ones you do not mean out of the manifest and I will stage the rest.`,
        );
      }
    }
    const one = (key: string) => [...(byKey.get(key) ?? [])][0];
    const product = one("product") as string | undefined;
    const amount = one("amount") as number | undefined;
    const purpose = one("primaryLoanPurpose") as string | undefined;

    // REFUSE AT STAGE WHAT THE ORG WILL REFUSE, in the tool's own words. A round
    // trip that comes back VALIDATION_FAILED teaches the banker nothing this
    // room did not already know.
    if (!product) {
      throw new WorkroomRefusalError(
        "product is required. The org self-populates Construction when it is blank and rebuilds the facility's name from it, so an omitted product ships a facility labelled wrong. Name one of " +
          `${CREATE_PRODUCTS.join(", ")}.`,
      );
    }
    if (typeof amount !== "number" || amount <= 0) {
      throw new WorkroomRefusalError("amount is required and must be greater than zero. It gates the org's own validation on the stage hop.");
    }
    if (!purpose) {
      throw new WorkroomRefusalError("primaryLoanPurpose is required. It gates the move to Proposal, and the org leaves it null on the Loan Detail it creates.");
    }

    const base = {
      idempotencyKey: idempotencyKey!,
      rationale,
      product,
      amount,
      primaryLoanPurpose: purpose,
      termMonths: (one("termMonths") as number | undefined) ?? null,
    };
    // EXACTLY ONE ANCHOR. The package where there is one, the account where
    // there is not; sending both is refused by the tool.
    return context.productPackageId
      ? { ...base, productPackageId: context.productPackageId }
      : { ...base, accountId: context.accountId };
  }

  async function stagePlan(deltas: WorkroomDelta[]): Promise<StagedWorkroomPlan> {
    if (!deps.available()) {
      throw new WorkroomRefusalError(
        "This view has no connector, so there is no org to stage against. Nothing here is simulated: the plan is the org's or there is no plan.",
      );
    }
    if (unanchored) {
      throw new WorkroomRefusalError("This relationship carries more than one package and none is chosen. Pick the one this facility joins and I will stage it there.");
    }

    const fileable = deltas.filter((d) => d.fileable && d.wire);
    const handed = deltas.filter((d) => !d.fileable);
    if (!fileable.length) {
      throw new WorkroomRefusalError(
        handed.length
          ? `Nothing in this plan creates a facility. All ${handed.length} ${handed.length === 1 ? "entry needs" : "entries need"} a tool that is not deployed. Name the product, the amount and the purpose and I will file it.`
          : "Nothing is staged, so there is no plan to build.",
      );
    }

    idempotencyKey = idempotencyKey ?? deps.newKey();
    const rationale = `${RATIONALE_PREFIX}: ${fileable.map((d) => `${d.title} ${d.after}`).join("; ")} on ${context.packageName}.`;
    const outcome = await deps.stage(wirePayload(fileable, rationale));
    if (!outcome.ok) {
      idempotencyKey = null;
      throw new WorkroomRefusalError(outcome.error.message);
    }

    const plan = withHandoffs(outcome.result, handed);
    staged = { plan, planHash: plan.planHash, stagingId: plan.stagingId, decisionToken: plan.decisionToken ?? null };
    stagedDeltas = deltas;
    return staged;
  }

  /* ---------------------------------------------------------------- execute */

  /**
   * TWO INVOCATIONS, AND THE SECOND IS NOT A RETRY.
   *
   * Invocation 1 files the facility and the borrower row and comes back
   * `partial` with `wait_loan_detail` waiting, because the Loan Detail is
   * created by an after-commit flow that no synchronous call can see.
   * Invocation 2 — same stagingId, same planHash, same idempotency key, the
   * token resent because the platform requires its PRESENCE even though the
   * Apex resume path dispatches on staging status — re-queries once and either
   * finishes or reports it is still waiting.
   *
   * A FAILED RESUME IS NOT A FAILED CREATE. The facility exists by then, so the
   * first invocation's result stands and the resume's error travels as a
   * handoff rather than discarding a filing that happened.
   */
  async function execute(approval: WorkroomApproval): Promise<WorkroomExecution> {
    if (!staged) throw new WorkroomRefusalError("Nothing has been staged, so there is no plan to file.");
    if (approval.planHash !== staged.planHash || approval.stagingId !== staged.stagingId) {
      throw new WorkroomRefusalError("The plan changed after you confirmed it, so the confirmation no longer applies.");
    }
    if (spent.has(approval.decisionToken)) throw new WorkroomRefusalError("This confirmation has already been used.");

    const violations = validatePlan(staged.plan.steps);
    if (violations.length) {
      throw new WorkroomRefusalError(`This plan cannot be confirmed: ${violations.map((v) => `step ${v.stepId}: ${v.reason}`).join("; ")}.`);
    }
    const leaks = assertNoRecordIds(staged.plan);
    if (leaks.length) throw new WorkroomRefusalError(`This plan cannot be confirmed: ${leaks.join("; ")}.`);
    if (staged.plan.executionHeld) throw new WorkroomRefusalError(staged.plan.heldReason ?? "The org holds execution of this plan.");

    const approverUserId = resolveApproverUserId(data.meta);
    if (!approverUserId) {
      throw new WorkroomRefusalError("This view has no Salesforce user id for the signed-in identity, and the org will not file a record without one.");
    }
    const token = staged.decisionToken;
    if (!token) throw new WorkroomRefusalError("This plan carries no confirmation token from the staging call, so it cannot be executed.");

    const payload = {
      idempotencyKey: idempotencyKey ?? staged.stagingId,
      stagingId: staged.stagingId,
      planHash: staged.planHash,
      decisionToken: token,
      approverUserId,
    };
    const first = await deps.execute(payload);
    if (!first.ok) throw new WorkroomRefusalError(first.error.message);
    spent.add(approval.decisionToken);

    let result = first.result;
    /** The resume's own story, where it has one. Never swallowed. */
    let resumeNote: string | null = null;
    if (result.resumable) {
      await deps.settle(RESUME_SETTLE_MS);
      const second = await deps.execute(payload);
      if (!second.ok) {
        resumeNote = `The facility is filed. Continuing it to write the purpose and move it to Proposal did not complete: ${second.error.message}`;
      } else {
        result = second.result;
        if (result.resumable) {
          // STILL WAITING IS NEVER A FAILURE. Nothing has gone wrong; the org
          // has not finished, and the room says exactly that in its own words.
          resumeNote = result.resumeDescriptor ?? "The org has not created the Loan Detail yet. Nothing has gone wrong and nothing is lost; the facility is filed and the purpose is still to write.";
        }
      }
    }

    const stepDetail = (id: string) => result.steps?.find((s) => s.id === id)?.detail;
    const verified = (result.steps ?? []).filter((s) => s.state === "verified").length;

    const filed = stagedDeltas
      .filter((d) => d.fileable && d.wire)
      .map((d) => {
        const purpose = d.wire!.key === "primaryLoanPurpose";
        return {
          deltaId: d.id,
          // REAL ids, from the org's own response. The purpose lands on the Loan
          // Detail, which is a different record and says so.
          recordId: (purpose ? result.loanDetailId : result.loanId) ?? (purpose ? "the org has not created the Loan Detail yet" : "the org did not name the facility"),
          verification:
            (purpose ? stepDetail("write_loan_purpose") : stepDetail("verify_loan") ?? stepDetail("write_loan")) ??
            (purpose ? "The purpose is written on the resume, once the org has created the Loan Detail." : result.outcome),
        };
      });

    const handoffs = stagedDeltas
      .filter((d) => !d.fileable)
      .map((d) => ({ deltaId: d.id, title: `${d.title} · ${d.target}`, reason: d.handoff?.reason ?? "No tool files this today.", closes: d.handoff?.closes }));

    const created = [
      result.packageCreated && result.productPackageId ? `Package ${result.productPackageId} created` : null,
      result.involvementId ? `Borrower added to the borrowing structure (${result.involvementId})` : null,
      result.stage ? `The facility reads at ${result.stage}` : null,
    ].filter(Boolean) as string[];

    return {
      filed,
      tokenNote: `Token redeemed by ${approval.approverUserId} · single use · ${verified} of ${result.steps?.length ?? 0} plan steps verified by the tool's own re-query${
        result.replayed ? " · replayed, nothing was written twice" : ""
      }`,
      // The org's own sentence about what is left, verbatim where it gave one.
      handoff: resumeNote ?? undefined,
      handoffs,
      reply: {
        subject: `${context.packageName}: facility filed`,
        lede: result.outcome,
        body: [
          packageMove(stagedDeltas),
          result.recordName ? `The org named it ${result.recordName}.` : "The org did not confirm the name it assigned, so the read-back did not verify.",
          ...created.map((c) => `- ${c}`),
          ...filed.map((f) => `- ${stagedDeltas.find((d) => d.id === f.deltaId)?.title}: ${f.verification}`),
          handoffs.length
            ? `\n${handoffs.length} ${handoffs.length === 1 ? "item was" : "items were"} recorded on the plan but not filed, because no tool writes ${handoffs.length === 1 ? "it" : "them"} today:\n` +
              handoffs.map((h) => `- ${h.title}: ${h.reason}`).join("\n")
            : "",
          resumeNote ? `\n${resumeNote}` : "",
          "\nNothing is approved: the facility sits at a pre-approval stage and booking is nCino's own Submit for Approval run.",
        ]
          .filter(Boolean)
          .join("\n"),
      },
    };
  }

  return {
    mode: "create",
    scripted: false,
    brief,
    suggest: () => (asked ? null : (suggestions[suggestionIndex] ?? null)),
    pick,
    parseIntent,
    acknowledge,
    stagePlan,
    execute,
  };
}

/* ---------------------------------------------------------------- the deps */

export interface CreateEngineDeps {
  stage?: (payload: StagePayloads["new-facility-request"]) => Promise<ToolOutcome<StagedOutput>>;
  execute?: (payload: {
    idempotencyKey: string;
    stagingId: string;
    planHash: string;
    decisionToken: string;
    approverUserId: string;
  }) => Promise<ToolOutcome<ExecuteResult>>;
  /** The one pause between the two invocations. Injectable so a test does not
   *  spend nine seconds proving the protocol it is testing. */
  settle?: (ms: number) => Promise<void>;
  restate?: Restate;
  available?: () => boolean;
  newKey?: () => string;
}

const defaultDeps: Required<Omit<CreateEngineDeps, "restate">> & Pick<CreateEngineDeps, "restate"> = {
  stage: (payload) => stageAction("new-facility-request", payload),
  execute: (payload) => executeAction("new-facility-request", payload),
  settle: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  available: mcpAvailable,
  newKey: newRequestId,
  restate: gatewayRestate,
};
