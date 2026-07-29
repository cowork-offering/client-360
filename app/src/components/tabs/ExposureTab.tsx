import type { BorrowerBundle, Collateral, Facility } from "../../data/contract";
import { fmtMoney, fmtPct, fmtDate } from "../../data/format";
import { fmtRatio, fmtRate, STATUS, type Tone } from "../../data/finance";
import { Card, SectionHead, GapChip, EmptyState, NoteCaption, StatCell, StatDivider, StatStrip, ToneChip } from "../ui";
import { staggerDelay, useEnterTransition } from "../../data/motion";
import { Pulse } from "../Pulse";
import { collateralRecords } from "../../data/collateralRecords";
import { isActiveFacility } from "../../data/worklist";

/* =============================================================================
   COVERAGE, AS THE ORG COMPUTES IT.

   Two figures that used to be one. The RELATIONSHIP ratio divides the lendable
   value of the DISTINCT collateral by the drawn balance. A FACILITY ratio
   divides that facility's PLEDGED SHARE by its own outstanding. Neither is a
   sum of pledge lendable values: a cross-pledged asset repeats its whole
   lendable value on every pledge, and summing those gave 1.91x where the
   defensible number was 1.02x (NCINO-FUNCTIONAL-VALIDATION §2.6).

   So nothing here sums pledges, and nothing here derives a relationship ratio
   the org did not compute. Where a ratio is null the org says WHY, and that
   sentence is rendered verbatim in place of the blank.
   ============================================================================= */

const EXPLAIN =
  "Explain this exposure: committed versus drawn, coverage, and what secures it.";

const FAC_COLS = "1.5fr 0.9fr 1fr 1fr 1fr 0.9fr 1fr 0.95fr";
const COL_COLS = "1.4fr 1.1fr 1fr 0.7fr 1fr 0.6fr 1.2fr";

/** The facility's pledged share, under either of the two names the read uses. */
const pledgedShare = (f: Facility): number | null => f.totalPledgedValue ?? f.totalLendableValue ?? null;

/** Coverage tone from the org's own flag first, the ratio second. */
function coverageTone(ratio: number | null | undefined, shortfall: boolean | undefined): Tone {
  if (shortfall === true) return "red";
  if (ratio === null || ratio === undefined) return "neutral";
  return ratio < 1 ? "red" : "green";
}

