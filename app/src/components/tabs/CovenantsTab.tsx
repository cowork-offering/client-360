import { useState, type ReactNode } from "react";
import type { BorrowerBundle, Covenant, CovenantChallenge } from "../../data/contract";
import { fmtDate } from "../../data/format";
import {
  covenantCushion,
  fmtCovThreshold,
  fmtCovVal,
  STATUS,
  type Tone,
} from "../../data/finance";
import {
  ADMINISTRATIVE_EXCEPTION_NOTE,
  administrativeExceptions,
  classifyCovenant,
  financialBreaches,
  severityTone,
} from "../../domain/covenantStatus";
import { Card, SectionHead, GapChip, EmptyState, NoteCaption, StatCell, StatDivider, StatStrip } from "../ui";
import { Pulse } from "../Pulse";
import { groupCovenants } from "../../data/collateralRecords";
import { staggerDelay, useEnterTransition } from "../../data/motion";

const EXPLAIN =
  "Explain these covenants: which is tightest, and how much cushion is left.";

/* Seven columns. STATUS is the seventh and it is not decoration: without it the
   table showed a covenant's arithmetic and hid nCino's own verdict, which is
   how an administrative Exception ended up indistinguishable from a clean row
   (NCINO-PROCESS-ALIGNMENT-DRAFT, D15). */
const COV_COLS = "1.5fr 0.85fr 0.95fr 0.85fr 1.05fr 0.95fr 1.1fr";

function challengeView(ch: CovenantChallenge, type?: string): { tone: Tone; label: string } {
  const bi = ch.boomImplied ?? null;
  const val = bi && bi.value != null ? fmtCovVal(bi.value, type) : null;
  if (ch.status === "not-computable" || !bi || val === null) {
    return { tone: "neutral", label: "not computable — " + (ch.note ? String(ch.note) : "inputs unavailable") };
  }
  if (ch.breachRiskFlag === true) {
    return { tone: "red", label: `Boom-implied ${val} crosses threshold ${fmtCovVal(ch.threshold, type)}` };
  }
  if (ch.status === "diverges") {
    return { tone: "amber", label: `Boom-implied ${val} · diverges from nCino ${fmtCovVal(ch.nCinoActual, type)}` };
  }
  return { tone: "green", label: `Boom-implied ${val} · corroborates` };
}

function EffectiveChallenge({ ch, type }: { ch?: CovenantChallenge; type?: string }) {
  const [open, setOpen] = useState(false);
  if (!ch) return null;
  const { tone, label } = challengeView(ch, type);
  const bi = ch.boomImplied ?? null;
  const detail = bi && (bi.formula || bi.inputs != null || bi.period);
  const dot = <span className="h-1.5 w-1.5 flex-none rounded-full" style={{ background: STATUS[tone].fg }} />;

  return (
    <div className="col-span-full mt-1 flex flex-wrap items-center gap-2 pt-1">
      <span className="text-[10.5px] font-bold uppercase tracking-wider text-ink-faint">Effective challenge</span>
      {detail ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="c360-press inline-flex items-center gap-1.5 rounded-[7px] px-2.5 py-1 text-[11px] font-bold"
          style={{ background: STATUS[tone].bg, color: STATUS[tone].fg }}
        >
          {dot}
          {label}
          <span className="text-[9px]" style={{ transform: open ? "rotate(180deg)" : undefined }}>▾</span>
        </button>
      ) : (
        <span
          className="c360-press inline-flex items-center gap-1.5 rounded-[7px] px-2.5 py-1 text-[11px] font-bold"
          style={{ background: STATUS[tone].bg, color: STATUS[tone].fg }}
        >
          {dot}
          {label}
        </span>
      )}
      {detail && open && (
        <div className="col-span-full mt-1 w-full rounded-[8px] bg-wash px-3 py-2 text-[11.5px] text-ink-body">
          {bi?.formula && <div><span className="font-bold text-ink-body-strong">Formula </span>{bi.formula}</div>}
          {bi?.period && <div><span className="font-bold text-ink-body-strong">Period </span>{bi.period}</div>}
        </div>
      )}
    </div>
  );
}

/** The column names, once. Both covenant sections render the SAME six columns
 *  under the SAME header: a facility-scoped covenant is not a lesser covenant,
 *  and values under nothing are values nobody can read (validation audit
 *  2026-07-27, finding 2). */
