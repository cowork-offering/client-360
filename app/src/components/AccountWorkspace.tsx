import { useEffect, useRef } from "react";
import { useApp } from "../state/appState";
import { readAnchors, type Anchor, type BorrowerBundle } from "../data/contract";
import { STATUS } from "../data/finance";
import { gradeColor } from "./RiskGrade";
import { PackageStageChip } from "./PackageStage";
import { TabContent } from "./tabs";
import { SyncButton } from "./SyncSweep";
import { OpenAccountInNcino } from "./DeepLink";
import { prefersReducedMotion } from "../data/motion";
import { Odo } from "./Odometer";

/* =============================================================================
   SURFACE 2 — THE CLIENT HERO.

   Rule 8: the client identity is its OWN floating glass hero panel — bloom
   inside the glass, an oversized > watermark leaning against the cursor, the
   crumb, the name, the verdict and the anchor strip. The frosted verdict BAR it
   replaces was the app's one glass census violation (0 rims, an 18px blur of its
   own, sticky at the top of an inner scroller); the hero takes the `.eg-glass`
   recipe, so the rims are structural now rather than remembered.

   THE TAB RAIL IS GONE FROM HERE. Rule 11 moved the workspace nav into the
   header capsule, dead centre, where TopBar renders it from the same
   ACCOUNT_TABS this file used to lay out along a border. What is left here is
   the pane the capsule selects.
   ============================================================================= */

/** The circumference the mint draws the grade ring on: 2πr at r=19. */
const RING_CIRCUMFERENCE = 119.4;
/**
 * The rating scale the ring reads against. The mint draws grade 3 at offset
 * 74.6 and grade 7 at 14.9 on that circumference, which is exactly g/8 of the
 * ring in both cases; its third client (grade 5) is authored at 41.8, three
 * pixels off the line those two define and the one hand-typed figure in the
 * set. The rule the pair agree on is the rule.
 */
const GRADE_SCALE = 8;

function ringOffset(grade: string | null): number {
  const n = grade == null ? NaN : parseInt(grade, 10);
  if (Number.isNaN(n)) return RING_CIRCUMFERENCE;
  const filled = Math.max(0, Math.min(1, n / GRADE_SCALE));
  return +(RING_CIRCUMFERENCE * (1 - filled)).toFixed(1);
}

/** True for the strip's rating cell, whatever the agent labelled it. */
function isRatingAnchor(a: Anchor): boolean {
  return /^(risk\s*)?(rating|grade)$/i.test(a.label.trim());
}

/**
 * THE ANCHOR A WRITE-BACK MOVES (rule 62).
 *
 * The workroom's manifest carries a COMMITTED delta, so the cell it lands on is
 * the one the read calls committed or total exposure — whatever the agent
 * labelled it. Nothing else in the strip is touched: a room that moved a figure
 * it did not compute would be worse than a room that moved none.
 */
function isExposureAnchor(a: Anchor): boolean {
  return /^(total\s+)?(committed|exposure|total\s+exposure|commitment)$/i.test(a.label.trim());
}

/** The anchor's figure, walked forward by a landed write-back. The value is a
 *  string the agent composed, so the delta is applied to the NUMBER inside it
 *  and re-set at the precision it was already written to — which is also what
 *  keeps the old and new strings the same length, and therefore rollable. */
function withWriteBack(value: string, deltaMM: number): string {
  if (!deltaMM) return value;
  const m = value.match(/^(\D*)(\d+(?:\.\d+)?)(.*)$/);
  if (!m) return value;
  const [, head, digits, tail] = m;
  const dp = digits.includes(".") ? digits.split(".")[1].length : 0;
  return `${head}${(parseFloat(digits) + deltaMM).toFixed(dp)}${tail}`;
}

/** Split "$12.5M" / "1.42×" / "75 days" into the figure and its unit. Purple
 *  discipline allows exactly one violet on a number, and it is the unit. */
function splitUnit(value: string): [string, string] {
  const m = value.match(/^(.*?\d)(\s*[^\d]+)$/);
  return m ? [m[1], m[2]] : [value, ""];
}