function coverageStatus(ratio: number | null | undefined, shortfall: boolean | undefined): string {
  if (shortfall === true) return "Under-covered";
  if (ratio === null || ratio === undefined) return "Not computed";
  return ratio < 1 ? "Under-covered" : "Covered";
}

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

  // RELATIONSHIP coverage is READ, never derived. A sum of facility shares is a
  // different quantity: Piedmont's facilities pledge 9.25MM against a 14.0MM
  // distinct lendable base, so deriving one here would understate the org by a
  // third and look authoritative doing it.
  const relCoverage = exp.coverageRatio ?? null;
  const uniqueLendable = exp.totalUniqueCollateralLendableValue ?? null;
  const uniqueCount = exp.uniqueCollateralCount ?? null;
  const covTone = coverageTone(relCoverage, exp.coverageShortfall);
  const covLabel = fmtRatio(relCoverage);
  const covStatus = coverageStatus(relCoverage, exp.coverageShortfall);

  const shortfallFacs = facs.filter((f) => f.coverageShortfall === true);
  // The org's reasons, kept with the facility that carries them.
  const reasons = facs
    .filter((f) => f.coverageNote)
    .map((f) => ({ name: f.name ?? f.loanId ?? "Facility", note: f.coverageNote as string }));

  const pledges: Collateral[] = facs.flatMap((f) => f.collateral ?? []);
  const records = collateralRecords(bundle);

  return (
    <div className="flex flex-col gap-4">
      <SectionHead kicker="Exposure & Collateral · live match" explain={EXPLAIN} />

      {/* stat strip — one row, left-aligned, figures on a shared baseline */}
      <StatStrip>
        <StatCell
          label="Committed"
          value={<Pulse id="exposure.totalCommitted">{fmtMoney(committed)}</Pulse>}
          sub="Total commitment"
        />
        <StatDivider />
        <StatCell
          label="Drawn"
          value={<Pulse id="exposure.totalOutstanding">{fmtMoney(drawn)}</Pulse>}
          sub="Outstanding balance"
        />
        <StatDivider />
        <StatCell label="Collateral coverage" value={covLabel} color={STATUS[covTone].fg} sub={covStatus} />
        {uniqueCount !== null && (
          <>
            <StatDivider />
            <StatCell
              label="Distinct collateral"
              value={String(uniqueCount)}
              sub={uniqueCount === 1 ? "record" : "records"}
            />
          </>
        )}
      </StatStrip>

      {/* committed vs drawn bar — kicker and the total it measures share one
          baseline, so the meter reads as an instrument rather than a graphic
          with a caption bolted underneath. */}
      <Card className="px-6 py-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <div className="kicker">Committed vs Drawn</div>
          <div className="text-[12px] text-ink-label">
            Total committed <span className="tnum ml-1 font-bold text-ink">{fmtMoney(committed)}</span>
          </div>
        </div>
        <div
          className="mt-3.5 flex h-[46px] overflow-hidden rounded-[11px]"
          style={{ background: "var(--wash-2)", boxShadow: "inset 0 1px 2px rgba(26, 10, 54, 0.06)" }}
        >
          <div
            className="c360-meter-w tnum flex items-center whitespace-nowrap px-4 text-[12.5px] font-bold"
            style={{ width: `${entered ? drawnPct : 0}%`, background: "var(--fill-strong)", color: "var(--ink-inverse)", overflow: "hidden" }}
          >
            Drawn {fmtMoney(drawn)}
          </div>
          <div className="tnum flex flex-1 items-center justify-end whitespace-nowrap px-4 text-[12.5px] font-semibold text-ink-body">
            Available {fmtMoney(avail)}
          </div>
        </div>
      </Card>

      {/* pledges + coverage dial */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="px-6 py-5">
          <div className="kicker mb-3.5">Pledges · facility share</div>
          {pledges.length ? (
            pledges.map((p, i) => (
              <div
                key={i}
                className="flex items-baseline justify-between gap-5 border-b border-divider py-2.5 text-[13.5px] last:border-b-0"
              >
                <div className="min-w-0">
                  <div className="text-ink-body-strong">
                    {p.collateralType ?? "Collateral"}
                    {p.lienPosition ? ` · ${p.lienPosition}` : ""}
                    {p.advanceRate != null ? ` · ${fmtPct(p.advanceRate, 0)} adv` : ""}
                  </div>
                  {p.advanceRateSource && <div className="mt-0.5 text-[11px] text-ink-faint">{p.advanceRateSource}</div>}
                </div>
                <div className="tnum flex-none whitespace-nowrap text-right">
                  <div className="font-bold">{fmtMoney(p.amountPledged ?? p.currentLendableValue ?? p.collateralValue)}</div>
                  <div className="mt-0.5 text-[11px] text-ink-faint">
                    {p.amountPledged != null ? "pledged of " : ""}
                    {fmtMoney(p.currentLendableValue ?? p.collateralValue)} lendable
                  </div>
                </div>
              </div>
            ))
          ) : reasons.length ? (
            // Not "no collateral". The org says the pledges exist and are out of
            // the math, which is a different fact and the one a banker needs.
            reasons.map((r, i) => (
              <div key={i} className="border-b border-divider py-2 text-[13px] last:border-b-0">
                <div className="font-semibold text-ink-body-strong">{r.name}</div>
                <div className="mt-px text-[12px] leading-relaxed text-ink-label">{r.note}</div>
              </div>
            ))
          ) : (
            <GapChip title="No collateral pledged" provenance="Customer360Exposure — 0 Loan_Collateral2 rows" />
          )}
          {uniqueLendable !== null && (
            <div className="mt-auto flex items-baseline justify-between gap-5 border-t border-border pt-3.5 text-[14px] font-extrabold">
              <span>Distinct collateral lendable</span>
              <span className="tnum">{fmtMoney(uniqueLendable)}</span>
            </div>
          )}
        </Card>

        {/* Coverage ratio. Left-aligned like every other figure in the cockpit:
            a centred column of ragged lines was the "looks odd" the founder
            flagged (2026-07-29). The ratio and its verdict share one baseline. */}
        <Card className="px-6 py-5">
          <div className="kicker mb-3">Coverage ratio</div>
          <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-2">
            <span className="tnum text-[52px] font-extrabold leading-none tracking-tight" style={{ color: STATUS[covTone].fg }}>
              {covLabel}
            </span>
            <ToneChip tone={covTone}>{covStatus}</ToneChip>
          </div>
          <div className="mt-3.5 text-[12.5px] leading-relaxed text-ink-muted" style={{ textWrap: "pretty" as never }}>
            {uniqueLendable !== null
              ? `Lendable ${fmtMoney(uniqueLendable)}${uniqueCount !== null ? ` across ${uniqueCount} collateral ${uniqueCount === 1 ? "record" : "records"}` : ""} / Drawn ${fmtMoney(drawn)}`
              : "The source read does not carry a relationship coverage ratio."}
          </div>
          {/* A relationship can clear its floor while facilities under it do not.
              Saying so is the whole point of a per-facility ratio. */}
          {shortfallFacs.length > 0 && (
            <div className="mt-auto border-t border-divider pt-3 text-[12px] leading-relaxed text-ink-label" style={{ textWrap: "pretty" as never }}>
              {shortfallFacs.length} of {facs.length} {facs.length === 1 ? "facility is" : "facilities are"} under-covered at
              facility level.
            </div>
          )}
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
              <span>Collateral</span><span>Type</span><span className="text-right">Value</span><span className="text-right">Advance</span><span className="text-right">Lendable</span><span>Lien</span><span>Secures</span>
            </div>
            {records.map((r, i) => (
              <div
                key={r.collateralId ?? i}
                className="c360-row-in grid items-center gap-3 border-t border-divider px-6 py-3 text-[13px]"
                style={{ gridTemplateColumns: COL_COLS, animationDelay: staggerDelay(i) }}
              >
                <span className="font-bold">{r.displayName}</span>
                <span className="text-ink-body-strong">{r.collateralType ?? "—"}</span>
                <span className="tnum text-right font-semibold">{fmtMoney(r.currentValue)}</span>
                <span className="tnum text-right text-ink-body">{r.advanceRate != null ? fmtPct(r.advanceRate, 0) : "—"}</span>
                <span className="tnum text-right font-semibold">{fmtMoney(r.lendableValue)}</span>
                <span className="text-ink-body">{r.lienPosition ?? "—"}</span>
                <span className="text-ink-body">
                  {r.securesFacilities.length === 1 ? r.securesFacilities[0] : `${r.securesFacilities.length} facilities`}
                </span>
              </div>
            ))}
          </>
        ) : (
          <div className="flex flex-col gap-2 px-6 pb-4">
            <GapChip title="No collateral pledged" provenance="Customer360Exposure — 0 Loan_Collateral2 rows" />
            {reasons.map((r, i) => (
              <div key={i} className="text-[12px] leading-relaxed text-ink-label">
                <span className="font-semibold text-ink-body-strong">{r.name}:</span> {r.note}
              </div>
            ))}
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
          <span>Facility</span><span>Type</span><span className="text-right">Commitment</span><span className="text-right">Drawn</span><span className="text-right">Pledged</span><span className="text-right">Coverage</span><span>Maturity</span><span>Status</span>
        </div>
        {allFacs.map((f, i) => {
          const active = isActiveFacility(f);
          const tone = coverageTone(f.coverageRatio, f.coverageShortfall);
          const rate = f.interestRate != null ? `Note rate ${fmtRate(f.interestRate)}` : null;
          const sub = [rate, f.coverageNote].filter(Boolean).join(" · ");
          return (
            <div
              key={f.loanId ?? i}
              className="c360-row-in border-t border-divider px-6 py-3"
              style={{ animationDelay: staggerDelay(i) }}
            >
              <div className="grid items-center gap-3 text-[13px]" style={{ gridTemplateColumns: FAC_COLS }}>
                <span className="font-bold">{f.name ?? "Facility"}</span>
                <span className="text-ink-body-strong">{f.productType ?? "—"}</span>
                <span className="tnum text-right font-semibold">
                  <Pulse id={`facility.${f.loanId}.committed`}>{fmtMoney(f.committed)}</Pulse>
                </span>
                <span className="tnum text-right font-semibold">
                  <Pulse id={`facility.${f.loanId}.outstanding`}>{fmtMoney(f.outstanding)}</Pulse>
                </span>
                <span className="tnum text-right font-semibold">{fmtMoney(pledgedShare(f))}</span>
                <span className="tnum text-right font-bold" style={active ? { color: STATUS[tone].fg } : undefined}>
                  <Pulse id={`facility.${f.loanId}.coverageRatio`}>{fmtRatio(f.coverageRatio)}</Pulse>
                </span>
                <span className="text-ink-body">
                  <Pulse id={`facility.${f.loanId}.maturityDate`}>{fmtDate(f.maturityDate)}</Pulse>
                </span>
                <span className="justify-self-start">
                  {!active ? (
                    <ToneChip tone="neutral">{f.status ?? "Closed"}</ToneChip>
                  ) : (
                    <ToneChip tone={f.coverageShortfall ? "red" : "green"}>
                      {f.coverageShortfall ? "Shortfall" : f.riskGrade ? `Grade ${f.riskGrade}` : "Active"}
                    </ToneChip>
                  )}
                </span>
              </div>
              {/* The org's own reason a ratio is blank, verbatim. A credit officer
                  can act on "the pledges are Abundance-of-Caution"; nobody can act
                  on an em dash. */}
              {sub && <div className="mt-1.5 text-[11.5px] leading-relaxed text-ink-label">{sub}</div>}
            </div>
          );
        })}
      </Card>

      <NoteCaption note={exp.note} />
    </div>
  );
}