function CovenantHeader() {
  return (
    <div
      data-cov-header
      className="grid gap-3.5 px-6 py-2 text-[10.5px] font-bold uppercase tracking-wider text-ink-faint"
      style={{ gridTemplateColumns: COV_COLS }}
    >
      <span>Covenant</span><span className="text-right">Actual</span><span className="text-right">Threshold</span><span className="text-right">Cushion</span><span>Headroom</span><span>Next test</span><span>Status</span>
    </div>
  );
}

/** One covenant, in full. ONE definition, so the relationship table and the
 *  facility groups cannot drift apart again. */
function CovenantRow({
  cov,
  challenge,
  entered,
  index,
}: {
  cov: Covenant;
  challenge?: CovenantChallenge;
  entered: boolean;
  index: number;
}) {
  const cush = covenantCushion(cov.covenantType, cov.actualValue, cov.thresholdValue);
  const verdict = classifyCovenant(cov);
  const status = STATUS[severityTone(verdict.severity)];
  const barColor = status.fg;
  const next = cov.nextEvaluationDate
    ? fmtDate(cov.nextEvaluationDate)
    : cov.daysUntilNextEvaluation != null
      ? `${Math.round(cov.daysUntilNextEvaluation)} days`
      : "—";

  return (
    <div
      data-cov-row
      className="c360-row-in c360-datarow grid items-center gap-3.5 border-t border-divider px-6 py-3.5 text-[13px]"
      style={{ gridTemplateColumns: COV_COLS, animationDelay: staggerDelay(index) }}
    >
      <span className="font-semibold">{cov.covenantType ?? "Covenant"}</span>
      <span className="tnum text-right font-bold">
        <Pulse id={`covenant.${cov.covenantId}.actualValue`}>{fmtCovVal(cov.actualValue, cov.covenantType)}</Pulse>
      </span>
      <span className="tnum text-right text-ink-label">
        <Pulse id={`covenant.${cov.covenantId}.thresholdValue`}>
          {fmtCovThreshold(cov.covenantType, cov.actualValue, cov.thresholdValue)}
        </Pulse>
      </span>
      <span className="tnum text-right font-bold" style={{ color: barColor }}>
        {cush.cushion != null
          ? `${cush.cushion < 0 ? "−" : ""}${fmtCovVal(Math.abs(cush.cushion), cov.covenantType)}`
          : "—"}
      </span>
      <div className="h-1.5 overflow-hidden rounded-[6px]" style={{ background: "var(--border)" }}>
        <div
          className="c360-meter-x h-full w-full rounded-[6px]"
          style={{ transform: `scaleX(${!entered || cush.safe === false ? 0 : cush.pct / 100})`, background: barColor }}
        />
      </div>
      <span
        className="justify-self-start whitespace-nowrap rounded-[6px] px-2.5 py-1 text-[11px] font-bold text-ink-body"
        style={{ background: "var(--wash-2)" }}
      >
        {next}
      </span>
      {/* nCino's own verdict, in nCino's own words, with what it means on hover. */}
      <span
        data-cov-status
        data-cov-status-kind={verdict.kind}
        title={verdict.explanation}
        className="justify-self-start whitespace-nowrap rounded-[6px] px-2.5 py-1 text-[11px] font-bold"
        style={{ background: status.bg, color: status.fg }}
      >
        {verdict.label}
      </span>
      <EffectiveChallenge ch={challenge} type={cov.covenantType} />
    </div>
  );
}

/** The warning banner shape, once. Both covenant callouts are the same object
 *  with different words, so they cannot drift apart. */
function Callout({
  kicker,
  children,
  ...rest
}: { kicker: string; children: ReactNode } & Record<`data-${string}`, string>) {
  return (
    <div className="flex items-start gap-3.5 rounded-[14px] px-5 py-4" style={{ background: "var(--warning-bg)" }} {...rest}>
      <svg width="20" height="20" viewBox="0 0 20 20" className="mt-px flex-none" style={{ color: "var(--warning)" }}>
        <path d="M10 2L1 17.5h18z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M10 8v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="10" cy="14.6" r=".9" fill="currentColor" />
      </svg>
      <div>
        <div className="mb-1 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--warning)" }}>{kicker}</div>
        <div className="text-[14px] font-medium leading-relaxed" style={{ color: "var(--warning-prose)" }}>{children}</div>
      </div>
    </div>
  );
}

