import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Portal } from "./Portal";
import { isTopmost, pushModal } from "./modalStack";
import { ConfirmGate } from "./ConfirmGate";
import { useApp } from "../state/appState";
import { staggerDelay } from "../data/motion";
import { fmtDate, fmtMoney } from "../data/format";
import { TYPE_LABEL } from "../data/onboarding";
import { mcpAvailable, type McpFailure } from "../channel/mcp";
import { searchMailboxRaw, type MailHit } from "../channel/cockpitTools";
import {
  CLAIMED_PROVENANCE,
  CREATE_PROSPECT_ACTION,
  INTENT_LABEL,
  NOTHING_EXTRACTED,
  PRODUCT_LINE_CAVEAT,
  PROSPECT_CASE_TYPES,
  applyExtraction,
  buildProspectPlan,
  emptyDraft,
  extractProspect,
  indicativeProductLines,
  observedCountries,
  observedEntityForms,
  observedIndustries,
  observedPartyRoles,
  ownershipReadout,
  stepGaps,
  type DraftParty,
  type ProspectDraft,
  type ProspectField,
} from "../actions/prospectIntake";
import type { StagedOutput } from "../actions/stagedPlan";

/* =============================================================================
   THE NEW-ONBOARDING WIZARD

   The one flow in this cockpit that STARTS something. It wears the ticket's
   chrome exactly — same portal, same scrim, same panel box, same stepper rail,
   same step transition, same terminal gate — because a banker should not have to
   learn a second modal to open a file.

   IT IS ITS OWN COMPONENT, and the reason is the stepper. The ticket's Stepper
   is a one-way rail over the `Phase` union: two or three phases, and only the
   plan step may walk back, because once a plan is filed there is nothing to walk
   back to. An intake wizard is the opposite shape — six steps, nothing filed,
   and a banker who has typed four owners must be able to jump back to the entity
   name without losing them. So the rail below is the ticket's markup with the
   ticket's doctrine inverted where the doctrine does not apply, rather than the
   ticket's component bent until it fits.

   THE MAIL PATH IS REAL. It calls `outlook_email_search` through the same
   connector seam the sync sweep uses, reads the result with the same envelope
   unwrapper, and extracts with the same deterministic reader. What it never does
   is invent a hit: no connector, no authorisation, or no matches all land on a
   calm empty state with the manual path one click away.
   ============================================================================= */

type Step = "origin" | "entity" | "parties" | "intent" | "review" | "plan";

const STEPS: Array<{ id: Step; label: string }> = [
  { id: "origin", label: "Origin" },
  { id: "entity", label: "Entity" },
  { id: "parties", label: "Parties" },
  { id: "intent", label: "Intent" },
  { id: "review", label: "Review" },
  { id: "plan", label: "Plan" },
];

/* ------------------------------------------------------------- primitives */

/** The provenance stamp, in the badge grammar the screening rows already use:
 *  a fact ABOUT the value, sitting on the value, never a status pill. */
function ClaimedMark({ shown }: { shown: boolean }) {
  if (!shown) return null;
  return (
    <span
      data-claimed="true"
      className="ml-2 inline-flex flex-none items-center rounded bg-wash-2 px-1.5 py-0.5 align-middle text-[9px] font-bold uppercase tracking-wide text-ink-label"
      title={`${CLAIMED_PROVENANCE}. Nothing here has been verified.`}
    >
      Claimed
    </span>
  );
}

function Field({
  label,
  claimed,
  help,
  children,
}: {
  label: string;
  claimed?: boolean;
  help?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-center text-[11px] font-semibold text-ink-label">
        {label}
        <ClaimedMark shown={claimed === true} />
      </span>
      {children}
      {help && (
        <span className="text-[11px] leading-relaxed text-ink-faint" style={{ textWrap: "pretty" as never }}>
          {help}
        </span>
      )}
    </label>
  );
}

const INPUT =
  "w-full rounded-md border border-border-strong bg-raised px-2.5 py-1.5 text-[12.5px] text-ink placeholder:text-ink-faint focus:outline-none";

