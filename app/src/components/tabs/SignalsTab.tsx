import type { BorrowerBundle } from "../../data/contract";
import { packageRoster } from "../../book/packages";
import { aggregateGuarantorSignals } from "../../data/graphAggregate";
import { fmtDate } from "../../data/format";
import { arc, fmtCovThreshold, fmtCovVal } from "../../data/finance";
import { classifyCovenant } from "../../domain/covenantStatus";
import { useEnterTransition } from "../../data/motion";
import { EmptyPane, Note, Pane, PaneCard, SecHead, Status, type StatusTone } from "./paneKit";

const EXPLAIN =
  "Explain the early-warning signals here and the nearest maturity.";

/** Renewal-clock window. DERIVED constant, matches MATURITY_NEAR_WINDOW_DAYS
 *  in data/worklist.ts and the legacy artifact's 270-day watch window (A26.1). */
const MATURITY_WINDOW_DAYS = 270;

/** The org's loan names lead with the account's own name; on the account's own
 *  page that prefix says nothing, so the instrument reads the product half. */
function shortFacility(name: string | undefined, account: string | undefined): string {
  if (!name) return "Facility";
  const trimmed = account && name.startsWith(account + " - ") ? name.slice(account.length + 3) : name;
  return trimmed.replace(/\$([0-9,]+)\.00\b/, (_, digits: string) => {
    const n = Number(digits.replace(/,/g, ""));
    return n >= 1_000_000 ? "$" + (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M" : "$" + digits;
  });
}

type Severity = "Critical" | "Watch" | "Info";
interface Ews {
  title: string;
  severity: Severity;
  body: string;
  date: string;
}

/** The feed icon says the severity before the words do: a bang on the warning
 *  wash, a bang on the critical wash, a calendar on the accent wash. */
const SEV_ICON: Record<Severity, "b" | "w" | "a"> = { Critical: "b", Watch: "w", Info: "a" };
const SEV_WORD: Record<Severity, StatusTone> = { Critical: "bad", Watch: "warn", Info: "mut" };

const CAL = (
  <svg
    viewBox="0 0 16 16"
    width="13"
    height="13"
    style={{ stroke: "currentColor", fill: "none", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" }}
    aria-hidden="true"
  >
    <rect x="2" y="3" width="12" height="11" rx="2" />
    <path d="M2 6.5h12M5.5 1.8v2.4M10.5 1.8v2.4" />
  </svg>
);

export function SignalsTab({ bundle }: { bundle: BorrowerBundle }) {
  const entered = useEnterTransition();
  const sig = bundle.signals ?? {};
  const covs = bundle.covenants?.covenants ?? [];
  const ews: Ews[] = [];

  const mods = sig.modifications ?? [];
  if (mods.length) {
    const m0 = mods[0];
    const modType = (m0.modificationType as string) || (m0.modType as string) || "modification";
    const eff = (m0.effectiveDate as string) || (m0.date as string) || "";
    ews.push({
      title: "Loan modification" + (mods.length > 1 ? `s (${mods.length})` : ""),
      severity: sig.modificationClusterFlag ? "Watch" : "Info",
      body:
        (sig.modificationClusterFlag ? "Modification cluster: a pattern, not a single accommodation. " : "") +
        "Most recent: " +
        modType +
        (eff ? ` (${fmtDate(eff)})` : ""),
      date: eff ? fmtDate(eff) : "",
    });
  }
  // ONE ROW PER GUARANTOR. The org records the involvement against every loan,
  // so a guarantor on six facilities arrives as six identical signals; six
  // copies of one alert is not six alerts, and rendering them that way buries
  // everything underneath.
  for (const g of aggregateGuarantorSignals(sig.guarantorSignals as Array<Record<string, unknown>> | undefined)) {
    if (g.riskStatus || g.highestRiskGrade) {
      const across = g.facilityCount > 1 ? ` · across ${g.facilityCount} facilities` : "";
      ews.push({
        title: "Guarantor signal · " + (g.guarantorName ?? "guarantor") + across,
        severity: g.highestRiskGrade && /[6-9]/.test(String(g.highestRiskGrade)) ? "Watch" : "Info",
        body: "Risk status " + (g.riskStatus ?? "—") + (g.highestRiskGrade ? `, highest grade ${g.highestRiskGrade}` : ""),
        date: "",
      });
    }
  }
  for (const r of sig.renewals ?? []) {
    ews.push({
      title: "Renewal in progress",
      severity: "Info",
      // Joined from the parts that exist. Concatenating a blank revisionStatus
      // left a dangling separator on screen ("Revision 2 · ").
      body: ["Revision " + (r.revisionNumber ?? "—"), r.revisionStatus, r.hasActiveRenewalLoan ? "active renewal loan" : null]
        .filter(Boolean)
        .join(" · "),
      date: "",
    });
  }
  // A measured miss is Critical. An administrative Exception is a Watch and says
  // what it is: nCino forces that status on an elapsed Due Date whether or not
  // anything was measured (domain/covenantStatus.ts).
  for (const c of covs) {
    const verdict = classifyCovenant(c);
    const date = c.lastEvaluationDate ? fmtDate(c.lastEvaluationDate) : "";
    if (verdict.financialBreach) {
      ews.push({
        title: "Covenant at threshold · " + (c.covenantType ?? ""),
        severity: "Critical",
        body: verdict.measured
          ? "Actual " + fmtCovVal(c.actualValue, c.covenantType) + " vs " + fmtCovThreshold(c.covenantType, c.actualValue, c.thresholdValue)
          : verdict.explanation,
        date,
      });
    } else if (verdict.kind === "exception") {
      ews.push({
        title: "Covenant exception · " + (c.covenantType ?? ""),
        severity: "Watch",
        body: verdict.explanation,
        date,
      });
    }
  }

  // Renewal clock — nearest maturity.
  const mw = sig.maturityWatch ?? [];
  let nearest: { daysUntilMaturity?: number; name?: string; maturityDate?: string } | null = null;
  for (const m of mw) {
    if (m.daysUntilMaturity != null && (nearest === null || m.daysUntilMaturity < (nearest.daysUntilMaturity ?? Infinity)))
      nearest = m;
  }

  /* ONE ROW PER PRODUCT PACKAGE (founder, 2026-09-03): a relationship's
     maturities run per package, so the clock names each package's own nearest
     maturity rather than showing one loan for the whole book. */
  const roster = packageRoster(bundle);
  const facilities = bundle.exposure?.facilities ?? [];
  const pkgRows = roster
    .map((p) => {
      const loanIds = new Set(facilities.filter((f) => f.productPackageId === p.id).map((f) => f.loanId));
      let near: { daysUntilMaturity?: number; maturityDate?: string } | null = null;
      for (const m of mw) {
        if (!loanIds.has((m as { loanId?: string }).loanId)) continue;
        if (m.daysUntilMaturity != null && (near === null || m.daysUntilMaturity < (near.daysUntilMaturity ?? Infinity))) near = m;
      }
      return near ? { name: p.name, date: near.maturityDate, days: near.daysUntilMaturity } : null;
    })
    .filter((r): r is { name: string; date: string | undefined; days: number | undefined } => r !== null);

  /* NEXT REVIEW OF THE RELATIONSHIP. The reads carry no review-date field, so
     the only honest footing is the trail: the latest completed annual review
     plus the annual cycle, said as derived. No trail entry, no date. */
  const lastReview = (bundle.activity ?? [])
    .filter((e) => {
      const en = e as { kind?: string; type?: string; title?: string };
      /* The trail's kinds are ACTION_STAGED/EXECUTED; the review names itself
         in the title, so both are read (founder, 2026-09-03: after a Sync the
         derivation found nothing and the card emptied). */
      return /annual[- ]review/i.test(String(en.kind ?? en.type ?? "")) || /annual (credit )?review/i.test(String(en.title ?? ""));
    })
    .map((e) => String((e as { date?: string; createdDate?: string }).date ?? (e as { createdDate?: string }).createdDate ?? ""))
    .filter(Boolean)
    .sort()
    .pop();
  /* The org's own field first (LLC_BI__Next_Review_Date__c on the Account,
     carried on the snapshot); the trail derivation is the fallback. */
  const snapReview = (bundle.snapshot as { nextReviewDate?: string; lastReviewDate?: string } | undefined) ?? {};
  const nextReview =
    snapReview.nextReviewDate ??
    (lastReview
      ? new Date(new Date(lastReview.slice(0, 10)).setFullYear(new Date(lastReview.slice(0, 10)).getFullYear() + 1))
          .toISOString()
          .slice(0, 10)
      : null);

  const days = nearest?.daysUntilMaturity ?? null;
  const clockColor = days == null ? "var(--ink-faint)" : days < 45 ? "var(--critical)" : days < 120 ? "var(--warning)" : "var(--positive)";
  const clockArc = arc(days == null ? 0 : Math.max(0, Math.min(100, Math.round((1 - days / MATURITY_WINDOW_DAYS) * 100))), 52);

  return (
    <Pane id="signals">
      <SecHead kicker="Early warning" sub="Structural signals" explain={EXPLAIN} />

      {ews.length ? (
        <div>
          {ews.map((e, i) => (
            <div className="feeditem" key={i}>
              <div className={`ic ${SEV_ICON[e.severity]}`}>{e.severity === "Info" ? CAL : "!"}</div>
              <div className="tx">
                <b>{e.title}</b>
                <span>{e.body}</span>
              </div>
              {/* The right column carries WHEN, exactly as the dummy's feed
                  does. With no date on the record it carries the severity
                  instead, as the status word the icon tint already implies. */}
              <span className="when">
                {e.date || <Status tone={SEV_WORD[e.severity]}>{e.severity}</Status>}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <PaneCard>
          <EmptyPane title="No structural signals" body="Nothing structural is moving on this relationship." />
        </PaneCard>
      )}

      {/* Renewal clock. The dial is the one thing on this surface that earns
          being centred, because it is radial; everything around it is left
          aligned on the card's own margin. It is an instrument, not a banner,
          so it takes an instrument's width and lets the page breathe beside
          it. */}
      {/* The two instruments share one row (founder, 2026-09-03). */}
      <div style={{ display: "flex", gap: 16, alignItems: "stretch", flexWrap: "wrap" }}>
      <PaneCard style={{ flex: "1 1 300px" }}>
        <div className="kicker">Renewal clock</div>
        {days != null ? (
          <>
            <div style={{ display: "flex", justifyContent: "center", padding: "18px 0 20px" }}>
              <div style={{ position: "relative", width: 142, height: 142 }}>
                <svg
                  width="142"
                  height="142"
                  viewBox="0 0 130 130"
                  style={{ position: "absolute", inset: 0, transform: "rotate(-90deg)" }}
                  aria-hidden="true"
                >
                  <circle cx="65" cy="65" r="52" fill="none" stroke="var(--border)" strokeWidth="9" />
                  <circle
                    className="c360-dial"
                    cx="65"
                    cy="65"
                    r="52"
                    fill="none"
                    stroke={clockColor}
                    strokeWidth="9"
                    strokeLinecap="round"
                    strokeDasharray={clockArc.c}
                    strokeDashoffset={entered ? clockArc.off : clockArc.c}
                  />
                </svg>
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <span className="num" style={{ fontSize: 30, fontWeight: 600, lineHeight: 1, color: clockColor }}>
                    {days}
                  </span>
                  <span className="kicker" style={{ marginTop: 6 }}>
                    days
                  </span>
                </div>
              </div>
            </div>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: "var(--ink)", textWrap: "pretty" }}>
              {shortFacility(nearest?.name, bundle.snapshot?.name)} matures {fmtDate(nearest?.maturityDate)}.
            </p>
            {pkgRows.length > 1 && (
              <div style={{ marginTop: 12, borderTop: "1px solid var(--row-divider)" }}>
                {pkgRows.map((r, i) => (
                  <div
                    key={i}
                    className="num"
                    style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "7px 0", borderBottom: "1px solid var(--row-divider)", fontSize: 12.5 }}
                  >
                    <span style={{ color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                    <span style={{ flex: "none", color: "var(--ink-muted)" }}>
                      {fmtDate(r.date)} · {r.days} days
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="note">Against a {MATURITY_WINDOW_DAYS}-day watch window{pkgRows.length > 1 ? ", nearest per package" : ""}.</div>
          </>
        ) : (
          <EmptyPane
            title="No maturities in window"
            body={`No facilities maturing within the watch window (${MATURITY_WINDOW_DAYS} days).`}
          />
        )}
      </PaneCard>

      {/* Next review of the relationship, on the trail's own footing. */}
      <PaneCard style={{ flex: "1 1 300px" }}>
        <div className="kicker">Next review</div>
        {nextReview ? (
          <>
            <div className="bigfig num" style={{ marginTop: 10 }}>
              <span className="n">{fmtDate(nextReview)}</span>
            </div>
            <div className="note">
              {snapReview.nextReviewDate
                ? `Salesforce Next Review Date on the relationship${snapReview.lastReviewDate ? `; last review ${fmtDate(snapReview.lastReviewDate)}` : ""}.`
                : `On the annual cycle from the review completed ${fmtDate(lastReview?.slice(0, 10))}. Derived, not a field on the account.`}
            </div>
          </>
        ) : (
          <EmptyPane title="No review on file" body="No completed annual review on the activity trail to derive a next date from." />
        )}
      </PaneCard>
      </div>

      <Note note={sig.note} />
    </Pane>
  );
}
