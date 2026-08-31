import type { BorrowerBundle, Collateral, Facility } from "../../data/contract";
import { fmtMoney, fmtPct, fmtDate } from "../../data/format";
import { fmtRatio, fmtRate, type Tone } from "../../data/finance";
import { Pulse } from "../Pulse";
import { Odo } from "../Odometer";
import { useApp } from "../../state/appState";
import { collateralRecords } from "../../data/collateralRecords";
import { isActiveFacility } from "../../data/worklist";
import {
  EmptyPane,
  Fig,
  Figure,
  Figures,
  Gap,
  MeterBlock,
  Note,
  Pane,
  PaneCard,
  SecHead,
  Status,
  type StatusTone,
} from "./paneKit";

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

/** Status IS typography here (systemNonNegotiable): the tone maps to a coloured
 *  word with a 5px dot, never to a filled pill. */
const STATUS_WORD: Record<Tone, StatusTone> = {
  green: "good",
  amber: "warn",
  red: "bad",
  purple: "acc",
  neutral: "mut",
};

export function ExposureTab({ bundle }: { bundle: BorrowerBundle }) {
  const { state } = useApp();
  const writeBackMM = (state.accountId && state.writeBacks[state.accountId]) || 0;
  const exp = bundle.exposure ?? {};
  const allFacs = exp.facilities ?? [];
  // F6: closed / paid-off facilities stay visible (with a status word) but are
  // excluded from the lendable + coverage math.
  const facs = allFacs.filter(isActiveFacility);

  if (!allFacs.length) {
    return (
      <Pane id="exposure">
        <PaneCard>
          <SecHead kicker="Facilities" sub="Exposure & collateral" explain={EXPLAIN} />
          <EmptyPane
            title="No active facilities"
            body="No active facilities found for this account in the source org."
          />
          <Note note={exp.note} />
        </PaneCard>
      </Pane>
    );
  }

  /* WRITE-BACK THROUGH THE GLASS (rule 62), applied ONCE at the source. Every
     figure on this pane is derived from `committed` — the strip, the drawn
     percentage, the coverage ratio and the table total — so a delta applied to
     the total alone would leave the pane disagreeing with itself, and with what
     the room said out loud while staging it. If the commitment moved, the
     utilisation and the coverage moved with it. */
  const committed = (exp.totalCommitted ?? 0) + writeBackMM * 1e6;
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
    <Pane id="exposure">
      <PaneCard>
        <SecHead kicker="Facilities" sub="Exposure & collateral" explain={EXPLAIN} />

        {/* The pane's own headline figures. The hero carries the relationship
            anchors; these are the ones the exposure read owns. */}
        <Figures>
          <Figure
            label="Committed"
            value={
              <Pulse id="exposure.totalCommitted">
                <Fig>{fmtMoney(committed)}</Fig>
              </Pulse>
            }
            sub="Total commitment"
          />
          <Figure
            label="Drawn"
            value={
              <Pulse id="exposure.totalOutstanding">
                <Fig>{fmtMoney(drawn)}</Fig>
              </Pulse>
            }
            sub="Outstanding balance"
          />
          <Figure
            label="Collateral coverage"
            value={<Fig>{covLabel}</Fig>}
            sub={<Status tone={STATUS_WORD[covTone]}>{covStatus}</Status>}
          />
          {uniqueCount !== null && (
            <Figure
              label="Distinct collateral"
              value={String(uniqueCount)}
              sub={uniqueCount === 1 ? "record" : "records"}
            />
          )}
        </Figures>

        <table className="dt num" style={{ marginTop: 20 }}>
          <thead>
            <tr>
              <th>Facility</th>
              <th>Type</th>
              <th className="r">Commitment</th>
              <th className="r">Drawn</th>
              <th className="r">Pledged</th>
              <th className="r">Coverage</th>
              <th className="r">Maturity</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {allFacs.map((f, i) => {
              const active = isActiveFacility(f);
              const rate = f.interestRate != null ? `Note rate ${fmtRate(f.interestRate)}` : null;
              // The org's own reason a ratio is blank, verbatim. A credit officer
              // can act on "the pledges are Abundance-of-Caution"; nobody can act
              // on an em dash.
              const sub = [rate, f.coverageNote].filter(Boolean).join(" · ");
              return [
                <tr key={f.loanId ?? i}>
                  <td>{f.name ?? "Facility"}</td>
                  <td>{f.productType ?? "—"}</td>
                  <td className="r">
                    <Pulse id={`facility.${f.loanId}.committed`}>
                      <Fig>{fmtMoney(f.committed)}</Fig>
                    </Pulse>
                  </td>
                  <td className="r">
                    <Pulse id={`facility.${f.loanId}.outstanding`}>
                      <Fig>{fmtMoney(f.outstanding)}</Fig>
                    </Pulse>
                  </td>
                  <td className="r">
                    <Fig>{fmtMoney(pledgedShare(f))}</Fig>
                  </td>
                  <td className="r">
                    <Pulse id={`facility.${f.loanId}.coverageRatio`}>
                      <Fig>{fmtRatio(f.coverageRatio)}</Fig>
                    </Pulse>
                  </td>
                  <td className="r">
                    <Pulse id={`facility.${f.loanId}.maturityDate`}>{fmtDate(f.maturityDate)}</Pulse>
                  </td>
                  <td>
                    {!active ? (
                      <Status tone="mut">{f.status ?? "Closed"}</Status>
                    ) : (
                      <Status tone={f.coverageShortfall ? "bad" : "good"}>
                        {f.coverageShortfall ? "Shortfall" : f.riskGrade ? `Grade ${f.riskGrade}` : "Active"}
                      </Status>
                    )}
                  </td>
                </tr>,
                sub ? (
                  <tr className="subrow" key={`${f.loanId ?? i}-note`}>
                    <td colSpan={8}>{sub}</td>
                  </tr>
                ) : null,
              ];
            })}
            <tr className="total">
              <td>Total</td>
              <td />
              {/* The exposure total ROLLS when a workroom execute walks the
                  committed figure forward (rule 62), and simply reads the org's
                  own number the rest of the time. */}
              <td className="r num">
                <Odo id="tblExpTotal" value={fmtMoney(committed)} />
              </td>
              <td className="r">{fmtMoney(drawn)}</td>
              <td />
              <td />
              <td />
              <td />
            </tr>
          </tbody>
        </table>

        <MeterBlock
          label="Committed vs Drawn"
          figure={`${drawnPct}%`}
          pct={drawnPct}
          caption={
            <>
              Drawn <b style={{ color: "var(--ink-strong)" }}>{fmtMoney(drawn)}</b> · Available{" "}
              <b style={{ color: "var(--ink-strong)" }}>{fmtMoney(avail)}</b>
            </>
          }
        />
      </PaneCard>

      <div className="pane-grid">
        <PaneCard>
          <div className="kicker" style={{ marginBottom: 12 }}>
            Pledges · facility share
          </div>
          {pledges.length ? (
            <div className="ratio-rows num">
              {pledges.map((p, i) => (
                <div className="rr" key={i}>
                  <span>
                    {p.collateralType ?? "Collateral"}
                    {p.lienPosition ? ` · ${p.lienPosition}` : ""}
                    {p.advanceRate != null ? ` · ${fmtPct(p.advanceRate, 0)} adv` : ""}
                    {p.advanceRateSource ? ` · ${p.advanceRateSource}` : ""}
                  </span>
                  <b>
                    <Fig>{fmtMoney(p.amountPledged ?? p.currentLendableValue ?? p.collateralValue)}</Fig>
                  </b>
                </div>
              ))}
            </div>
          ) : reasons.length ? (
            // Not "no collateral". The org says the pledges exist and are out of
            // the math, which is a different fact and the one a banker needs.
            <div className="ratio-rows">
              {reasons.map((r, i) => (
                <div className="rr" key={i} style={{ display: "block" }}>
                  <b>{r.name}</b>
                  <div style={{ marginTop: 2, fontSize: 12, color: "var(--ink-muted)" }}>{r.note}</div>
                </div>
              ))}
            </div>
          ) : (
            <Gap title="No collateral pledged" provenance="Customer360Exposure — 0 Loan_Collateral2 rows" />
          )}
          {uniqueLendable !== null && (
            <div
              className="num"
              style={{
                marginTop: "auto",
                paddingTop: 14,
                borderTop: "1px solid var(--border)",
                display: "flex",
                justifyContent: "space-between",
                gap: 14,
                fontSize: 13.5,
                fontWeight: 600,
                color: "var(--ink-strong)",
              }}
            >
              <span>Distinct collateral lendable</span>
              <span>
                <Fig>{fmtMoney(uniqueLendable)}</Fig>
              </span>
            </div>
          )}
        </PaneCard>

        {/* Coverage ratio. One big figure, its verdict as a status word beside
            it, and the ratio SHOWN as a bar against its own ceiling — two
            figures divided by each other read as a sentence; one bar reads at a
            glance, which is what a coverage number is for. */}
        <PaneCard>
          <div className="kicker" style={{ marginBottom: 10 }}>
            Coverage ratio
          </div>
          <div className="bigfig num">
            <span className="n">
              <Fig>{covLabel}</Fig>
            </span>
            <Status tone={STATUS_WORD[covTone]}>{covStatus}</Status>
          </div>
          {uniqueLendable !== null && uniqueLendable > 0 ? (
            <MeterBlock
              label="Drawn against distinct lendable"
              figure={fmtMoney(drawn)}
              pct={Math.min(1, drawn / uniqueLendable) * 100}
              tone={covTone === "red" ? "bad" : covTone === "amber" ? "warn" : "good"}
              caption={
                <>
                  Lendable <b style={{ color: "var(--ink-strong)" }}>{fmtMoney(uniqueLendable)}</b>
                  {uniqueCount !== null &&
                    ` across ${uniqueCount} collateral ${uniqueCount === 1 ? "record" : "records"}`}
                </>
              }
            />
          ) : (
            <p style={{ margin: "12px 0 0", fontSize: 12.5, lineHeight: 1.6, color: "var(--ink-muted)" }}>
              The source read does not carry a relationship coverage ratio.
            </p>
          )}
          {/* A relationship can clear its floor while facilities under it do not.
              Saying so is the whole point of a per-facility ratio. */}
          {shortfallFacs.length > 0 && (
            <div className="note" style={{ marginTop: "auto" }}>
              {shortfallFacs.length} of {facs.length} {facs.length === 1 ? "facility is" : "facilities are"}{" "}
              under-covered at facility level.
            </div>
          )}
        </PaneCard>
      </div>

      {/* COLLATERAL RECORDS. One row per piece of security, not per pledge: the
          exposure read returns a pledge per facility, so a warehouse securing
          three loans arrives three times. A banker reads their collateral once,
          with what it is worth and what it secures. */}
      <PaneCard>
        <div className="kicker" style={{ marginBottom: 12 }}>
          Collateral
        </div>
        {records.length ? (
          <table className="dt num">
            <thead>
              <tr>
                <th>Collateral</th>
                <th>Type</th>
                <th className="r">Value</th>
                <th className="r">Advance</th>
                <th className="r">Lendable</th>
                <th>Lien</th>
                <th>Secures</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r, i) => (
                <tr key={r.collateralId ?? i}>
                  <td>{r.displayName}</td>
                  <td>{r.collateralType ?? "—"}</td>
                  <td className="r">
                    <Fig>{fmtMoney(r.currentValue)}</Fig>
                  </td>
                  <td className="r">{r.advanceRate != null ? <Fig>{fmtPct(r.advanceRate, 0)}</Fig> : "—"}</td>
                  <td className="r">
                    <Fig>{fmtMoney(r.lendableValue)}</Fig>
                  </td>
                  <td>{r.lienPosition ?? "—"}</td>
                  <td>
                    {r.securesFacilities.length === 1
                      ? r.securesFacilities[0]
                      : `${r.securesFacilities.length} facilities`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start" }}>
            <Gap title="No collateral pledged" provenance="Customer360Exposure — 0 Loan_Collateral2 rows" />
            {reasons.map((r, i) => (
              <div key={i} style={{ fontSize: 12, lineHeight: 1.6, color: "var(--ink-muted)" }}>
                <b style={{ color: "var(--ink)" }}>{r.name}:</b> {r.note}
              </div>
            ))}
          </div>
        )}
      </PaneCard>

      <Note note={exp.note} />
    </Pane>
  );
}
