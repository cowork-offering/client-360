import type { BorrowerBundle, Collateral } from "../../data/contract";
import { fmtMoney, fmtPct, fmtDate } from "../../data/format";
import { fmtRatio, fmtRate, STATUS, type Tone } from "../../data/finance";
import { Card, SectionHead, GapChip, EmptyState, NoteCaption, StatCell, ToneChip } from "../ui";
import { useEnterTransition } from "../../data/motion";
import { Pulse } from "../Pulse";
import { collateralRecords } from "../../data/collateralRecords";
import { isActiveFacility } from "../../data/worklist";

const EXPLAIN =
  "Explain this exposure: committed versus drawn, coverage, and what secures it.";

const FAC_COLS = "1.3fr 1fr 1fr 1fr 1.1fr 1fr 0.9fr";
const COL_COLS = "1.4fr 1.1fr 1fr 0.7fr 1fr 0.6fr 1.2fr";

export function ExposureTab({ bundle }: { bundle: BorrowerBundle }) {
  const entered = useEnterTransition();
  const exp = bundle.exposure ?? {};
  const allFacs = exp.facilities ?? [];
  // F6: closed / paid-off facilities stay visible (with a status chip) but are
  // excluded from the lendable + coverage math.
  const facs = allFacs.filter(isActiveFacility);

  if (!allFacs.length) {
    return (
      <Card className="p-6">
        <SectionHead kicker="Exposure & Collateral" explain={EXPLAIN} />
        <EmptyState title="No active facilities" body="No active facilities found for this account in the source org." />
        <NoteCaption note={exp.note} />
      </Card>
    );
  }

  const committed = exp.totalCommitted ?? 0;
  const drawn = exp.totalOutstanding ?? 0;
  const avail = exp.totalAvailable ?? 0;
  const drawnPct = committed > 0 ? Math.round((drawn / committed) * 100) : 0;

  let totalLendable = 0;
  let hasLendable = false;
  for (const f of facs) {
    if (f.totalLendableValue != null) {
      totalLendable += f.totalLendableValue;
      hasLendable = true;
    }
  }
  const aggCoverage = hasLendable && drawn > 0 ? totalLendable / drawn : null;
  const covTone: Tone = aggCoverage == null ? "neutral" : aggCoverage < 1 ? "red" : "green";
  const covLabel = aggCoverage == null ? "—" : fmtRatio(aggCoverage);
  const covStatus = aggCoverage == null ? "Not computable" : aggCoverage < 1 ? "Under-covered" : "Covered";

  const pledges: Collateral[] = facs.flatMap((f) => f.collateral ?? []);
  const records = collateralRecords(bundle);

  return (
    <div className="flex flex-col gap-4">
      <SectionHead kicker="Exposure & Collateral · live match" explain={EXPLAIN} />

      {/* stat strip */}
      <Card className="flex flex-wrap items-center gap-x-10 gap-y-4 px-6 py-4">
        <StatCell label="Committed" value={<Pulse id="exposure.totalCommitted">{fmtMoney(committed)}</Pulse>} />
        <div className="h-8 w-px bg-border" />
        <StatCell label="Drawn" value={<Pulse id="exposure.totalOutstanding">{fmtMoney(drawn)}</Pulse>} />
        <div className="h-8 w-px bg-border" />
        <StatCell label="Collateral coverage" value={covLabel} color={STATUS[covTone].fg} />
      </Card>

      {/* committed vs drawn bar */}
      <Card className="px-6 py-5">
        <div className="kicker">Committed vs Drawn</div>
        <div className="my-4 flex h-[46px] overflow-hidden rounded-[11px]" style={{ background: "var(--wash-2)" }}>
          <div
            className="c360-meter-w flex items-center whitespace-nowrap px-4 text-[12.5px] font-bold"
            style={{ width: `${entered ? drawnPct : 0}%`, background: "var(--fill-strong)", color: "var(--ink-inverse)", overflow: "hidden" }}
          >
            Drawn {fmtMoney(drawn)}
          </div>
          <div className="flex flex-1 items-center justify-end whitespace-nowrap px-4 text-[12.5px] font-semibold text-ink-body">
            Available {fmtMoney(avail)}
          </div>
        </div>
        <div className="flex justify-between text-[12px] text-ink-label">
          <span>Total committed</span>
          <span className="font-bold text-ink">{fmtMoney(committed)}</span>
        </div>
      </Card>

      {/* collateral breakdown + coverage dial */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="px-6 py-5">
          <div className="kicker mb-3.5">Collateral breakdown</div>
          {pledges.length ? (
            pledges.map((p, i) => (
              <div key={i} className="flex justify-between border-b border-divider py-2 text-[13.5px]">
                <span className="text-ink-body-strong">
                  {p.collateralType ?? "Collateral"}
                  {p.lienPosition ? ` · ${p.lienPosition}` : ""}
                  {p.advanceRate != null ? ` · ${fmtPct(p.advanceRate, 0)} adv` : ""}
                </span>
                <span className="font-bold">{fmtMoney(p.currentLendableValue ?? p.collateralValue)}</span>
              </div>
            ))
          ) : (
            <GapChip title="No collateral pledged" provenance="Customer360Exposure — 0 Loan_Collateral2 rows" />
          )}
          {hasLendable && (
            <div className="flex justify-between pt-3 text-[14px] font-extrabold">
              <span>Total lendable</span>
              <span>{fmtMoney(totalLendable)}</span>
            </div>
          )}
        </Card>

        <Card className="flex flex-col items-center justify-center px-6 py-5 text-center">
          <div className="kicker mb-2">Coverage ratio</div>
          <div className="text-[52px] font-extrabold leading-none tracking-tight" style={{ color: STATUS[covTone].fg }}>
            {covLabel}
          </div>
          <div className="my-2.5 text-[12.5px] text-ink-muted">
            {hasLendable ? `Lendable ${fmtMoney(totalLendable)} / Drawn ${fmtMoney(drawn)}` : "Lendable value not on file"}
          </div>
          <ToneChip tone={covTone}>{covStatus}</ToneChip>
        </Card>
      </div>

      {/* COLLATERAL RECORDS. One row per piece of security, not per pledge: the
          exposure read returns a pledge per facility, so a warehouse securing
          three loans arrives three times. A banker reads their collateral once,
          with what it is worth and what it secures. */}
      <Card className="py-1">
        <div className="kicker px-6 pb-1.5 pt-4">Collateral</div>
        {records.length ? (
          <>
            <div
              className="grid gap-3 px-6 py-2 text-[10.5px] font-bold uppercase tracking-wider text-ink-faint"
              style={{ gridTemplateColumns: COL_COLS }}
            >
              <span>Collateral</span><span>Type</span><span>Value</span><span>Advance</span><span>Lendable</span><span>Lien</span><span>Secures</span>
            </div>
            {records.map((r, i) => (
              <div
                key={r.collateralId ?? i}
                className="grid items-center gap-3 border-t border-divider px-6 py-3 text-[13px]"
                style={{ gridTemplateColumns: COL_COLS }}
              >
                <span className="font-bold">{r.displayName}</span>
                <span className="text-ink-body-strong">{r.collateralType ?? "—"}</span>
                <span className="font-semibold">{fmtMoney(r.currentValue)}</span>
                <span className="text-ink-body">{r.advanceRate != null ? fmtPct(r.advanceRate, 0) : "—"}</span>
                <span className="font-semibold">{fmtMoney(r.lendableValue)}</span>
                <span className="text-ink-body">{r.lienPosition ?? "—"}</span>
                <span className="text-ink-body">
                  {r.securesFacilities.length === 1 ? r.securesFacilities[0] : `${r.securesFacilities.length} facilities`}
                </span>
              </div>
            ))}
          </>
        ) : (
          <div className="px-6 pb-4">
            <GapChip title="No collateral pledged" provenance="Customer360Exposure — 0 Loan_Collateral2 rows" />
          </div>
        )}
      </Card>

      {/* facilities table */}
      <Card className="py-1">
        <div className="kicker px-6 pb-1.5 pt-4">Facilities</div>
        <div
          className="grid gap-3 px-6 py-2 text-[10.5px] font-bold uppercase tracking-wider text-ink-faint"
          style={{ gridTemplateColumns: FAC_COLS }}
        >
          <span>Facility</span><span>Type</span><span>Commitment</span><span>Drawn</span><span>Rate</span><span>Maturity</span><span>Status</span>
        </div>
        {allFacs.map((f, i) => (
          <div
            key={f.loanId ?? i}
            className="grid items-center gap-3 border-t border-divider px-6 py-3 text-[13px]"
            style={{ gridTemplateColumns: FAC_COLS }}
          >
            <span className="font-bold">{f.name ?? "Facility"}</span>
            <span className="text-ink-body-strong">{f.productType ?? "—"}</span>
            <span className="font-semibold">
              <Pulse id={`facility.${f.loanId}.committed`}>{fmtMoney(f.committed)}</Pulse>
            </span>
            <span className="font-semibold">
              <Pulse id={`facility.${f.loanId}.outstanding`}>{fmtMoney(f.outstanding)}</Pulse>
            </span>
            <span className="text-ink-body">{f.interestRate != null ? fmtRate(f.interestRate) : "—"}</span>
            <span className="text-ink-body">
              <Pulse id={`facility.${f.loanId}.maturityDate`}>{fmtDate(f.maturityDate)}</Pulse>
            </span>
            <span className="justify-self-start">
              {!isActiveFacility(f) ? (
                <ToneChip tone="neutral">{f.status ?? "Closed"}</ToneChip>
              ) : (
                <ToneChip tone={f.coverageShortfall ? "red" : "green"}>
                  {f.coverageShortfall ? "Shortfall" : f.riskGrade ? `Grade ${f.riskGrade}` : "Active"}
                </ToneChip>
              )}
            </span>
          </div>
        ))}
      </Card>

      <NoteCaption note={exp.note} />
    </div>
  );
}
