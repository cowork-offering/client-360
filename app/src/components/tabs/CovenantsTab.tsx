/* =============================================================================
   THE COVENANTS PANE — the account's covenants, and the loans each one binds.

   FOUNDER READ (2026-09-03, on #pane-covenants): "just list out the account
   covenants, and then click on the covenant and you see to which loans the
   covenant is associated, because covenants are never only on the loan, they
   get by default added to the Account. And then have a clear row for each loan
   with information, keep it elegant, all in one row, all aligned."

   So the pane is ONE list, not three tables. A covenant appears exactly once —
   the account is where nCino puts it — and the loans it is associated to are
   the covenant's own detail, opened in place. The old shape repeated a covenant
   under every facility it bound, which read as duplicates of the same test and
   is what "pretty untidy" was pointing at.

   The row, the caret, the badge and the opened block come from discloseKit, the
   same primitives the collateral block runs on. Alignment is the design and it
   is declared once, in panes.css.
   ============================================================================= */

import type { BorrowerBundle, Covenant, CovenantChallenge, Facility } from "../../data/contract";
import { fmtDate, fmtMoney } from "../../data/format";
import { fmtCovThreshold, fmtCovVal, type Tone } from "../../data/finance";
import {
  ADMINISTRATIVE_EXCEPTION_NOTE,
  administrativeExceptions,
  classifyCovenant,
  financialBreaches,
  severityTone,
} from "../../domain/covenantStatus";
import {
  covenantAttachment,
  covenantMeasure,
  openTestPeriod,
  type CovenantLoanRow,
} from "../../domain/covenantAttachment";
import { Pulse } from "../Pulse";
import {
  DiscloseEmpty,
  DiscloseHead,
  DiscloseList,
  DisclosePanel,
  DiscloseRow,
  DiscloseSub,
  DiscloseSubHead,
  useDisclosure,
} from "./discloseKit";
import {
  Callout,
  EmptyPane,
  Fig,
  Figure,
  Figures,
  Note,
  Pane,
  PaneCard,
  SecHead,
  Status,
  type StatusTone,
} from "./paneKit";
import { useState } from "react";

const KIND = "covenant";

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

const TYPE_TITLE =
  "The kind of test, from the unit its threshold is stated in. nCino's own covenant category is not carried by this read.";

const PER_COVENANT_TITLE =
  "Compliance is held on the covenant in nCino, not on the loan junction, so this is the covenant's own latest test.";

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

/** The SR 11-7 effective challenge. It belongs to the covenant, not to the row:
 *  it lives inside the opened block as a quiet action, so the covenant line
 *  stays one line and the affordance survives the rebuild. */
function EffectiveChallenge({ ch, type }: { ch?: CovenantChallenge; type?: string }) {
  const [open, setOpen] = useState(false);
  if (!ch) return null;
  const { tone, label } = challengeView(ch, type);
  const bi = ch.boomImplied ?? null;
  const detail = Boolean(bi && (bi.formula || bi.inputs != null || bi.period));

  return (
    <div className="xaction" data-cov-challenge>
      <span className="kicker">Effective challenge</span>
      {detail ? (
        <button type="button" className="btn-q" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          <Status tone={STATUS_WORD[tone]}>{label}</Status>
        </button>
      ) : (
        <Status tone={STATUS_WORD[tone]}>{label}</Status>
      )}
      {detail && open && (
        <span className="xaction-detail">
          {bi?.formula && (
            <span>
              <b>Formula </b>
              {bi.formula}
            </span>
          )}
          {bi?.period && (
            <span>
              <b>Period </b>
              {bi.period}
            </span>
          )}
        </span>
      )}
    </div>
  );
}

/** The covenant's latest test, as one string: "1.38× vs ≥ 1.25×". */
function latestTest(cov: Covenant) {
  if (cov.actualValue == null) return "—";
  return (
    <>
      <Fig>{fmtCovVal(cov.actualValue, cov.covenantType)}</Fig> <span className="xvs">vs</span>{" "}
      {fmtCovThreshold(cov.covenantType, cov.actualValue, cov.thresholdValue)}
    </>
  );
}

function loanCells(row: CovenantLoanRow, cov: Covenant) {
  return [
    {
      content: row.facility,
      title: row.unresolved
        ? `${row.fullName}. The junction names this loan; the exposure read does not carry it, so its figures are absent rather than guessed.`
        : row.fullName,
    },
    { content: row.committed != null ? <Fig>{fmtMoney(row.committed)}</Fig> : "—", align: "r" as const },
    { content: row.outstanding != null ? <Fig>{fmtMoney(row.outstanding)}</Fig> : "—", align: "r" as const },
    { content: row.maturityDate ? fmtDate(row.maturityDate) : "—", align: "r" as const },
    { content: latestTest(cov), align: "r" as const, title: PER_COVENANT_TITLE },
  ];
}