/** Free text with observed suggestions. A datalist, not a select: the staged
 *  book is a sample of an org, never its value set (A33.1.6's spirit). */
function SuggestInput({
  value,
  onChange,
  options,
  placeholder,
  listId,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder: string;
  listId: string;
}) {
  return (
    <>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        list={options.length ? listId : undefined}
        className={INPUT}
      />
      {options.length > 0 && (
        <datalist id={listId}>
          {options.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      )}
    </>
  );
}

/** One block of a step, staggered in behind the step transition. */
function Block({ index, children }: { index: number; children: ReactNode }) {
  return (
    <div className="c360-row-in" style={{ animationDelay: staggerDelay(index, 40, 200) }}>
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------- step 1 */

function OriginCard({
  selected,
  title,
  body,
  onPick,
}: {
  selected: boolean;
  title: string;
  body: string;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onPick}
      className="c360-press flex-1 rounded-[12px] border px-4 py-3.5 text-left"
      style={{
        borderColor: selected ? "var(--accent)" : "var(--border-strong)",
        background: selected ? "var(--accent-wash)" : "var(--surface-raised)",
      }}
    >
      <span className="block text-[13px] font-bold" style={{ color: selected ? "var(--accent)" : "var(--ink)" }}>
        {title}
      </span>
      <span className="mt-1 block text-[11.5px] leading-relaxed text-ink-muted" style={{ textWrap: "pretty" as never }}>
        {body}
      </span>
    </button>
  );
}

function MailSearch({ onPick }: { onPick: (hit: MailHit) => void }) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<MailHit[] | null>(null);
  const [failure, setFailure] = useState<McpFailure | null>(null);
  const [searching, setSearching] = useState(false);
  const available = mcpAvailable();

  async function run() {
    const q = query.trim();
    if (!q || searching) return;
    setSearching(true);
    setFailure(null);
    try {
      const { hits: found } = await searchMailboxRaw(q);
      setHits(found);
    } catch (e) {
      // Already normalised by the connector layer, already carrying the ONE
      // action that fixes this state. Nothing is invented in its place.
      setFailure(e as McpFailure);
      setHits(null);
    } finally {
      setSearching(false);
    }
  }

  if (!available) {
    return (
      <div data-mail-state="no-connector" className="rounded-[10px] border border-dashed border-border-strong bg-wash px-4 py-3">
        <div className="text-[12.5px] font-semibold text-ink-body">No mailbox is connected to this view</div>
        <p className="mt-1 text-[11.5px] leading-relaxed text-ink-muted" style={{ textWrap: "pretty" as never }}>
          Microsoft 365 is not reachable from this cockpit session, so there is nothing to search. Manual entry opens the
          same case.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-md border border-border-strong bg-raised px-2.5 py-1.5">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="flex-none text-ink-faint">
            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.6" />
            <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <input
            value={query}
            aria-label="Search your mailbox for the inquiry"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void run();
              }
            }}
            placeholder="Search your inbox for the inquiry…"
            className="w-full bg-transparent text-[12.5px] text-ink placeholder:text-ink-faint focus:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={() => void run()}
          disabled={searching || !query.trim()}
          className="c360-btn flex-none rounded-md px-3.5 py-1.5 text-[12px] font-semibold disabled:opacity-40"
          style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
        >
          {searching ? "Searching…" : "Search"}
        </button>
      </div>

      {failure && (
        <div data-mail-state="failed" className="rounded-[10px] px-3.5 py-3" style={{ background: "var(--warning-bg)" }}>
          <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--warning)" }}>
            The mailbox did not answer
          </div>
          <p className="mt-1.5 text-[12px] leading-relaxed" style={{ color: "var(--warning-prose)" }}>
            {failure.fix}
          </p>
          <p className="mt-1.5 text-[11.5px] leading-relaxed" style={{ color: "var(--warning-prose)" }}>
            Manual entry opens the same case, with the same plan.
          </p>
        </div>
      )}

      {hits !== null && hits.length === 0 && !failure && (
        <div data-mail-state="empty" className="rounded-[10px] border border-dashed border-border-strong bg-wash px-4 py-3">
          <div className="text-[12.5px] font-semibold text-ink-body">Nothing in your inbox matches that</div>
          <p className="mt-1 text-[11.5px] leading-relaxed text-ink-muted" style={{ textWrap: "pretty" as never }}>
            That is an honest empty result, not a failure. Try another term, or open the case by hand.
          </p>
        </div>
      )}

      {hits !== null && hits.length > 0 && (
        <div data-mail-state="hits" className="overflow-hidden rounded-[10px] border border-border">
          {hits.map((h, i) => (
            <button
              key={h.id ?? `${h.subject}-${i}`}
              type="button"
              onClick={() => onPick(h)}
              className="c360-row-in c360-row block w-full border-b border-divider px-3.5 py-2.5 text-left last:border-b-0"
              style={{ animationDelay: staggerDelay(i) }}
            >
              <span className="block truncate text-[12.5px] font-bold text-ink">{h.subject ?? "Client message"}</span>
              <span className="mt-0.5 block truncate text-[11.5px] text-ink-muted">
                {[h.from, fmtDate(h.receivedAt ?? null)].filter(Boolean).join(" · ")}
              </span>
              {h.preview && <span className="mt-0.5 block truncate text-[11px] text-ink-faint">{h.preview}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ shell */

export function NewOnboardingWizard({ onClose }: { onClose: () => void }) {
  const { data } = useApp();
  const panelRef = useRef<HTMLDivElement>(null);
  const layerId = useId();
  const listId = useId();

  const [step, setStep] = useState<Step>("origin");
  const [draft, setDraft] = useState<ProspectDraft>(emptyDraft);
  const [plan, setPlan] = useState<StagedOutput | null>(null);
  const [extractedNothing, setExtractedNothing] = useState(false);

  useEffect(() => pushModal(layerId), [layerId]);
  useEffect(() => panelRef.current?.focus({ preventScroll: true }), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !isTopmost(layerId)) return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose, layerId]);

  const industries = useMemo(() => observedIndustries(data), [data]);
  const countries = useMemo(() => observedCountries(data), [data]);
  const roles = useMemo(() => observedPartyRoles(data), [data]);
  const forms = useMemo(() => observedEntityForms(data), [data]);
  const products = useMemo(() => indicativeProductLines(), []);
  const ownership = ownershipReadout(draft.parties);

  const index = STEPS.findIndex((s) => s.id === step);
  const set = (patch: Partial<ProspectDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const claimed = (key: ProspectField) => draft.claimed.includes(key);

  const gaps = step === "review" || step === "plan" ? [] : stepGaps(draft, step);

  function pickHit(hit: MailHit) {
    const x = extractProspect(hit);
    setDraft((d) => applyExtraction(d, hit, x));
    setExtractedNothing(x.filled.length === 0);
    setStep("entity");
  }

  function advance() {
    if (gaps.length) return;
    if (step === "review") {
      setPlan(buildProspectPlan(draft));
      setStep("plan");
      return;
    }
    setStep(STEPS[Math.min(index + 1, STEPS.length - 1)].id);
  }

  return (
    <Portal>
      <div
        className="fixed inset-0 flex items-center justify-center p-4"
        style={{ zIndex: "var(--z-modal)", background: "var(--scrim)" }}
        onClick={onClose}
        role="presentation"
      >
        <div
          ref={panelRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label="New onboarding"
          onClick={(e) => e.stopPropagation()}
          className="c360-panel-in relative flex max-h-[86vh] w-full max-w-[680px] flex-col overflow-hidden rounded-[18px] bg-raised"
          style={{ boxShadow: "var(--shadow-panel)", border: "1px solid var(--border)", transformOrigin: "center" }}
        >
          <div className="flex flex-none items-start gap-3 border-b border-divider px-5 py-4">
            <div className="min-w-0 flex-1">
              <h2 className="text-[17px] font-extrabold tracking-tight text-ink">New onboarding</h2>
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-body" style={{ textWrap: "pretty" as never }}>
                Opens a prospect account and the case that tracks its KYC. Everything a client told you is recorded as a
                claim; nothing on this flow verifies anything.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="c360-press flex h-8 w-8 flex-none items-center justify-center rounded-[9px] border border-border text-ink-muted hover:text-ink"
            >
              <svg width="14" height="14" viewBox="0 0 15 15" aria-hidden="true">
                <path d="M4 4l7 7M11 4l-7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {/* The rail. Ticket markup; a completed step walks back, because
              nothing on this flow has been filed and the work is all still here. */}
          <div className="flex flex-none items-center gap-1.5 border-b border-divider px-5 py-2">
            {STEPS.map((s, i) => {
              const here = i === index;
              const done = i < index;
              return (
                <span key={s.id} className="flex items-center gap-1.5">
                  {i > 0 && (
                    <span className="text-[10px] text-ink-faint" aria-hidden="true">
                      /
                    </span>
                  )}
                  {done ? (
                    <button
                      type="button"
                      onClick={() => setStep(s.id)}
                      className="c360-press rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-ink-muted hover:text-ink"
                    >
                      {s.label}
                    </button>
                  ) : (
                    <span
                      aria-current={here ? "step" : undefined}
                      className="px-1.5 py-0.5 text-[11px] font-semibold"
                      style={{ color: here ? "var(--accent)" : "var(--ink-faint)" }}
                    >
                      {s.label}
                    </span>
                  )}
                </span>
              );
            })}
          </div>

          <div key={step} className="c360-step-in min-h-0 flex-1 overflow-auto">
            {step === "origin" && (
              <div className="flex flex-col gap-4 px-5 py-4">
                <Block index={0}>
                  <div className="kicker mb-2">Where is this coming from</div>
                  <div role="radiogroup" aria-label="Case origin" className="flex flex-wrap gap-3">
                    <OriginCard
                      selected={draft.origin === "email"}
                      title="From client email"
                      body="Search your own mailbox for the inquiry and prefill what the message states. Everything found is a claim, marked as one."
                      onPick={() => set({ origin: "email" })}
                    />
                    <OriginCard
                      selected={draft.origin === "manual"}
                      title="Manual entry"
                      body="Open the case from what you already know. The plan is identical; only the recorded intake source differs."
                      onPick={() => set({ origin: "manual", claimed: [], source: undefined })}
                    />
                  </div>
                </Block>

                {draft.origin === "email" && (
                  <Block index={1}>
                    <MailSearch onPick={pickHit} />
                  </Block>
                )}
              </div>
            )}

            {step === "entity" && (
              <div className="flex flex-col gap-4 px-5 py-4">
                {draft.source && (
                  <Block index={0}>
                    <div className="rounded-[10px] border border-dashed border-border-strong bg-wash px-4 py-3">
                      <div className="kicker mb-1">Prefilled from email</div>
                      <div className="text-[12.5px] font-semibold text-ink-body">{draft.source.subject}</div>
                      <div className="mt-0.5 text-[11.5px] text-ink-muted">
                        {[draft.source.from, fmtDate(draft.source.receivedAt ?? null)].filter(Boolean).join(" · ")}
                      </div>
                      <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-faint" style={{ textWrap: "pretty" as never }}>
                        {extractedNothing
                          ? NOTHING_EXTRACTED
                          : `${CLAIMED_PROVENANCE}. Marked fields are what the prospect said, not what the bank has checked.`}
                        {draft.statedIntent && ` Read as a request for ${INTENT_LABEL[draft.statedIntent]}.`}
                      </p>
                    </div>
                  </Block>
                )}

                <Block index={1}>
                  <div className="grid gap-3.5 sm:grid-cols-2">
                    <Field label="Legal name" claimed={claimed("legalName")}>
                      <input
                        value={draft.legalName}
                        onChange={(e) => set({ legalName: e.target.value })}
                        placeholder="As it appears on the register"
                        className={INPUT}
                      />
                    </Field>
                    <Field label="Entity type" claimed={claimed("entityForm")} help="Legal forms seen in the staged book.">
                      <SuggestInput
                        value={draft.entityForm}
                        onChange={(v) => set({ entityForm: v })}
                        options={forms}
                        placeholder="LLC, GmbH, Corp…"
                        listId={`${listId}-form`}
                      />
                    </Field>
                    <Field label="Industry / NAICS" help="Suggestions are the industries this book already carries.">
                      <SuggestInput
                        value={draft.industry}
                        onChange={(v) => set({ industry: v })}
                        options={industries}
                        placeholder="Industry or NAICS description"
                        listId={`${listId}-industry`}
                      />
                    </Field>
                    <Field label="Country">
                      <SuggestInput
                        value={draft.country}
                        onChange={(v) => set({ country: v })}
                        options={countries}
                        placeholder="Jurisdiction of incorporation"
                        listId={`${listId}-country`}
                      />
                    </Field>
                    <Field label="Contact" claimed={claimed("contact")}>
                      <input
                        value={draft.contact}
                        onChange={(e) => set({ contact: e.target.value })}
                        placeholder="Who you have been speaking to"
                        className={INPUT}
                      />
                    </Field>
                  </div>
                </Block>
              </div>
            )}

            {step === "parties" && (
              <div className="flex flex-col gap-4 px-5 py-4">
                <Block index={0}>
                  <div className="kicker mb-1">Owners and guarantors</div>
                  <p className="text-[11.5px] leading-relaxed text-ink-muted" style={{ textWrap: "pretty" as never }}>
                    What the prospect has told you so far. Every line is unconfirmed by construction — an ownership edge
                    becomes a fact when a document proves it, which is due-diligence work, not intake work.
                  </p>
                </Block>

                <Block index={1}>
                  <div className="flex flex-col gap-2.5">
                    {draft.parties.map((p, i) => (
                      <div key={p.id} className="flex flex-wrap items-end gap-2.5 border-t border-divider pt-2.5">
                        <div className="min-w-[150px] flex-1">
                          <Field label={`Party ${i + 1}`}>
                            <input
                              value={p.name}
                              aria-label={`Party ${i + 1} name`}
                              onChange={(e) => set({ parties: patchParty(draft.parties, p.id, { name: e.target.value }) })}
                              placeholder="Name"
                              className={INPUT}
                            />
                          </Field>
                        </div>
                        <div className="min-w-[130px] flex-1">
                          <Field label="Role">
                            <SuggestInput
                              value={p.role}
                              onChange={(v) => set({ parties: patchParty(draft.parties, p.id, { role: v }) })}
                              options={roles}
                              placeholder="Owner, Guarantor…"
                              listId={`${listId}-role`}
                            />
                          </Field>
                        </div>
                        <div className="w-[92px]">
                          <Field label="Ownership %">
                            <input
                              value={p.ownershipPercent === null ? "" : String(p.ownershipPercent)}
                              aria-label={`Party ${i + 1} ownership percent`}
                              inputMode="decimal"
                              onChange={(e) =>
                                set({ parties: patchParty(draft.parties, p.id, { ownershipPercent: toPercent(e.target.value) }) })
                              }
                              placeholder="—"
                              className={`${INPUT} tnum text-right`}
                            />
                          </Field>
                        </div>
                        <button
                          type="button"
                          onClick={() => set({ parties: draft.parties.filter((x) => x.id !== p.id) })}
                          className="c360-press mb-1 rounded-md border border-border px-2.5 py-1.5 text-[11.5px] font-medium text-ink-muted hover:text-ink"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </Block>

                <Block index={2}>
                  <div className="flex flex-wrap items-center gap-3 border-t border-divider pt-3">
                    <button
                      type="button"
                      onClick={() => set({ parties: [...draft.parties, newParty(draft.parties.length)] })}
                      className="c360-press c360-accent-btn rounded-[8px] px-3 py-1.5 text-[11.5px] font-semibold"
                    >
                      Add a party
                    </button>
                    <span
                      data-ownership-sum={ownership.total}
                      className="min-w-[200px] flex-1 text-[11.5px] leading-relaxed"
                      style={{ color: ownership.off ? "var(--warning-prose)" : "var(--ink-muted)", textWrap: "pretty" as never }}
                    >
                      {ownership.line}
                    </span>
                  </div>
                </Block>
              </div>
            )}

            {step === "intent" && (
              <div className="flex flex-col gap-4 px-5 py-4">
                <Block index={0}>
                  <Field label="Case type" help="LLC_BI__Type__c, in the org's own vocabulary.">
                    <div className="flex flex-wrap gap-2">
                      {PROSPECT_CASE_TYPES.map((t) => {
                        const on = draft.caseType === t;
                        return (
                          <button
                            key={t}
                            type="button"
                            aria-pressed={on}
                            onClick={() => set({ caseType: t })}
                            className="c360-press rounded-[8px] border px-3 py-1.5 text-[12px] font-semibold"
                            style={{
                              borderColor: on ? "var(--accent)" : "var(--border-strong)",
                              background: on ? "var(--accent-wash)" : "transparent",
                              color: on ? "var(--accent)" : "var(--ink-body)",
                            }}
                          >
                            {TYPE_LABEL[t]}
                          </button>
                        );
                      })}
                    </div>
                  </Field>
                </Block>

                <Block index={1}>
                  <Field label="Target product line" help={PRODUCT_LINE_CAVEAT}>
                    <SuggestInput
                      value={draft.productLine}
                      onChange={(v) => set({ productLine: v })}
                      options={products}
                      placeholder="What they are asking about"
                      listId={`${listId}-product`}
                    />
                  </Field>
                </Block>

                <Block index={2}>
                  <Field label="Why this case is being opened">
                    <textarea
                      value={draft.rationale}
                      aria-label="Why this case is being opened"
                      onChange={(e) => set({ rationale: e.target.value })}
                      rows={3}
                      placeholder="In your own words. Recorded against the case."
                      className={`${INPUT} resize-none leading-relaxed`}
                    />
                  </Field>
                </Block>
              </div>
            )}

            {step === "review" && (
              <div className="flex flex-col gap-4 px-5 py-4">
                {/* The ticket's briefing grammar: a subject card that names the
                    thing and its context, then the proposal as prose. */}
                <Block index={0}>
                  <div className="rounded-[12px] bg-wash px-4 py-3">
                    <div className="text-[15px] font-extrabold tracking-tight text-ink">
                      Open onboarding for {draft.legalName.trim() || "the prospect"}
                    </div>
                    <div className="mt-0.5 text-[11.5px] text-ink-muted">
                      {[
                        draft.caseType ? TYPE_LABEL[draft.caseType] : "type not chosen",
                        draft.industry || null,
                        draft.country || null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                </Block>

                <Block index={1}>
                  <p className="text-[13px] leading-relaxed text-ink-body" style={{ textWrap: "pretty" as never }}>
                    This opens {draft.legalName.trim() || "the prospect"}
                    {draft.entityForm ? `, ${draft.entityForm},` : ""} as a prospect account and files the onboarding case
                    that will carry its KYC.{" "}
                    {draft.origin === "email"
                      ? "It came in through a client message, and everything read out of that message is recorded as a claim."
                      : "It was opened by the desk, and the intake provenance records that rather than a client submission."}{" "}
                    {draft.parties.length
                      ? `${draft.parties.length} ${draft.parties.length === 1 ? "party is" : "parties are"} listed, none confirmed. `
                      : "No parties are listed yet. "}
                    {draft.amount !== null ? `The stated ask is ${fmtMoney(draft.amount)}.` : ""}
                  </p>
                </Block>

                <Block index={2}>
                  <div className="kicker mb-2">What is on the case</div>
                  <dl className="grid grid-cols-[minmax(120px,auto)_1fr] gap-x-4 gap-y-1.5 text-[12px]">
                    {reviewRows(draft).map(([k, v, isClaimed]) => (
                      <span key={k} className="contents">
                        <dt className="text-ink-muted">{k}</dt>
                        <dd className="font-medium text-ink">
                          {v}
                          <ClaimedMark shown={isClaimed === true} />
                        </dd>
                      </span>
                    ))}
                  </dl>
                </Block>

                {ownership.off && (
                  <Block index={3}>
                    <div className="rounded-[10px] px-3.5 py-3" style={{ background: "var(--warning-bg)" }}>
                      <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--warning)" }}>
                        Ownership does not close
                      </div>
                      <p className="mt-1.5 text-[12px] leading-relaxed" style={{ color: "var(--warning-prose)" }}>
                        {ownership.line}
                      </p>
                    </div>
                  </Block>
                )}
              </div>
            )}

            {step === "plan" && plan && (
              <ConfirmGate
                plan={plan}
                actionId={CREATE_PROSPECT_ACTION.id}
                simulated={false}
                pendingGate={CREATE_PROSPECT_ACTION}
                onGateDismiss={onClose}
                onBack={() => setStep("review")}
                onConfirmed={() => undefined}
              />
            )}
          </div>

          {step !== "plan" && (
            <div className="flex flex-none items-center gap-3 border-t border-divider px-5 py-3">
              <div className="flex-1 text-[11px] leading-relaxed text-ink-muted">
                {gaps.length ? gaps.join(" ") : step === "review" ? "Nothing is filed from here — the next screen is the plan." : ""}
              </div>
              {index > 0 && (
                <button
                  type="button"
                  onClick={() => setStep(STEPS[index - 1].id)}
                  className="c360-press rounded-md border border-border px-3 py-1.5 text-[12px] font-medium text-ink-muted hover:text-ink"
                >
                  Back
                </button>
              )}
              <button
                type="button"
                onClick={advance}
                disabled={gaps.length > 0}
                className="c360-btn rounded-md px-3.5 py-1.5 text-[12px] font-semibold disabled:opacity-40"
                style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
              >
                {step === "review" ? "Review the plan" : "Continue"}
              </button>
            </div>
          )}
        </div>
      </div>
    </Portal>
  );
}

/* ------------------------------------------------------------------ helpers */

function newParty(n: number): DraftParty {
  return { id: `party-${n}-${Math.random().toString(36).slice(2, 8)}`, name: "", role: "", ownershipPercent: null };
}

function patchParty(parties: DraftParty[], id: string, patch: Partial<DraftParty>): DraftParty[] {
  return parties.map((p) => (p.id === id ? { ...p, ...patch } : p));
}

/** A percent, or null when the banker has not stated one. A field they cleared
 *  is an absent figure, never a zero — zero would make the sum lie. */
function toPercent(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function reviewRows(draft: ProspectDraft): Array<[string, string, boolean?]> {
  const rows: Array<[string, string, boolean?]> = [
    ["Legal name", draft.legalName.trim() || "—", draft.claimed.includes("legalName")],
    ["Entity type", draft.entityForm || "—", draft.claimed.includes("entityForm")],
    ["Industry", draft.industry || "—"],
    ["Country", draft.country || "—"],
    ["Contact", draft.contact || "—", draft.claimed.includes("contact")],
    ["Case type", draft.caseType ? TYPE_LABEL[draft.caseType] : "—"],
    ["Product line", draft.productLine ? `${draft.productLine} (indicative)` : "—"],
    ["Parties", draft.parties.length ? draft.parties.map((p) => `${p.name || "unnamed"}${p.role ? ` (${p.role})` : ""}`).join(", ") : "none listed"],
  ];
  if (draft.amount !== null) rows.push(["Stated ask", fmtMoney(draft.amount), draft.claimed.includes("amount")]);
  if (draft.statedIntent)
    rows.push([
      "Stated request",
      `A request for ${INTENT_LABEL[draft.statedIntent]}`,
      draft.claimed.includes("intent"),
    ]);
  if (draft.rationale.trim()) rows.push(["Rationale", draft.rationale.trim()]);
  return rows;
}