function DataQualityCallout({ bundle }: { bundle: BorrowerBundle }) {
  // Effective-challenge notes are the covenant-tab's data-quality callouts; the
  // standing-vs-contractual caveat renders once from the first challenge entry.
  const note = bundle.covenantChallenge?.find((c) => c.note)?.note;
  if (!note) return null;
  return (
    <Card className="px-6 py-4">
      <div className="kicker mb-1.5">Data-quality note</div>
      <div className="text-[12.5px] leading-relaxed text-ink-body" style={{ textWrap: "pretty" as never }}>
        {note}
      </div>
    </Card>
  );
}

export function CovenantsTab({ bundle }: { bundle: BorrowerBundle }) {
  const entered = useEnterTransition();
  const covs: Covenant[] = bundle.covenants?.covenants ?? [];
  const grade = bundle.snapshot?.primaryRiskRating;
  const challengeById = new Map<string, CovenantChallenge>();
  for (const ch of bundle.covenantChallenge ?? []) if (ch.covenantId) challengeById.set(ch.covenantId, ch);

  const groups = groupCovenants(covs);
  // TWO callouts, never one. A measured miss is credit deterioration; an
  // administrative Exception is a missing document. Merging them was the defect.
  const breached = financialBreaches(covs);
  const exceptions = administrativeExceptions(covs);

  return (
    <div className="flex flex-col gap-4">
      <SectionHead kicker="Risk & Covenants" explain={EXPLAIN} />

      {/* stat strip: rating live, PD/migration = gap chip */}
      <StatStrip className="items-center">
        <StatCell label="Risk rating" value={grade != null ? `Grade ${grade}` : "—"} sub="nCino primary" />
        <StatDivider />
        <div className="min-w-[220px] flex-1">
          <GapChip title="Probability of default · not in this view" provenance="Held in the risk warehouse" />
        </div>
      </StatStrip>

      {covs.length ? (
        <Card className="py-1">
          <div className="kicker px-6 pb-1.5 pt-4">
            {/* Grouped only when the read says how these covenants are scoped.
                Absent means unknown, and one honest list beats a wrong guess. */}
            {groups.grouped ? "Account covenants" : "Financial covenants"}
          </div>
          <CovenantHeader />
          {(groups.grouped ? groups.account : covs).map((c, i) => (
            <CovenantRow
              key={c.covenantId ?? i}
              cov={c}
              challenge={c.covenantId ? challengeById.get(c.covenantId) : undefined}
              entered={entered}
              index={i}
            />
          ))}

          {/* FACILITY COVENANTS, named by the loan they bind. Rendered only
              when the read tells us which loans a covenant is attached to.
              Grouping by facility is the deal grammar and stays; the columns
              are the relationship table's, because the covenant is the same
              instrument wherever it is attached. */}
          {groups.byFacility.map((f) => (
            <div key={f.loanId ?? f.loanName} className="border-t border-divider">
              <div className="kicker px-6 pb-1.5 pt-4">Facility covenants · {f.loanName}</div>
              <CovenantHeader />
              {f.covenants.map((c, i) => (
                <CovenantRow
                  key={c.covenantId ?? i}
                  cov={c}
                  challenge={c.covenantId ? challengeById.get(c.covenantId) : undefined}
                  entered={entered}
                  index={i}
                />
              ))}
            </div>
          ))}
        </Card>
      ) : (
        <Card className="p-6">
          <EmptyState title="No active covenants" body="No active relationship-level covenants found for this account." />
        </Card>
      )}

      {breached.length > 0 && (
        <Callout kicker="Watch" data-cov-callout="breach">
          {breached.length} covenant{breached.length > 1 ? "s" : ""} at or past threshold:{" "}
          {breached.map((c) => c.covenantType).join(", ")}.
        </Callout>
      )}

      {exceptions.length > 0 && (
        <Callout kicker="Exception" data-cov-callout="exception">
          {exceptions.length} covenant{exceptions.length > 1 ? "s" : ""} at Exception with no measured breach:{" "}
          {exceptions.map((c) => c.covenantType).join(", ")}. {ADMINISTRATIVE_EXCEPTION_NOTE}.
        </Callout>
      )}

      <DataQualityCallout bundle={bundle} />
      <NoteCaption note={bundle.covenants?.note} />
    </div>
  );
}