/** One covenant: the line, and the loans it is associated to underneath it. */
function CovenantItem({
  cov,
  facilities,
  relationship,
  challenge,
  open,
  onToggle,
}: {
  cov: Covenant;
  facilities: readonly Facility[] | undefined;
  relationship?: string | null;
  challenge?: CovenantChallenge;
  open: boolean;
  onToggle: () => void;
}) {
  const verdict = classifyCovenant(cov);
  const word = STATUS_WORD[severityTone(verdict.severity)];
  const attach = covenantAttachment(cov, facilities, relationship);
  const period = openTestPeriod(cov);
  const showPeriod = Boolean(period && period.toLowerCase() !== verdict.label.toLowerCase());
  const name = cov.covenantType ?? "Covenant";
  const next = cov.nextEvaluationDate
    ? fmtDate(cov.nextEvaluationDate)
    : cov.daysUntilNextEvaluation != null
      ? `${Math.round(cov.daysUntilNextEvaluation)} days`
      : "—";

  const cells = [
    { content: name, title: name },
    { content: covenantMeasure(cov), title: TYPE_TITLE, muted: true },
    {
      content: (
        <Pulse id={`covenant.${cov.covenantId}.thresholdValue`}>
          <Fig>{fmtCovThreshold(cov.covenantType, cov.actualValue, cov.thresholdValue)}</Fig>
        </Pulse>
      ),
      align: "r" as const,
    },
    { content: cov.frequency ?? "—", muted: true },
    {
      content: (
        <>
          <Status tone={word} data-cov-status data-cov-status-kind={verdict.kind} title={verdict.explanation}>
            {verdict.label}
          </Status>
          {showPeriod && (
            <span
              className="xnote"
              data-cov-period
              title="The status on the latest compliance row: the open test period."
            >
              · {period}
            </span>
          )}
        </>
      ),
    },
    { content: next, align: "r" as const },
    {
      content: (
        <span className="xbadge" data-cov-badge data-cov-attachment={attach.kind}>
          {attach.badge}
        </span>
      ),
      align: "r" as const,
    },
  ];

  return (
    <div className="xitem" data-cov-item>
      <DiscloseRow kind={KIND} cells={cells} open={open} onToggle={onToggle} label={name} />
      {open && (
        <DisclosePanel kind={KIND}>
          {attach.rows.length > 0 ? (
            <>
              <DiscloseSubHead
                kind={KIND}
                cells={[
                  { content: "Facility" },
                  { content: "Commitment", align: "r" },
                  { content: "Drawn", align: "r" },
                  { content: "Maturity", align: "r" },
                  { content: "Latest test", align: "r" },
                ]}
              />
              {attach.rows.map((row, i) => (
                <DiscloseSub key={row.loanId ?? i} kind={KIND} cells={loanCells(row, cov)} />
              ))}
            </>
          ) : (
            <>
              <DiscloseEmpty kind={KIND}>{attach.emptyLine}</DiscloseEmpty>
              {/* The measured figure has to survive somewhere: a covenant that
                  binds no loan is still the one a banker asks the cushion
                  question about. Absent stays absent. */}
              {cov.actualValue != null && (
                <p className="xlatest num" data-cov-latest>
                  <span className="kicker">Latest test</span>
                  {latestTest(cov)}
                  {cov.lastEvaluationDate ? `, as nCino evaluated on ${fmtDate(cov.lastEvaluationDate)}` : ""}
                </p>
              )}
            </>
          )}
          <EffectiveChallenge ch={challenge} type={cov.covenantType} />
        </DisclosePanel>
      )}
    </div>
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
  const relationship = bundle.snapshot?.name;
  const facilities = bundle.exposure?.facilities;
  const disclosure = useDisclosure();

  const challengeById = new Map<string, CovenantChallenge>();
  for (const ch of bundle.covenantChallenge ?? []) if (ch.covenantId) challengeById.set(ch.covenantId, ch);

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
        </Figures>

        {covs.length ? (
          <DiscloseList kind={KIND} kicker="Account covenants">
            <DiscloseHead
              kind={KIND}
              cells={[
                { content: "Covenant" },
                { content: "Type", title: TYPE_TITLE },
                { content: "Test", align: "r" },
                { content: "Frequency" },
                { content: "Status" },
                { content: "Next due", align: "r" },
                { content: "Loans", align: "r" },
              ]}
            />
            {covs.map((c, i) => {
              const key = c.covenantId ?? `cov-${i}`;
              return (
                <CovenantItem
                  key={key}
                  cov={c}
                  facilities={facilities}
                  relationship={relationship}
                  challenge={c.covenantId ? challengeById.get(c.covenantId) : undefined}
                  open={disclosure.isOpen(key)}
                  onToggle={() => disclosure.toggle(key)}
                />
              );
            })}
          </DiscloseList>
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
