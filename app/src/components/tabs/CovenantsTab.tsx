import { useState } from "react";
import type { BorrowerBundle, Covenant, CovenantChallenge } from "../../data/contract";
import { fmtDate } from "../../data/format";
import { covenantCushion, fmtCovThreshold, fmtCovVal, type Tone } from "../../data/finance";
import {
  ADMINISTRATIVE_EXCEPTION_NOTE,
  administrativeExceptions,
  classifyCovenant,
  financialBreaches,
  severityTone,
} from "../../domain/covenantStatus";
import { Pulse } from "../Pulse";
import { groupCovenants } from "../../data/collateralRecords";
import {
  Callout,
  EmptyPane,
  Fig,
  Figure,
  Figures,
  Gap,
  Meter,
  Note,
  Pane,
  PaneCard,
  SecHead,
  Status,
  type StatusTone,
} from "./paneKit";

const EXPLAIN =
  "Explain these covenants: which is tightest, and how much cushion is left.";

/** Status IS typography: the tone becomes a coloured word with a 5px dot. */
const STATUS_WORD: Record<Tone, StatusTone> = {
  green: "good",
  amber: "warn",
  red: "bad",
  purple: "acc",
  neutral: "mut",
};

function challengeView(ch: CovenantChallenge, type?: string): { tone: Tone; label: string } {
  const bi = ch.boomImplied ?? null;
  const val = bi && bi.value != null ? fmtCovVal(bi.value, type) : null;
  if (ch.status === "not-computable" || !bi || val === null) {
    return { tone: "neutral", label: "not computable · " + (ch.note ? String(ch.note) : "inputs unavailable") };
  }
  if (ch.breachRiskFlag === true) {
    return { tone: "red", label: `Boom-implied ${val} crosses threshold ${fmtCovVal(ch.threshold, type)}` };
  }
  if (ch.status === "diverges") {
    return { tone: "amber", label: `Boom-implied ${val} · diverges from nCino ${fmtCovVal(ch.nCinoActual, type)}` };
  }
  return { tone: "green", label: `Boom-implied ${val} · corroborates` };
}

/** The effective challenge, on the covenant's own second line. It is an
 *  annotation on a row, so it renders as a sub-row inside the same table rather
 *  than as a chip floating beside one. */