function AnchorCell({ a, deltaMM, washed }: { a: Anchor; deltaMM: number; washed: boolean }) {
  const moved = isExposureAnchor(a);
  const [figure, unit] = splitUnit(moved ? withWriteBack(a.value, deltaMM) : a.value);
  const arrow = a.dir === "down" ? "↓" : a.dir === "up" ? "↑" : "";
  const arrowColor = a.dir === "down" ? STATUS.red.fg : STATUS.green.fg;
  return (
    <div className={`anchor ${moved && washed ? "washed" : ""}`} id={moved ? "ancExposure" : undefined}>
      <div className="l">{a.label}</div>
      <div className="v num">
        {/* A FIGURE NEVER SWAPS, IT ROLLS (rule 61). The odometer owns the text
            node, so a write-back landing behind the workroom's blur is watched
            turning over rather than found already changed. */}
        {moved ? <Odo id="ancExpV" value={figure} /> : figure}
        {unit && <span className="u">{unit}</span>}
        {arrow && (
          <span className="dn" style={{ color: arrowColor }}>
            {arrow}
          </span>
        )}
      </div>
      {a.sub && <div className="s">{a.sub}</div>}
    </div>
  );
}

/** The grade cell: the ring states the rating as a quantity, the text states it
 *  as a word. A28.2 keeps the package STAGE out of here — it is a different
 *  fact about a different object and it has its own chip beside the name — so
 *  the anchor's own `sub` is dropped and provenance stays where it has always
 *  been, on the cell's title. The mint spells a source and a rating date on
 *  this line; this book carries neither, and a caption is not worth inventing
 *  one for. */
function GradeCell({ anchor, grade }: { anchor: Anchor | undefined; grade: string | null }) {
  if (!anchor) return null;
  return (
    <div className="anchor grade-cell" title="nCino risk rating">
      <svg className="gr" viewBox="0 0 46 46" aria-hidden="true">
        <circle className="bg" cx="23" cy="23" r="19" fill="none" strokeWidth="4" />
        <circle
          className="fg"
          cx="23"
          cy="23"
          r="19"
          fill="none"
          strokeWidth="4"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={ringOffset(grade)}
          transform="rotate(-90 23 23)"
        />
        <text x="23" y="28" textAnchor="middle">
          {grade ?? "—"}
        </text>
      </svg>
      <div>
        <div className="l">{anchor.label}</div>
        <div className="v" style={{ fontSize: 13, color: gradeColor(grade) ?? undefined }}>
          {anchor.value}
        </div>
      </div>
    </div>
  );
}

/** Rule 62.1 — the ring DRAWS itself on every client entry: pinned back to the
 *  full circumference with the transition off, then released to the grade over
 *  1s. Without the reflow between the two writes the browser coalesces them and
 *  nothing moves. */
function useRingDraw(accountId: string | null) {
  useEffect(() => {
    const fg = document.querySelector<SVGCircleElement>("#view-account .gr .fg");
    if (!fg || prefersReducedMotion()) return;
    const target = fg.getAttribute("stroke-dashoffset") ?? "";
    fg.style.transition = "none";
    fg.style.strokeDashoffset = String(RING_CIRCUMFERENCE);
    fg.getBoundingClientRect();
    fg.style.transition = "";
    const raf = requestAnimationFrame(() => {
      fg.style.strokeDashoffset = target;
    });
    return () => cancelAnimationFrame(raf);
  }, [accountId]);
}

/** Rule 62.3 — hero depth. The watermark leans up to 6px/4px AGAINST the
 *  cursor over a 1.2s settle. Depth, never a gimmick wobble, so the pointer has
 *  to be near the panel for it to answer at all. */
function useWatermarkLean(hero: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const onMove = (e: PointerEvent) => {
      const el = hero.current;
      const wm = el?.querySelector<HTMLElement>(".acct-wm");
      if (!el || !wm) return;
      const r = el.getBoundingClientRect();
      if (e.clientY < r.top - 80 || e.clientY > r.bottom + 80) return;
      const dx = ((e.clientX - r.left) / r.width - 0.5) * -6;
      const dy = ((e.clientY - r.top) / r.height - 0.5) * -4;
      wm.style.transform = `translate(${dx.toFixed(1)}px,${dy.toFixed(1)}px)`;
    };
    document.addEventListener("pointermove", onMove, { passive: true });
    return () => document.removeEventListener("pointermove", onMove);
  }, [hero]);
}

