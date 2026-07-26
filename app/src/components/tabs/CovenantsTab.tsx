import { useState } from "react";
import type { BorrowerBundle, Covenant, CovenantChallenge } from "../../data/contract";
import { fmtDate } from "../../data/format";
import {
  covenantCushion,
  covTone,
  fmtCovThreshold,
  fmtCovVal,
  STATUS,
  type Tone,
} from "../../data/finance";
import { Card, SectionHead, GapChip, EmptyState, NoteCaption } from "../ui";
import { Pulse } from "../Pulse";
import { groupCovenants } from "../../data/collateralRecords";
import { useEnterTransition } from "../../data/motion";

const EXPLAIN =
  "Explain these covenants: which is tightest, and how much cushion is left.";

const COV_COLS = "1.6fr 0.9fr 1fr 0.9fr 1.3fr 1fr";

function challengeView(ch: CovenantChallenge): { tone: Tone; label: string } {
  const bi = ch.boomImplied ?? null;
  const val = bi && bi.value != null ? fmtCovVal(bi.value) : null;
  if (ch.status === "not-computable" || !bi || val === null) {
    return { tone: "neutral", label: "not computable — " + (ch.note ? String(ch.note) : "inputs unavailable") };
  }
  if (ch.breachRiskFlag === true) {
    return { tone: "red", label: `Boom-implied ${val} crosses threshold ${fmtCovVal(ch.threshold)}` };
  }
  if (ch.status === "diverges") {
    return { tone: "amber", label: `Boom-implied ${val} · diverges from nCino ${fmtCovVal(ch.nCinoActual)}` };
  }
  return { tone: "green", label: `Boom-implied ${val} · corroborates` };
}

function EffectiveChallenge({ ch }: { ch?: CovenantChallenge }) {
  const [open, setOpen] = useState(false);
  if (!ch) return null;
  const { tone, label } = challengeView(ch);
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
  const breached = covs.filter((c) => {
    const cu = covenantCushion(c.covenantType, c.actualValue, c.thresholdValue);
    return c.breached === true || cu.safe === false;
  });

  return (
    <div className="flex flex-col gap-4">
      <SectionHead kicker="Risk & Covenants" explain={EXPLAIN} />

      {/* stat strip: rating live, PD/migration = gap chip */}
      <Card className="flex flex-wrap items-center gap-8 px-6 py-4">
        <div>
          <div className="text-[11px] font-semibold text-ink-label">Risk rating</div>
          <div className="tnum mt-0.5 text-[23px] font-extrabold">{grade != null ? `Grade ${grade}` : "—"}</div>
        </div>
        <div className="self-stretch w-px bg-border" />
        <div className="min-w-[200px] flex-1">
          <GapChip title="PD · Last rated · Migration not wired v1" provenance="Lives in Snowflake, not this artifact" />
        </div>
      </Card>

      {covs.length ? (
        <Card className="py-1">
          <div className="kicker px-6 pb-1.5 pt-4">
            {/* Grouped only when the read says how these covenants are scoped.
                Absent means unknown, and one honest list beats a wrong guess. */}
            {groups.grouped ? "Account covenants" : "Financial covenants"}
          </div>
          <div
            className="grid gap-3.5 px-6 py-2 text-[10.5px] font-bold uppercase tracking-wider text-ink-faint"
            style={{ gridTemplateColumns: COV_COLS }}
          >
            <span>Covenant</span><span>Actual</span><span>Threshold</span><span>Cushion</span><span>Headroom</span><span>Next test</span>
          </div>
          {(groups.grouped ? groups.account : covs).map((c, i) => {
            const cush = covenantCushion(c.covenantType, c.actualValue, c.thresholdValue);
            const tone = covTone(c);
            const barColor = STATUS[tone].fg;
            const next = c.nextEvaluationDate
              ? fmtDate(c.nextEvaluationDate)
              : c.daysUntilNextEvaluation != null
                ? `${Math.round(c.daysUntilNextEvaluation)} days`
                : "—";
            return (
              <div
                key={c.covenantId ?? i}
                className="c360-row-in grid items-center gap-3.5 border-t border-divider px-6 py-3.5 text-[13px]"
                style={{ gridTemplateColumns: COV_COLS }}
              >
                <span className="font-semibold">{c.covenantType ?? "Covenant"}</span>
                <span className="font-bold">
                  <Pulse id={`covenant.${c.covenantId}.actualValue`}>{fmtCovVal(c.actualValue)}</Pulse>
                </span>
                <span className="text-ink-label">
                  <Pulse id={`covenant.${c.covenantId}.thresholdValue`}>
                    {fmtCovThreshold(c.covenantType, c.actualValue, c.thresholdValue)}
                  </Pulse>
                </span>
                <span className="font-bold" style={{ color: barColor }}>
                  {cush.cushion != null ? `${cush.cushion < 0 ? "−" : ""}${fmtCovVal(Math.abs(cush.cushion))}` : "—"}
                </span>
                <div className="h-1.5 overflow-hidden rounded-[6px]" style={{ background: "var(--border)" }}>
                  <div
                  className="c360-meter-x h-full w-full rounded-[6px]"
                  style={{ transform: `scaleX(${!entered || cush.safe === false ? 0 : cush.pct / 100})`, background: barColor }}
                />
                </div>
                <span className="justify-self-start whitespace-nowrap rounded-[6px] px-2.5 py-1 text-[11px] font-bold text-ink-body" style={{ background: "var(--wash-2)" }}>
                  {next}
                </span>
                <EffectiveChallenge ch={c.covenantId ? challengeById.get(c.covenantId) : undefined} />
              </div>
            );
          })}

          {/* FACILITY COVENANTS, named by the loan they bind. Rendered only
              when the read tells us which loans a covenant is attached to. */}
          {groups.byFacility.map((f) => (
            <div key={f.loanId ?? f.loanName} className="border-t border-divider">
              <div className="kicker px-6 pb-1.5 pt-4">Facility covenants · {f.loanName}</div>
              {f.covenants.map((c, i) => (
                <div
                  key={c.covenantId ?? i}
                  className="grid items-center gap-3.5 border-t border-divider px-6 py-3.5 text-[13px]"
                  style={{ gridTemplateColumns: COV_COLS }}
                >
                  <span className="font-semibold">{c.covenantType ?? "Covenant"}</span>
                  <span className="font-bold">{fmtCovVal(c.actualValue)}</span>
                  <span className="text-ink-label">{fmtCovThreshold(c.covenantType, c.actualValue, c.thresholdValue)}</span>
                </div>
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
        <div className="flex items-start gap-3.5 rounded-[14px] px-5 py-4" style={{ background: "var(--warning-bg)" }}>
          <svg width="20" height="20" viewBox="0 0 20 20" className="mt-px flex-none" style={{ color: "var(--warning)" }}>
            <path d="M10 2L1 17.5h18z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            <path d="M10 8v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            <circle cx="10" cy="14.6" r=".9" fill="currentColor" />
          </svg>
          <div>
            <div className="mb-1 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--warning)" }}>Watch</div>
            <div className="text-[14px] font-medium leading-relaxed" style={{ color: "var(--warning-prose)" }}>
              {breached.length} covenant{breached.length > 1 ? "s" : ""} at or past threshold: {breached.map((c) => c.covenantType).join(", ")}.
            </div>
          </div>
        </div>
      )}

      <DataQualityCallout bundle={bundle} />
      <NoteCaption note={bundle.covenants?.note} />
    </div>
  );
}
