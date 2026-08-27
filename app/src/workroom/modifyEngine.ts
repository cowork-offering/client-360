import { newRequestId } from "../channel/adapter";
import { mcpAvailable, SERVERS, TOOLS, callTool, unwrapLlm } from "../channel/mcp";
import {
  executeAction,
  resolveApproverUserId,
  stageAction,
  type ExecuteResult,
  type StagePayloads,
  type ToolOutcome,
} from "../channel/writeTools";
import { assertNoRecordIds, type PlanStep, type StagedOutput } from "../actions/stagedPlan";
import { validatePlan } from "../actions/transitionAllowlist";
import { bookedFacilities, facilityProduct, facilityStagesStaged, shortFacilityLabel } from "../data/facilityStage";
import { fmtDate, fmtMoney } from "../data/format";
import { isActiveFacility } from "../data/worklist";
import type { BorrowerBundle, C360Data, Covenant, Facility } from "../data/contract";
import type { WorkroomBrief, WorkroomEngine } from "./engine";
import { catalogSummary, chainFor, isFileable, type CatalogField, type WireKey } from "./fieldCatalog";
import { parseAnswer, parseModify, type Amendment, type ParseContext, type ParsedValue } from "./parseModify";
import type { SourceChip, WhyRow } from "./scripts";
import type {
  HaveRow,
  IntentResult,
  PackageMember,
  StagedWorkroomPlan,
  WorkroomApproval,
  WorkroomContext,
  WorkroomDelta,
  WorkroomExecution,
  WorkroomRefusal,
} from "./types";

/* =============================================================================
   THE REAL MODIFY ENGINE.

   Same five calls as the shell engine, and not one of them is a storyline:

     brief       — the cockpit's own read of THIS package: members, covenants,
                   collateral, signals, the client's ask. No fixture.
     suggest     — moves derived from that read, spent as they are taken.
     parseIntent — the deterministic parser over the indexed field catalog. The
                   gateway LLM may RESTATE a line into the catalog's vocabulary;
                   it never authors a delta, and its restatement goes back
                   through the same parser before anything can become a chip.
     stagePlan   — ORDERED (W1). Step 1 is the credit-action clone through the
                   existing stage_loan_modification wrapper; the org's own steps
                   carry the order; amendments no tool can file are appended as
                   handoff steps and are EXCLUDED from the wire payload.
     execute     — the existing execute wrapper, behind the ConfirmGate checks:
                   allowlist, no-record-ids, org hold, and a drift recompute
                   against the figures each entry was composed on. Verified by
                   the tool's own re-query, or it does not come back.

   WHAT IT WILL NOT DO. Nine of W1's sixteen scope items have no tool at all
   (`knowledge/sf-build-v2/wiring-gap-analysis.md`). They are parsed, named,
   manifested and HANDED OFF — never filed, never faked, and never silently
   dropped. The plan counts what files; the filed scene says what did not.
   ============================================================================= */

/** Raised where the room cannot honestly proceed. The shell renders the message
 *  into the conversation and leaves the approval where it was. */
export class WorkroomRefusalError extends Error {}

const RATIONALE_PREFIX = "Modification Workroom";

/* ------------------------------------------------------------------ figures */

const MM = (n: number) => n / 1_000_000;

function pct(part: number | undefined, whole: number | undefined): number | null {
  if (typeof part !== "number" || typeof whole !== "number" || whole <= 0) return null;
  return Math.round((part / whole) * 100);
}

/** Members of THIS package, in the read's own order. */
function packageMembers(bundle: BorrowerBundle | null, packageId: string | null): Facility[] {
  const all = (bundle?.exposure?.facilities ?? []).filter(isActiveFacility);
  if (!packageId) return all;
  const on = all.filter((f) => f.productPackageId === packageId);
  // A read that does not carry package ids on its facilities is not a read of
  // an empty package: it is a read that cannot place them, and the room shows
  // what it has rather than an empty strip.
  return on.length ? on : all;
}

function packageCovenantRows(bundle: BorrowerBundle | null, members: Facility[]): Covenant[] {
  const covenants = bundle?.covenants?.covenants ?? [];
  const loanIds = new Set(members.map((f) => f.loanId).filter(Boolean));
  return covenants.filter((c) => {
    const attached = c.attachedLoans;
    // Absent or empty attachment is relationship level, which the package reads.
    if (!attached || !attached.length) return true;
    return attached.some((a) => a.loanId && loanIds.has(a.loanId));
  });
}

/** The org's own stage, turned into the strip's Booked / Proposal tag — and only
 *  where every member carries one. Where stages are not staged the room says
 *  "stage not staged" rather than calling an unknown member Booked (W4). */
function memberTag(f: Facility, staged: boolean): { tag: string; proposed: boolean } {
  if (!staged) return { tag: "Stage not staged", proposed: true };
  const stage = (f.stage ?? "").trim();
  if (!stage) return { tag: "Stage not staged", proposed: true };
  return { tag: stage, proposed: stage.toLowerCase() !== "booked" };
}