export function AccountWorkspace({ bundle }: { bundle: BorrowerBundle }) {
  const { data, state, dispatch } = useApp();
  const snap = bundle.snapshot;
  const account = data.portfolio.accounts.find((a) => a.accountId === state.accountId);
  const name = account?.name ?? snap?.name ?? "—";
  const sector = [snap?.industry, snap?.naicsCode ? `NAICS ${snap.naicsCode}` : null].filter(Boolean).join(" · ") || "—";
  const grade = snap?.primaryRiskRating ?? null;

  const anchors = readAnchors(bundle);
  const ratingAnchor = anchors.find(isRatingAnchor);
  const rest = anchors.filter((a) => a !== ratingAnchor);

  /* WRITE-BACK THROUGH THE GLASS (rule 62). An execute in the workroom walked
     the committed figure forward; the anchor rolls to it while the room is
     still open, and the violet wash settles on it ONCE when the glass lifts. */
  const deltaMM = (state.accountId && state.writeBacks[state.accountId]) || 0;
  const washing = !!state.accountId && state.washes.includes(state.accountId);
  useEffect(() => {
    if (!washing || !state.accountId) return;
    const id = state.accountId;
    const t = window.setTimeout(() => dispatch({ type: "CLEAR_WASH", accountId: id }), 1900);
    return () => clearTimeout(t);
  }, [washing, state.accountId, dispatch]);

  const hero = useRef<HTMLDivElement | null>(null);
  useRingDraw(state.accountId);
  useWatermarkLean(hero);

  return (
    <>
      <div className="page" style={{ paddingTop: 22 }}>
        <div className="hero eg-glass" ref={hero}>
          {/* Rule 40: the hero watermark is one of the six sanctioned mark
              sites, and it is the SAME typographic ">" the rest of the app
              uses — never a second, drawn rendition of the shape. */}
          <span aria-hidden="true" className="c360-glyph acct-wm">
            &gt;
          </span>
          <div className="crumb">
            <button type="button" id="goHome" onClick={() => dispatch({ type: "GO_HOME" })}>
              ‹ Worklist
            </button>
            <span>/</span>
            <span>{sector}</span>
          </div>
          <div className="acct-name-row">
            <span className="acct-name">{name}</span>
            <PackageStageChip snapshot={snap} />
            {/* The Client Actions button is RETIRED (founder call, 2026-08-31
                night): the > FAB arc owns client actions now, full stop. Sync
                stays as the hero's one quiet secondary control. */}
            <span className="hero-controls">
              {/* THE CLIENT, IN nCINO. A banker standing on a relationship
                  wants the account record itself sometimes, and the cockpit was
                  making them go and find it. Ink-quiet on purpose: it is the
                  hero's second quiet control, never a third button competing
                  with Sync. NO HOST, NO LINK — `meta.instanceUrl` absent
                  renders nothing rather than a guessed My Domain (A29). */}
              <OpenAccountInNcino accountId={snap.accountId} />
              <SyncButton accountId={snap.accountId} accountName={name} bundle={bundle} />
            </span>
          </div>
          {bundle.verdict && <p className="verdict">{bundle.verdict}</p>}
          <div className="anchors num">
            <GradeCell anchor={ratingAnchor} grade={grade} />
            {rest.map((a) => (
              <AnchorCell key={a.label} a={a} deltaMM={deltaMM} washed={washing} />
            ))}
          </div>
        </div>
      </div>

      {/* The pane the capsule selected. Re-keyed per tab so `panein` replays:
          a 3px settle, never the view-level 8px jump (rule 61). */}
      <div className="page">
        <section className="pane show" id={`pane-${state.tab}`} key={state.tab}>
          <TabContent tab={state.tab} bundle={bundle} />
        </section>
      </div>
    </>
  );
}