function EffectiveChallenge({ ch, type }: { ch?: CovenantChallenge; type?: string }) {
  const [open, setOpen] = useState(false);
  if (!ch) return null;
  const { tone, label } = challengeView(ch, type);
  const bi = ch.boomImplied ?? null;
  const detail = bi && (bi.formula || bi.inputs != null || bi.period);

  return (
    <tr className="subrow">
      <td colSpan={7}>
        <span
          style={{
            display: "inline-flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span className="kicker">Effective challenge</span>
          {detail ? (
            <button type="button" className="btn-q" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
              <Status tone={STATUS_WORD[tone]}>{label}</Status>
            </button>
          ) : (
            <Status tone={STATUS_WORD[tone]}>{label}</Status>
          )}
        </span>
        {detail && open && (
          <span style={{ display: "block", marginTop: 6, color: "var(--ink)" }}>
            {bi?.formula && (
              <span style={{ display: "block" }}>
                <b>Formula </b>
                {bi.formula}
              </span>
            )}
            {bi?.period && (
              <span style={{ display: "block" }}>
                <b>Period </b>
                {bi.period}
              </span>
            )}
          </span>
        )}
      </td>
    </tr>
  );
}

/** The column names, once. Both covenant sections render the SAME six columns
 *  under the SAME header: a facility-scoped covenant is not a lesser covenant,
 *  and values under nothing are values nobody can read (validation audit
 *  2026-07-27, finding 2). */
function CovenantHeader() {
  return (
    <thead>
      <tr data-cov-header>
        <th>Covenant</th>
        <th className="r">Actual</th>
        <th className="r">Threshold</th>
        <th className="r">Cushion</th>
        <th>Headroom</th>
        <th className="r">Next test</th>
        <th>Status</th>
      </tr>
    </thead>
  );
}

/** One covenant, in full. ONE definition, so the relationship table and the
 *  facility groups cannot drift apart again. */
function CovenantRow({ cov, challenge }: { cov: Covenant; challenge?: CovenantChallenge }) {
  const cush = covenantCushion(cov.covenantType, cov.actualValue, cov.thresholdValue);
  const verdict = classifyCovenant(cov);
  const word = STATUS_WORD[severityTone(verdict.severity)];
  const next = cov.nextEvaluationDate
    ? fmtDate(cov.nextEvaluationDate)
    : cov.daysUntilNextEvaluation != null
      ? `${Math.round(cov.daysUntilNextEvaluation)} days`
      : "—";

  return (
    <>
      <tr data-cov-row>
        <td>{cov.covenantType ?? "Covenant"}</td>
        <td className="r">
          <Pulse id={`covenant.${cov.covenantId}.actualValue`}>
            <Fig>{fmtCovVal(cov.actualValue, cov.covenantType)}</Fig>
          </Pulse>
        </td>
        <td className="r">
          <Pulse id={`covenant.${cov.covenantId}.thresholdValue`}>
            <Fig>{fmtCovThreshold(cov.covenantType, cov.actualValue, cov.thresholdValue)}</Fig>
          </Pulse>
        </td>
        <td className="r">
          {cush.cushion != null ? (
            <Fig>{`${cush.cushion < 0 ? "−" : ""}${fmtCovVal(Math.abs(cush.cushion), cov.covenantType)}`}</Fig>
          ) : (
            "—"
          )}
        </td>
        <td style={{ minWidth: 90 }}>
          <Meter
            pct={cush.safe === false ? 0 : cush.pct}
            tone={word === "bad" ? "bad" : word === "warn" ? "warn" : "good"}
          />
        </td>
        <td className="r">{next}</td>
        {/* nCino's own verdict, in nCino's own words, with what it means on hover. */}
        <td>
          <Status tone={word} data-cov-status data-cov-status-kind={verdict.kind} title={verdict.explanation}>
            {verdict.label}
          </Status>
        </td>
      </tr>
      <EffectiveChallenge ch={challenge} type={cov.covenantType} />
    </>
  );
}

function DataQualityNote({ bundle }: { bundle: BorrowerBundle }) {
  // Effective-challenge notes are the covenant-tab's data-quality note; the
  // standing-vs-contractual caveat renders once from the first challenge entry.
  const note = bundle.covenantChallenge?.find((c) => c.note)?.note;
  if (!note) return null;
  return (
    <PaneCard>
      <div className="kicker" style={{ marginBottom: 6 }}>
        Data-quality note
      </div>
      <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6, color: "var(--ink-muted)", textWrap: "pretty" }}>
        {note}
      </p>
    </PaneCard>
  );
}

export function CovenantsTab({ bundle }: { bundle: BorrowerBundle }) {
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
    <Pane id="covenants">
      <PaneCard>
        <SecHead kicker="Compliance" sub="Covenant tests" explain={EXPLAIN} />

        <Figures>
          <Figure label="Risk rating" value={grade != null ? `Grade ${grade}` : "—"} sub="nCino primary" />
          <Gap title="Probability of default · not in this view" provenance="Held in the risk warehouse" />
        </Figures>

        {covs.length ? (
          <>
            <div className="kicker" style={{ margin: "20px 0 10px" }}>
              {/* Grouped only when the read says how these covenants are scoped.
                  Absent means unknown, and one honest list beats a wrong guess. */}
              {groups.grouped ? "Account covenants" : "Financial covenants"}
            </div>
            <table className="dt num">
              <CovenantHeader />
              <tbody>
                {(groups.grouped ? groups.account : covs).map((c, i) => (
                  <CovenantRow
                    key={c.covenantId ?? i}
                    cov={c}
                    challenge={c.covenantId ? challengeById.get(c.covenantId) : undefined}
                  />
                ))}
              </tbody>
            </table>

            {/* FACILITY COVENANTS, named by the loan they bind. Rendered only
                when the read tells us which loans a covenant is attached to.
                Grouping by facility is the deal grammar and stays; the columns
                are the relationship table's, because the covenant is the same
                instrument wherever it is attached. */}
            {groups.byFacility.map((f) => (
              <div key={f.loanId ?? f.loanName}>
                <div className="kicker" style={{ margin: "22px 0 10px" }}>
                  Facility covenants · {f.loanName}
                </div>
                <table className="dt num">
                  <CovenantHeader />
                  <tbody>
                    {f.covenants.map((c, i) => (
                      <CovenantRow
                        key={c.covenantId ?? i}
                        cov={c}
                        challenge={c.covenantId ? challengeById.get(c.covenantId) : undefined}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </>
        ) : (
          <EmptyPane
            title="No active covenants"
            body="No active relationship-level covenants found for this account."
          />
        )}
      </PaneCard>

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

      <DataQualityNote bundle={bundle} />
      <Note note={bundle.covenants?.note} />
    </Pane>
  );
}