function toPackageMember(f: Facility, relationship: string, staged: boolean): PackageMember {
  const { tag, proposed } = memberTag(f, staged);
  const drawn = pct(f.outstanding, f.committed);
  const detail = [
    typeof f.outstanding === "number" ? `${fmtMoney(f.outstanding)} outstanding` : null,
    typeof f.interestRate === "number" ? `${f.interestRate}%` : null,
    f.maturityDate ? `matures ${fmtDate(f.maturityDate)}` : null,
    f.riskGrade ? `grade ${f.riskGrade}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  // THE CHIP SAYS THE PRODUCT, and the amount beside it tells two of the same
  // product apart. nCino names a loan "<Borrower> - <Product> - <$Amount>", so
  // the full short label would print the figure twice and spend six of law 3's
  // sixty words per member. The whole name is on the member card in the peek.
  const label = facilityProduct(f, relationship);
  return {
    key: label,
    short: label,
    tag,
    product: facilityProduct(f, relationship),
    amount: typeof f.committed === "number" ? `$${MM(f.committed).toFixed(1)}MM` : "—",
    detail: detail || "No terms staged on this member",
    utilisation: drawn ?? undefined,
    available: typeof f.available === "number" ? `${fmtMoney(f.available)} available` : undefined,
    proposed,
  };
}

/* --------------------------------------------------------------- the deltas */

const GROUP_KIND: Record<string, string> = {
  "loan-terms": "Term change",
  "loan-other": "Term change",
  package: "Package change",
  covenant: "Covenant",
  collateral: "Security",
  party: "Borrowing structure",
  pricing: "Pricing",
  fee: "Fee",
  exception: "Policy exception",
};

/** The word the chip leads with. A REMOVAL says so first, because it is the one
 *  entry in a change set that takes something away. */
const OP_KIND: Record<string, string> = { add: "Add", remove: "Remove", change: "" };

function valueLabel(value: ParsedValue | null): string {
  if (!value) return "as described";
  switch (value.kind) {
    case "currency":
      return fmtMoney(value.amount);
    case "percent":
      return `${value.rate}%`;
    case "months":
      return `${value.months} months`;
    case "date":
      return fmtDate(value.iso);
    default:
      return value.text;
  }
}

/** What the member reads at TODAY for this field, from the live bundle. This is
 *  both the chip's "before" and the basis a drift recompute checks. */
function currentValue(field: CatalogField, facility: Facility | null): string {
  if (!facility) return "not set";
  switch (field.id) {
    case "loan.amount":
      return typeof facility.committed === "number" ? fmtMoney(facility.committed) : "not staged";
    case "loan.interestRate":
      return typeof facility.interestRate === "number" ? `${facility.interestRate}%` : "not staged";
    case "loan.maturityDate":
      return facility.maturityDate ? fmtDate(facility.maturityDate) : "not staged";
    case "loan.termMonths":
      return "not staged in this read";
    default:
      return "today's value is not staged in this read";
  }
}

const WIRE_VALUE: Record<WireKey, (v: ParsedValue) => number | string | null> = {
  requestedAmount: (v) => (v.kind === "currency" ? v.amount : null),
  requestedRate: (v) => (v.kind === "percent" ? v.rate : null),
  requestedTermMonths: (v) => (v.kind === "months" ? v.months : null),
  requestedMaturityDate: (v) => (v.kind === "date" ? v.iso : null),
};

function toDelta(a: Amendment, relationship: string, seq: number): WorkroomDelta {
  const { field, facility, value, op } = a;
  const target = facility
    ? shortFacilityLabel(facility, relationship) || facility.loanId || "the facility"
    : field.category === "party"
      ? (a.party ?? "the borrowing structure")
      : "the product package";
  // AGAINST THE ROLL-OVER BASELINE. The clone carries the parent's whole record
  // graph, so an ADD starts from "not on the facility" and a REMOVE ends there;
  // only a change has two values to show.
  const after = op === "remove" ? "off the modification" : valueLabel(value);
  const before =
    op === "add"
      ? "not on the facility today"
      : field.category === "party" || field.category === "fee" || field.type === "record"
        ? "carried over from the parent"
        : currentValue(field, facility);

  const fileable = isFileable(field) && facility?.loanId !== undefined && value !== null;
  const wire =
    fileable && field.wireKey && value
      ? (() => {
          const v = WIRE_VALUE[field.wireKey!](value);
          return v === null ? undefined : { key: field.wireKey!, value: v, facilityId: facility!.loanId! };
        })()
      : undefined;

  const committedDeltaMM =
    wire?.key === "requestedAmount" && typeof facility?.committed === "number" && typeof wire.value === "number"
      ? MM(wire.value - facility.committed)
      : undefined;

  return {
    id: `${field.id}:${facility?.loanId ?? a.party ?? "package"}:${seq}`,
    group: field.group,
    op,
    kind: [OP_KIND[op], GROUP_KIND[field.category] ?? "Change"].filter(Boolean).join(" "),
    // A removal is the destructive one, and it carries the refusal tone whether
    // or not a tool files it: the banker must never mistake it for an addition.
    kindTone: op === "remove" ? "refusal" : wire ? undefined : "refusal",
    badge: wire ? `${field.label} → ${after}` : `${OP_KIND[op] || "Change"} ${field.label.toLowerCase()} · handed off`,
    title: field.label,
    target,
    before,
    after,
    member: facility?.loanId,
    committedDeltaMM,
    map: [
      ["Object", field.object],
      ["Field", field.apiName ?? "not established on this org — a live describe supplies it"],
      [
        "Written as",
        wire
          ? `${field.apiName} on the modification clone. The booked facility is untouched.`
          : "Nothing. No tool files this today; it travels as a handoff on the filed summary.",
      ],
    ],
    fields: field.apiName ? [`${field.object}.${field.apiName}`] : [field.object],
    caveat: wire ? undefined : field.gap,
    filed: {
      recordId: wire ? "assigned by the org on execution" : "not filed",
      verification: wire ? "Re-queried on the clone after the write" : "Handed off — nothing was written",
    },
    fileable: Boolean(wire),
    wire,
    // Only a FILEABLE entry carries a basis: drift is the check that a figure
    // reaching the org has not moved, and a handoff sends no figure.
    basis: wire && facility?.loanId ? { facilityId: facility.loanId, fieldId: field.id, before } : undefined,
    handoff: wire ? undefined : { reason: field.gap ?? "No tool files this today.", closes: field.closes },
    // The chain a create must carry. Held on the delta so the plan cannot be
    // composed without it: a create with no junctions never becomes steps.
    chainLinks: op === "add" ? chainFor(field) : undefined,
  };
}

/* ------------------------------------------------------------- the refusals */

/** Asks that are real, understood, and NOT this room's to file — each with the
 *  org's own reason. A refusal is an answer; a fabricated chip is not. */
function refusalFor(field: CatalogField): WorkroomRefusal | null {
  if (field.id === "covenant.complianceStatus" || field.id === "collateral.valuation") {
    return {
      id: field.id,
      target: field.label,
      title: `${field.label} is its own credit action`,
      reason: field.gap ?? "",
      detail: `${field.gap ?? ""} ${field.closes ?? ""}`.trim(),
    };
  }
  if (field.id === "loan.stage" || field.id === "package.stage") {
    return {
      id: field.id,
      target: field.label,
      title: "Booking is nCino's own approval run",
      reason: field.gap ?? "",
      detail: `${field.gap ?? ""} ${field.closes ?? ""}`.trim(),
    };
  }
  return null;
}

/* ---------------------------------------------------------------- the engine */

export interface ModifyEngineDeps {
  stage?: (payload: StagePayloads["loan-modification"]) => Promise<ToolOutcome<StagedOutput>>;
  execute?: (payload: {
    idempotencyKey: string;
    stagingId: string;
    planHash: string;
    decisionToken: string;
    approverUserId: string;
  }) => Promise<ToolOutcome<ExecuteResult>>;
  /** Restates a line in the catalog's vocabulary. Never authors a delta. */
  restate?: (line: string, vocabulary: string[]) => Promise<string | null>;
  available?: () => boolean;
  newKey?: () => string;
}

const defaultDeps: Required<Omit<ModifyEngineDeps, "restate">> & Pick<ModifyEngineDeps, "restate"> = {
  stage: (payload) => stageAction("loan-modification", payload),
  execute: (payload) => executeAction("loan-modification", payload),
  available: mcpAvailable,
  newKey: newRequestId,
  restate: async (line, vocabulary) => {
    // ONE call, lean payload, and the answer is a SENTENCE rather than a
    // structure: the artifact-to-connector bridge burns on machine-shaped
    // payloads (structured tripped at ask 2, prose lasted 15), and a
    // restatement goes back through the deterministic parser anyway.
    const prompt =
      "Rewrite this banker instruction using only these amendment words, keeping every number, name and date exactly as written. " +
      "Reply with the rewritten instruction and nothing else. If it is not an amendment to a loan or a package, reply NONE.\n" +
      `Words: ${vocabulary.join(", ")}\nInstruction: ${line}`;
    try {
      const res = await callTool(SERVERS.gateway, TOOLS.llm, { prompt }, { read: true });
      const text = unwrapLlm(res.payload).text.trim();
      return !text || /^none$/i.test(text) ? null : text;
    } catch {
      // A gateway that is down is not a parse failure the banker should read as
      // one: the deterministic path already answered, and this was the assist.
      return null;
    }
  },
};

export function createModifyEngine(args: {
  context: WorkroomContext;
  data: C360Data;
  bundle: BorrowerBundle | null;
  deps?: ModifyEngineDeps;
}): WorkroomEngine {
  const { context, data, bundle } = args;
  const deps = { ...defaultDeps, ...args.deps };

  const relationship = (bundle?.snapshot?.name ?? context.accountName ?? "").trim();
  const members = packageMembers(bundle, context.productPackageId);
  const stagesStaged = facilityStagesStaged(bundle);
  const booked = bookedFacilities(bundle).filter((f) => members.some((m) => m.loanId === f.loanId));
  const covenants = packageCovenantRows(bundle, members);
  const entities = (bundle?.graph?.legalEntities ?? []).filter(
    (e) => !context.productPackageId || !e.packageId || e.packageId === context.productPackageId,
  );
  const committed = members.reduce((sum, f) => sum + (typeof f.committed === "number" ? f.committed : 0), 0);
  const request = (bundle?.requests ?? [])[0];

  const parseContext: ParseContext = { facilities: members, booked, relationship, entities };

  const suggestions = buildSuggestions();
  let suggestionIndex = 0;
  let staged: StagedWorkroomPlan | null = null;
  let stagedDeltas: WorkroomDelta[] = [];
  /** The stage key, reused by the execute pair — that pairing is what the proven
   *  round trip used, and what makes a replay idempotent rather than a double. */
  let idempotencyKey: string | null = null;
  const spent = new Set<string>();

  /* ------------------------------------------------------------ suggestions */

  function askFacility(): Facility | null {
    const name = request?.ask?.facilityName?.toLowerCase();
    if (name) {
      const hit = members.find((f) => (f.name ?? "").toLowerCase().includes(name));
      if (hit) return hit;
    }
    const from = request?.ask?.from;
    if (typeof from === "number") {
      const matches = members.filter((f) => f.committed === from);
      if (matches.length === 1) return matches[0];
    }
    return null;
  }

  function buildSuggestions(): string[] {
    const out: string[] = [];
    const target = askFacility() ?? booked[0] ?? null;

    // 1. THE CLIENT'S OWN ASK, where the read carries one. It is the natural
    //    first move and it is fileable.
    if (request?.ask?.to && target) {
      out.push(`Increase the ${shortFacilityLabel(target, relationship)} to ${fmtMoney(request.ask.to)}`);
    } else if (target) {
      // NO ASK, NO FIGURE. With a client request the pill carries the client's
      // own number; without one the room will not invent a target commitment
      // to make a pill clickable. It names the member and the field, the parse
      // asks what it should become, and the banker's answer is the number.
      out.push(`Increase the ${shortFacilityLabel(target, relationship)}`);
    }

    // 2. THE THINNEST COVENANT, where one is staged. It composes as a covenant
    //    amendment, which this room manifests and hands off honestly.
    const thin = covenants
      .filter((c) => typeof c.thresholdValue === "number" && typeof c.actualValue === "number")
      .sort((a, b) => Math.abs((a.actualValue ?? 0) - (a.thresholdValue ?? 0)) - Math.abs((b.actualValue ?? 0) - (b.thresholdValue ?? 0)))[0];
    if (thin?.covenantType) {
      out.push(`Add a covenant on the ${thin.covenantType.toLowerCase()} test`);
    }

    // 3. THE BORROWING STRUCTURE, FROM THE HOUSEHOLD FIRST (founder directive
    //    2026-08-27). W1 asks for add/remove of legal entities, and the entity
    //    a banker means is almost always one already around the relationship —
    //    a related company in the ownership graph, or a guarantor on another
    //    member. An unrelated entity is the explicit alternative, not the
    //    default, so the room offers the household and says the other door is
    //    open rather than asking an open question.
    const related = household().find((h) => !h.onDeal);
    const guarantor = entities.find((e) => (e.borrowerType ?? "").toLowerCase().includes("guarantor"));
    if (related) out.push(`Add ${related.name} as a guarantor`);
    else if (guarantor?.accountName) out.push(`Add ${guarantor.accountName} as a guarantor`);

    return out;
  }

  /* ------------------------------------------------------------------ brief */

  function haveRows(): HaveRow[] {
    const rows: HaveRow[] = [
      {
        label: "Package position",
        value: `${members.length} ${members.length === 1 ? "member" : "members"} · ${fmtMoney(committed)} committed`,
        detail: [
          bundle?.snapshot?.packageStage ? `Stage ${bundle.snapshot.packageStage}` : null,
          bundle?.snapshot?.primaryRiskRating ? `risk rating ${bundle.snapshot.primaryRiskRating}` : null,
          `${booked.length} of ${members.length} booked, which is what a credit action requires`,
          stagesStaged ? null : "Facility stages are not staged in this read, so booked cannot be confirmed on every member",
        ]
          .filter(Boolean)
          .join(" · "),
      },
    ];

    if (covenants.length) {
      const compliant = covenants.filter((c) => (c.latestComplianceStatus ?? c.covenantStatus ?? "").toLowerCase() === "compliant");
      rows.push({
        label: "Covenants",
        value: `${covenants.length} on the package · ${compliant.length} compliant`,
        detail:
          covenants
            .slice(0, 4)
            .map((c) => `${c.covenantType ?? "covenant"} ${c.actualValue ?? "?"} against ${c.thresholdValue ?? "?"}`)
            .join("; ") || "No thresholds staged",
      });
    }

    const lendable = bundle?.exposure?.totalUniqueCollateralLendableValue;
    if (typeof lendable === "number") {
      rows.push({
        label: "Collateral pool",
        value: `${fmtMoney(lendable)} lendable`,
        detail: `Across ${bundle?.exposure?.uniqueCollateralCount ?? "an unstated number of"} distinct collateral records. Coverage is the org's own computation over the distinct pool, never a sum of facility shares.`,
      });
    }

    const maturing = members.filter((f) => f.maturityDate).sort((a, b) => (a.maturityDate! < b.maturityDate! ? -1 : 1));
    if (maturing.length) {
      rows.push({
        label: "Maturities",
        value: `Next ${fmtDate(maturing[0].maturityDate)}`,
        detail: maturing
          .slice(0, 4)
          .map((f) => `${shortFacilityLabel(f, relationship)} ${fmtDate(f.maturityDate)}`)
          .join("; "),
      });
    }

    if (entities.length) {
      const roles = entities.reduce<Record<string, number>>((acc, e) => {
        const role = e.borrowerType ?? "Unstated role";
        acc[role] = (acc[role] ?? 0) + 1;
        return acc;
      }, {});
      rows.push({
        label: "Borrowing structure",
        value: `${entities.length} involvement ${entities.length === 1 ? "row" : "rows"}`,
        detail: Object.entries(roles)
          .map(([role, n]) => `${role} ×${n}`)
          .join("; "),
      });
    }

    rows.push(...rollOverRows());
    return rows;
  }

  /* ------------------------------------------------------- roll-over baseline

     A modification does not start from nothing: nCino clones the facility and
     the clone CARRIES the parent's record graph — its covenant junctions, its
     collateral pledges, its borrowing structure, its fees, its pricing streams.
     Every amendment is a delta against that, so the room has to show it, and it
     has to be honest about the two halves it cannot read.                     */

  function rollOverRows(): HaveRow[] {
    const target = askFacility() ?? booked[0] ?? null;
    if (!target) return [];
    const name = shortFacilityLabel(target, relationship) || "the facility";
    const junctions = target.loanCovenants ?? [];
    const pledges = target.collateral ?? [];
    const parties = entities.filter((e) => !e.loanId || e.loanId === target.loanId);

    const rows: HaveRow[] = [
      {
        label: `What ${name} carries onto the clone`,
        value: [
          `${junctions.length} covenant ${junctions.length === 1 ? "junction" : "junctions"}`,
          `${pledges.length} ${pledges.length === 1 ? "pledge" : "pledges"}`,
          `${parties.length} involvement ${parties.length === 1 ? "row" : "rows"}`,
        ].join(" · "),
        detail:
          "A modification clones the facility and the clone carries this graph with it. Everything here is KEPT unless the manifest says otherwise, which is why a removal is a change like any other and reads as one.",
      },
    ];

    if (junctions.length) {
      rows.push({
        label: "Covenants on the facility",
        value: junctions.map((j) => j.covenantType ?? j.name ?? "covenant").join(", "),
        detail: "Loan-level junctions. nCino clones the junction, not the covenant, and its own guidance says a business process must decide what happens to each one.",
      });
    }
    if (pledges.length) {
      rows.push({
        label: "Pledged to the facility",
        value: pledges
          .map((c) => `${c.collateralName ?? c.collateralType ?? "collateral"}${typeof c.amountPledged === "number" ? ` ${fmtMoney(c.amountPledged)}` : ""}`)
          .join(", "),
        detail: pledges
          .map((c) =>
            [
              c.collateralName,
              typeof c.advanceRate === "number" ? `${c.advanceRate}% advance` : null,
              c.lienPosition ? `${c.lienPosition} lien` : null,
              c.pledgedStatus,
            ]
              .filter(Boolean)
              .join(" · "),
          )
          .join("; "),
      });
    }
    if (parties.length) {
      rows.push({
        label: "Who is on the facility",
        value: parties.map((e) => `${e.accountName ?? "entity"} (${e.borrowerType ?? "role unstated"})`).join(", "),
        detail:
          "The borrowing structure rolls onto the clone. Adding or removing an entity is a change against THIS list, and the household below is where a new one usually comes from.",
      });
    }

    // THE TWO HALVES NO READ COVERS. Saying "0 fees" would be a claim the
    // cockpit cannot make: the six detail reads fetch neither fees nor pricing
    // streams, so the room says it cannot see them rather than that they are
    // not there.
    rows.push({
      label: "Not in this read",
      value: "Fees and pricing streams",
      detail:
        "The cockpit's six detail reads carry no fee rows and no pricing streams, so what the clone would carry on those two is not shown here. Both are named in the gap analysis, and this org holds no fee records at all.",
    });

    return rows;
  }

  /** THE HOUSEHOLD. Who is already around this relationship — the entities on
   *  the deal and the ownership graph behind it — because a borrower a banker
   *  adds is almost always one of them. */
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

  function sources(): SourceChip[] {
    const have = haveRows();
    const pick = (label: string) => have.filter((r) => r.label === label);
    const out: SourceChip[] = [
      { id: "package", label: "Package", kicker: "What the package holds today", icon: "package", have: pick("Package position") },
    ];
    if (pick("Covenants").length) out.push({ id: "covenants", label: "Covenants", kicker: "Covenants on this package", icon: "covenants", have: pick("Covenants") });
    if (pick("Collateral pool").length) out.push({ id: "collateral", label: "Collateral", kicker: "The collateral pool", icon: "collateral", have: pick("Collateral pool") });
    if (pick("Maturities").length) out.push({ id: "maturities", label: "Maturities", kicker: "What matures next", icon: "calendar", have: pick("Maturities") });
    if (pick("Borrowing structure").length) out.push({ id: "entities", label: "Entities", kicker: "Who is on the deal", icon: "account", have: pick("Borrowing structure") });
    if (request) {
      out.push({
        id: "email",
        label: "Client request",
        kicker: `Received ${fmtDate(request.receivedAt) || "recently"}`,
        icon: "email",
        have: [
          {
            label: request.channel ? `Client request · ${request.channel}` : "Client request",
            value: request.ask?.to ? `${fmtMoney(request.ask.from)} → ${fmtMoney(request.ask.to)}` : (request.status ?? "open"),
            detail: request.summary ?? "No summary staged on the request.",
          },
        ],
      });
    }
    return out;
  }

  function why(): WhyRow[] {
    const rows: WhyRow[] = [
      {
        label: "The package",
        detail: `${members.length} ${members.length === 1 ? "member" : "members"}, ${fmtMoney(committed)} committed, ${booked.length} booked. A modification runs against a booked facility; anything else the org refuses outright.`,
      },
    ];
    const drawn = bundle?.exposure?.totalOutstanding;
    if (typeof drawn === "number") {
      rows.push({
        label: "Drawn",
        detail: `${fmtMoney(drawn)} outstanding across the relationship${pct(drawn, committed) !== null ? `, ${pct(drawn, committed)}% of the committed total` : ""}.`,
      });
    }
    if (typeof bundle?.exposure?.coverageRatio === "number") {
      rows.push({
        label: "Collateral coverage",
        detail: `${bundle.exposure.coverageRatio.toFixed(2)}x, computed by the org over the distinct collateral pool. The cockpit never re-derives it from the facility rows.`,
      });
    }
    const summary = catalogSummary();
    rows.push({
      label: "What this room can file",
      detail: `${summary.fileable} of ${summary.total} indexed amendments file through stage_loan_modification — amount, maturity date, rate and term, applied to the clone. The rest are staged into the manifest and handed off with the reason.`,
    });
    return rows;
  }

  function position(): string {
    const target = askFacility() ?? booked[0] ?? members[0] ?? null;
    // NOTHING BOOKED IS THE HEADLINE when it is true: a client ask the room
    // cannot act on is the second fact, not the first.
    if (!booked.length) {
      return `This package holds ${members.length} ${members.length === 1 ? "member" : "members"} and none of them is booked, so there is nothing here a credit action can modify.`;
    }
    if (request?.ask?.to && target) {
      const drawn = pct(target.outstanding, target.committed);
      return `The client has asked to take ${shortFacilityLabel(target, relationship) || "the facility"} from ${fmtMoney(request.ask.from ?? target.committed)} to ${fmtMoney(request.ask.to)}${drawn !== null ? `, on a line ${drawn}% drawn` : ""}.`;
    }
    // THE STRIP ALREADY SAYS the member count and the committed total, so the
    // one sentence in the room says what the strip cannot: how much of the
    // package a credit action can actually reach.
    if (booked.length === members.length) {
      return `Every member is booked and open to a modification.`;
    }
    return `${booked.length} of ${members.length} members are booked and open to a modification; the rest cannot carry a credit action.`;
  }

  function brief(): WorkroomBrief {
    const compliant = covenants.filter(
      (c) => (c.latestComplianceStatus ?? c.covenantStatus ?? "").toLowerCase() === "compliant",
    ).length;
    return {
      packageName: context.packageName,
      baselineCommittedMM: MM(committed),
      baselineMembers: members.length,
      showsMembers: members.length > 0,
      covenantFigure: covenants.length ? `${compliant}/${covenants.length}` : "—",
      loadSteps: ["Reading the package", "Facilities and collateral", "Covenants and structure", "Ready"],
      // THE PIN IS THE ASK, or nothing. With no client request it used to
      // repeat the committed figure the strip is already showing two inches
      // above it — a third printing of one number, and three of law 3's sixty
      // words spent saying nothing new.
      askPin: request?.ask?.to !== undefined ? `${fmtMoney(request.ask.from)} → ${fmtMoney(request.ask.to)}` : "",
      position: position(),
      sources: sources(),
      why: why(),
      whyCaveat:
        "Recommendation only. Nothing is written until the single approval, and the approval redeems one use of one token. The agent recommends, the banker decides.",
      composeTarget: Math.max(1, suggestions.length),
      members: members.map((f) => toPackageMember(f, relationship, stagesStaged)),
      have: haveRows(),
    };
  }

  /* -------------------------------------------------- association awareness

     FOUNDER LAW 1 (2026-08-27): before a create is proposed, look at what is
     already associated with the facility. A covenant of the same kind already
     attached is not a second covenant by default — it is a choice between
     amending the one that is there and deliberately adding another. Duplicate
     prevention is a VALIDATION here and in stagePlan, never a UI nicety.      */

  function associated(field: CatalogField, facility: Facility | null): string[] {
    switch (field.associationScope) {
      case "loan-covenants":
        return (facility?.loanCovenants ?? []).map((j) => j.covenantType ?? j.name ?? "").filter(Boolean);
      case "pledges":
        return (facility?.collateral ?? []).map((c) => c.collateralName ?? c.collateralType ?? "").filter(Boolean);
      case "parties":
        return entities
          .filter((e) => !e.loanId || !facility?.loanId || e.loanId === facility.loanId)
          .map((e) => e.accountName ?? "")
          .filter(Boolean);
      case "fees":
        // No read tool carries fee rows, and this org holds none. "Nothing
        // associated" is therefore what the room knows, not what it assumes.
        return [];
      default:
        return [];
    }
  }

  /** Words that make a second one deliberate rather than accidental. */
  const DELIBERATE_SECOND = /\b(second|another|additional|extra|as well|too|on top)\b/;

  /**
   * THE AMEND-OR-ADD QUESTION.
   *
   * It fires only when the banker's own line NAMES something already carried
   * onto the clone — matched on the association's significant words, so "the
   * fixed charge test" finds "Fixed Charge Coverage". A create that names
   * something new is not a duplicate and is not questioned; a create that names
   * what is already there is a choice the banker has to make, and making it
   * silently either way is the failure this prevents.
   */
  function duplicateQuestion(a: Amendment, said: string): string | null {
    if (a.op !== "add" || !a.field.associationScope) return null;
    const lower = said.toLowerCase();
    if (DELIBERATE_SECOND.test(lower)) return null;

    const hit = associated(a.field, a.facility).find((existing) => {
      const name = existing.toLowerCase();
      if (name && lower.includes(name)) return true;
      const words = name.split(/[^a-z0-9]+/).filter((w) => w.length > 3);
      return words.length > 1 && words.filter((w) => lower.includes(w)).length >= 2;
    });
    if (!hit) return null;

    return `${hit} is already on ${
      a.facility ? shortFacilityLabel(a.facility, relationship) : "this deal"
    }, and a modification carries it onto the clone. Change it, or say "add a second" and I will stage a new one beside it.`;
  }

  /* ------------------------------------------------------------ parseIntent */

  function toResult(outcome: ReturnType<typeof parseModify>, seq: number, said: string): IntentResult | null {
    if (outcome.kind === "clarify") return { kind: "unparsed", reply: outcome.question };
    if (outcome.kind === "none") return null;

    // A refusal beats a chip: an ask that belongs to another credit action is
    // answered with the reason rather than staged into this plan.
    for (const a of outcome.amendments) {
      const refusal = refusalFor(a.field);
      if (refusal) {
        return {
          kind: "refusal",
          reply: `That one is not mine to file. ${refusal.title}.`,
          refusal,
        };
      }
    }

    // ASSOCIATION-AWARE FIRST. A create that names something already carried
    // onto the clone is a question, not a chip.
    for (const a of outcome.amendments) {
      const question = duplicateQuestion(a, said);
      if (question) return { kind: "unparsed", reply: question };
    }

    const deltas = outcome.amendments.map((a, i) => toDelta(a, relationship, seq + i));
    const fileable = deltas.filter((d) => d.fileable).length;
    const handed = deltas.length - fileable;
    const reply = [
      fileable ? `${fileable} of these ${deltas.length === 1 ? "goes" : "go"} on the clone.` : null,
      handed
        ? `${handed} ${handed === 1 ? "is" : "are"} staged for the record and handed off: no tool files ${handed === 1 ? "it" : "them"} today, and I will not pretend otherwise.`
        : null,
    ]
      .filter(Boolean)
      .join(" ");
    return { kind: "deltas", reply: reply || "Here is what that becomes.", deltas };
  }

  let deltaSeq = 0;
  /** The question the room last asked, so the next line can answer it. */
  let awaiting: { field: CatalogField; facility: Facility | null } | null = null;

  async function parseIntent(text: string): Promise<IntentResult> {
    // AN ANSWER TO THE LAST QUESTION comes first: "$20,000,000" is a complete
    // reply to "what should the commitment become", and reading it as a new
    // instruction would lose both the field and the member.
    if (awaiting) {
      const answered = parseAnswer(awaiting, text);
      if (answered) {
        const result = toResult(answered, deltaSeq, text);
        if (result) {
          awaiting = answered.kind === "clarify" ? (answered.awaiting ?? awaiting) : null;
          if (result.kind === "deltas") deltaSeq += 8;
          return result;
        }
      }
    }

    const parsed = parseModify(text, parseContext);
    awaiting = parsed.kind === "clarify" ? (parsed.awaiting ?? null) : null;
    const direct = toResult(parsed, deltaSeq, text);
    if (direct) {
      deltaSeq += 8;
      suggestionIndex = Math.min(suggestionIndex + 1, suggestions.length);
      return direct;
    }

    // THE ASSIST, and its whole job is vocabulary. It restates the line in the
    // catalog's words and the deterministic parser reads THAT; nothing the
    // gateway says becomes a chip without passing the same validation.
    if (deps.restate && deps.available()) {
      const vocabulary = [...new Set(brief().members.map((m) => m.short))].concat(
        "commitment",
        "interest rate",
        "maturity date",
        "term",
        "covenant",
        "pledge",
        "guarantor",
        "fee",
      );
      const restated = await deps.restate(text, vocabulary);
      if (restated) {
        const second = toResult(parseModify(restated, parseContext), deltaSeq, restated);
        if (second) {
          deltaSeq += 8;
          suggestionIndex = Math.min(suggestionIndex + 1, suggestions.length);
          return second;
        }
      }
    }

    return {
      kind: "unparsed",
      reply:
        "I could not read an amendment in that. Name the member and what should change — commitment, rate, maturity or term file on the clone; covenants, collateral, entities and fees I will stage and hand off honestly.",
    };
  }

  /* -------------------------------------------------------------- stagePlan */

  /** The ordered plan (W1). The org's own steps carry the order — credit action,
   *  verify the clone, apply the changes — and the handoffs are appended before
   *  the booking handoff, which is where "this needs the clone and has no tool"
   *  belongs in the reading. */
  function withHandoffs(plan: StagedOutput, handed: WorkroomDelta[]): StagedOutput {
    if (!handed.length) return plan;
    // CONNECTED CREATION, NEVER ORPHANS (founder law 2). A create is not one
    // step: it is the record AND the junction chain that ties it to the deal,
    // in order, each link verified before the next runs. The plan shows that
    // chain even where no tool runs it, because a banker signing a change set
    // is owed what filing it would actually take — and because a chain written
    // here is a chain the Apex extension has to implement.
    const steps: PlanStep[] = [];
    handed.forEach((d, i) => {
      const chain = d.chainLinks ?? [];
      steps.push({
        id: `handoff_${i}`,
        type: "handoff",
        // No record id in a label: a plan that carries one reads as a plan that
        // already wrote (A33.5.3), and the fence checks every string.
        label: `HANDOFF: ${d.title} on ${d.target} — ${d.handoff?.reason ?? "no tool files this today"}`,
      });
      chain.forEach((link, j) => {
        steps.push({
          id: `handoff_${i}_chain_${j}`,
          type: "handoff",
          label: `${j + 1}. ${link.label} (${link.object} via ${link.via})${link.note ? ` — ${link.note}` : ""}`,
        });
      });
    });
    const at = plan.steps.findIndex((s) => s.id === "held_execution");
    const merged = at === -1 ? [...plan.steps, ...steps] : [...plan.steps.slice(0, at), ...steps, ...plan.steps.slice(at)];
    return {
      ...plan,
      steps: merged,
      warnings: [
        ...plan.warnings,
        `${handed.length} staged ${handed.length === 1 ? "entry is" : "entries are"} handed off rather than filed: no deployed tool writes ${handed.length === 1 ? "it" : "them"}. The filed summary names each one and why.`,
      ],
    };
  }

  /** ONE scalar per wire key, applied to every selected facility — the tool's own
   *  semantic. Two members needing different amounts is not one plan, and the
   *  room says so rather than filing the wrong figure on one of them. */
  function wirePayload(fileable: WorkroomDelta[], rationale: string): StagePayloads["loan-modification"] {
    const byKey = new Map<WireKey, Set<number | string>>();
    for (const d of fileable) {
      if (!d.wire) continue;
      // The delta carries the key as a plain string so `types.ts` stays free of
      // the catalog; this is the one place it is read back as the wire key.
      const key = d.wire.key as WireKey;
      const set = byKey.get(key) ?? new Set<number | string>();
      set.add(d.wire.value);
      byKey.set(key, set);
    }
    for (const [key, values] of byKey) {
      if (values.size > 1) {
        throw new WorkroomRefusalError(
          `${key} travels as ONE value applied to every facility in the plan, and this manifest asks for ${values.size} different ones. Remove all but one and stage the rest as a second modification.`,
        );
      }
    }

    const facilityIds = [...new Set(fileable.map((d) => d.wire!.facilityId))];
    const one = (key: WireKey) => [...(byKey.get(key) ?? [])][0];
    return {
      idempotencyKey: idempotencyKey!,
      rationale,
      facilityIds,
      productPackageId: context.productPackageId,
      requestedAmount: (one("requestedAmount") as number | undefined) ?? null,
      requestedMaturityDate: (one("requestedMaturityDate") as string | undefined) ?? null,
      requestedTermMonths: (one("requestedTermMonths") as number | undefined) ?? null,
      requestedRate: (one("requestedRate") as number | undefined) ?? null,
    };
  }

  async function stagePlan(deltas: WorkroomDelta[]): Promise<StagedWorkroomPlan> {
    if (!deps.available()) {
      throw new WorkroomRefusalError(
        "This view has no connector, so there is no org to stage against. Nothing here is simulated: the plan is the org's or there is no plan.",
      );
    }
    if (!context.productPackageId) {
      throw new WorkroomRefusalError(
        "A modification is anchored on the product package, and this relationship stages none. There is nothing to modify.",
      );
    }

    const fileable = deltas.filter((d) => d.fileable && d.wire);
    const handed = deltas.filter((d) => !d.fileable);
    if (!fileable.length) {
      throw new WorkroomRefusalError(
        handed.length
          ? `Nothing in this manifest files. All ${handed.length} ${handed.length === 1 ? "entry needs" : "entries need"} a tool that is not deployed, and staging a plan with no change is a plan that does nothing. Add a commitment, rate, maturity or term change, or take the handoff list to the person who can action it.`
          : "Nothing is staged, so there is no plan to build.",
      );
    }

    idempotencyKey = idempotencyKey ?? deps.newKey();
    const rationale = `${RATIONALE_PREFIX}: ${fileable.map((d) => `${d.title} to ${d.after} on ${d.target}`).join("; ")}.`;
    const outcome = await deps.stage(wirePayload(fileable, rationale));
    if (!outcome.ok) {
      // The org's own words. A refusal here is a precondition the banker can act
      // on, and paraphrasing it has already cost one live session.
      idempotencyKey = null;
      throw new WorkroomRefusalError(outcome.error.message);
    }

    const plan = withHandoffs(outcome.result, handed);
    staged = {
      plan,
      planHash: plan.planHash,
      stagingId: plan.stagingId,
      decisionToken: plan.decisionToken ?? null,
    };
    stagedDeltas = deltas;
    return staged;
  }

  /* ---------------------------------------------------------------- execute */

  /** The ConfirmGate recompute, on the figures THIS manifest was composed
   *  against. A plan never executes against numbers the banker did not see. */
  function drift(): string[] {
    const current = packageMembers(bundle, context.productPackageId);
    const moved: string[] = [];
    for (const d of stagedDeltas) {
      if (!d.basis) continue;
      const facility = current.find((f) => f.loanId === d.basis!.facilityId);
      if (!facility) {
        moved.push(`${d.target} is no longer staged on this package.`);
        continue;
      }
      const field = { id: d.basis.fieldId } as CatalogField;
      const now = currentValue(field, facility);
      if (now !== d.basis.before) moved.push(`${d.title} on ${d.target} was ${d.basis.before}, and now reads ${now}.`);
    }
    return moved;
  }

  async function execute(approval: WorkroomApproval): Promise<WorkroomExecution> {
    if (!staged) throw new WorkroomRefusalError("Nothing has been staged, so there is no plan to execute.");
    if (approval.planHash !== staged.planHash || approval.stagingId !== staged.stagingId) {
      throw new WorkroomRefusalError("The plan changed after you confirmed it, so the confirmation no longer applies.");
    }
    if (spent.has(approval.decisionToken)) throw new WorkroomRefusalError("This confirmation has already been used.");

    const violations = validatePlan(staged.plan.steps);
    if (violations.length) {
      throw new WorkroomRefusalError(
        `This plan cannot be confirmed: ${violations.map((v) => `step ${v.stepId}: ${v.reason}`).join("; ")}.`,
      );
    }
    const leaks = assertNoRecordIds(staged.plan);
    if (leaks.length) throw new WorkroomRefusalError(`This plan cannot be confirmed: ${leaks.join("; ")}.`);
    if (staged.plan.executionHeld) {
      throw new WorkroomRefusalError(staged.plan.heldReason ?? "The org holds execution of this plan.");
    }

    const moved = drift();
    if (moved.length) {
      throw new WorkroomRefusalError(
        `The figures moved under this manifest, so it cannot be filed as it stands. ${moved.join(" ")} Remove the affected entries and say them again; I will restage on what the org reads now.`,
      );
    }

    // The org checks this against the RUNNING IDENTITY before it redeems the
    // token, and a display name fails that check with nothing written. The room
    // resolves the id itself rather than trusting the name it renders.
    const approverUserId = resolveApproverUserId(data.meta);
    if (!approverUserId) {
      throw new WorkroomRefusalError(
        "This view has no Salesforce user id for the signed-in identity, and the org will not file a record without one.",
      );
    }
    const token = staged.decisionToken;
    if (!token) {
      throw new WorkroomRefusalError("This plan carries no confirmation token from the staging call, so it cannot be executed.");
    }

    const outcome = await deps.execute({
      idempotencyKey: idempotencyKey ?? staged.stagingId,
      stagingId: staged.stagingId,
      planHash: staged.planHash,
      decisionToken: token,
      approverUserId,
    });
    if (!outcome.ok) throw new WorkroomRefusalError(outcome.error.message);
    spent.add(approval.decisionToken);

    const result = outcome.result;
    const perFacility = new Map((result.facilities ?? []).map((f) => [f.facilityId, f]));
    const verified = (result.steps ?? []).filter((s) => s.state === "verified").length;

    const filed = stagedDeltas
      .filter((d) => d.fileable && d.wire)
      .map((d) => {
        const row = perFacility.get(d.wire!.facilityId);
        const cloneId = row?.cloneLoanId ?? result.cloneLoanId;
        return {
          deltaId: d.id,
          // REAL ids, from the org's own response. A missing clone id is a
          // verification that did not confirm, and it says so.
          recordId: cloneId ?? "the org did not name the clone",
          verification:
            [row?.appliedChanges, row?.verification, row?.junctionName ? `Chain row ${row.junctionName}` : null]
              .filter(Boolean)
              .join(" ") || result.outcome,
        };
      });

    const handoffs = stagedDeltas
      .filter((d) => !d.fileable)
      .map((d) => ({
        deltaId: d.id,
        title: `${d.title} · ${d.target}`,
        reason: d.handoff?.reason ?? "No tool files this today.",
        closes: d.handoff?.closes,
      }));

    return {
      filed,
      tokenNote: `Token redeemed by ${approval.approverUserId} · single use · ${verified} of ${result.steps?.length ?? 0} plan steps verified by the tool's own re-query${result.replayed ? " · replayed, nothing was written twice" : ""}`,
      // The org's sentence about what booking requires, verbatim. It is the
      // org's account of its own process, not ours to paraphrase.
      handoff: result.bookingHandoff,
      handoffs,
      reply: {
        subject: `${relationship || context.accountName}: modification staged`,
        lede: result.outcome,
        body: [
          `${filed.length} ${filed.length === 1 ? "change" : "changes"} filed against the modification of ${context.packageName}.`,
          ...filed.map((f) => `- ${stagedDeltas.find((d) => d.id === f.deltaId)?.title}: ${f.verification}`),
          handoffs.length
            ? `\n${handoffs.length} ${handoffs.length === 1 ? "item was" : "items were"} recorded on the modification but not filed, because no tool writes ${handoffs.length === 1 ? "it" : "them"} today:\n` +
              handoffs.map((h) => `- ${h.title}: ${h.reason}`).join("\n")
            : "",
          result.bookingHandoff ? `\n${result.bookingHandoff}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      },
    };
  }

  return {
    mode: "modify",
    scripted: false,
    brief,
    suggest: () => suggestions[suggestionIndex] ?? null,
    parseIntent,
    stagePlan,
    execute,
  };
}
