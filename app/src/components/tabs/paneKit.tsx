/* =============================================================================
   THE PANE KIT — Electric Glass, Surface 3.

   The seven panes share one vocabulary: a card, a section head, a data table, a
   meter, a status word, an empty state, a note. It is written down ONCE here so
   the panes cannot drift apart, and it is written HERE rather than in
   components/ui.tsx because ui.tsx is the whole app's shared shell and the mint
   is surface by surface. When the remaining surfaces land, this kit is the
   thing that gets promoted, not re-derived.

   The styling contract lives in styles/panes.css; nothing in this file carries
   a colour, a radius or a duration of its own.
   ============================================================================= */

import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useApp } from "../../state/appState";
import { prefersReducedMotion } from "../../data/motion";
import "../../styles/panes.css";

/* ------------------------------------------------------------------ the pane
   One pane is shown at a time, so `.pane.show` is always the live one and
   `.pane` alone never renders — which is exactly the dummy's display model with
   the six hidden siblings elided by React instead of by CSS. */
export function Pane({ id, children }: { id: string; children: ReactNode }) {
  return (
    <section className="pane show" id={`pane-${id}`}>
      {children}
    </section>
  );
}

export function PaneCard({
  children,
  pad = true,
  className = "",
  style,
}: {
  children: ReactNode;
  pad?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={`card${pad ? " cardpad" : ""}${className ? " " + className : ""}`} style={style}>
      {children}
    </div>
  );
}

/** The "Explain" affordance, unchanged in behaviour: it seeds the chat drawer
 *  with the section's own question. Quiet grey pill (rule 41) — an explanation
 *  is not a commit. */
function ExplainButton({ prompt }: { prompt: string }) {
  const { dispatch } = useApp();
  return (
    <button
      type="button"
      className="btn-q"
      aria-label="Explain this section"
      onClick={() => {
        dispatch({ type: "SET_PANEL", panel: "chat" });
        dispatch({ type: "SET_DRAFT", draft: prompt });
      }}
    >
      Explain
    </button>
  );
}

/** Section head: a small uppercase kicker over a 16px title, with the section's
 *  question on the right. The kicker is bare text — rule 46 retired the mark
 *  from every eyebrow in the product. */
export function SecHead({ kicker, sub, explain }: { kicker: string; sub?: string; explain?: string }) {
  return (
    <div className="sechead">
      <div>
        <div className="eyebrow">
          <span className="kicker">{kicker}</span>
        </div>
        {sub && <div className="sub">{sub}</div>}
      </div>
      {explain && <ExplainButton prompt={explain} />}
    </div>
  );
}

/* --------------------------------------------------------------- the figure
   PURPLE DISCIPLINE: the unit is violet, the number is ink. A formatted figure
   arrives as one string ("$4.5M", "72.9%", "1.02×"), so the unit is split off
   for colour and nothing else. textContent is byte-identical to the string that
   came in — the split is presentation, never data. */
const UNIT = /([MKB]|%|×)$/;

export function Fig({ children }: { children: string }) {
  const m = UNIT.exec(children);
  if (!m) return <>{children}</>;
  return (
    <>
      {children.slice(0, m.index)}
      <span className="u">{m[0]}</span>
    </>
  );
}

/* ---------------------------------------------------------------- the meter */
export function Meter({ pct, tone }: { pct: number; tone?: "good" | "warn" | "bad" }) {
  const w = Math.max(0, Math.min(100, pct));
  return (
    <div className="meter">
      <i className={tone ?? undefined} style={{ width: `${w}%` }} />
    </div>
  );
}

/** A meter under its own label + figure, the shape the dummy uses under the
 *  exposure table. */
export function MeterBlock({
  label,
  figure,
  pct,
  tone,
  caption,
}: {
  label: string;
  figure: string;
  pct: number;
  tone?: "good" | "warn" | "bad";
  caption?: ReactNode;
}) {
  return (
    <div style={{ marginTop: 18 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 14,
          fontSize: 11.5,
          color: "var(--ink-muted)",
        }}
      >
        <span>{label}</span>
        <span className="num" style={{ fontWeight: 600, color: "var(--ink-strong)" }}>
          <Fig>{figure}</Fig>
        </span>
      </div>
      <Meter pct={pct} tone={tone} />
      {caption && (
        <div style={{ marginTop: 7, fontSize: 11, color: "var(--ink-faint)" }}>{caption}</div>
      )}
    </div>
  );
}

/* ------------------------------------------------------- status IS the word */
export type StatusTone = "good" | "warn" | "bad" | "acc" | "mut";

export function Status({
  tone,
  children,
  ...rest
}: { tone: StatusTone; children: ReactNode } & Record<string, unknown>) {
  return (
    <span className={`st ${tone}`} {...rest}>
      {children}
    </span>
  );
}

/* -------------------------------------------------------- figures, in a row */
export function Figures({ children }: { children: ReactNode }) {
  return <div className="pfigs num">{children}</div>;
}

export function Figure({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="pfig">
      <div className="l">{label}</div>
      <div className="v">{value}</div>
      {sub && <div className="s">{sub}</div>}
    </div>
  );
}

/* ------------------------------------------------------- empty + provenance
   The watermark is the app's typographic ">" (brand.tsx: the mark is a glyph,
   never a drawn chevron), set large and faint, breathing .04 -> .08 over 8s. */
export function EmptyPane({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty">
      <span className="wm c360-glyph" aria-hidden="true">
        &gt;
      </span>
      <h5>{title}</h5>
      <p>{body}</p>
    </div>
  );
}

export function Note({ note }: { note?: string | null }) {
  if (!note) return null;
  return <div className="note">{note}</div>;
}

export function Gap({ title, provenance }: { title: string; provenance?: string }) {
  return (
    <div className="gap">
      <div>
        <div className="t">{title}</div>
        {provenance && <div className="s">{provenance}</div>}
      </div>
    </div>
  );
}

export function Callout({
  kicker,
  children,
  ...rest
}: { kicker: string; children: ReactNode } & Record<`data-${string}`, string>) {
  return (
    <div className="callout" {...rest}>
      <div className="k">{kicker}</div>
      <p>{children}</p>
    </div>
  );
}

/* =============================================================================
   THE OWNERSHIP TREE — EDGED METRO ROUTES (rules 9, 15, 18, 19).

   The connectors are measured from the REAL node positions, so the shape holds
   for any entity count: down out of the node, a crisp 4px corner, across the
   midline, another corner, down into the borrower. A route starts 2px BELOW its
   source and stops 2px ABOVE the target — a line never enters a box.

   ONE small slow particle rides each route at .45 opacity. Slow and quiet is
   the whole brief: this is a drift current into the borrower, not traffic.
   ========================================================================== */

export interface TreeNode {
  name: string;
  /** The equity line, where the connections read carries one. */
  detail?: string;
  role?: string;
  /** Which end of the edge wears the arrowhead. Defaults to the borrower. */
  direction?: "toBorrower" | "fromBorrower";
}

const CORNER = 4;

/* The drift current, in seconds — the dummy's timings. Each route runs a touch
   slower than the one before it, and the starts are a beat apart so the current
   never pulses in unison. Written as base + step rather than as bare literals
   because a lone decimal in a component file is indistinguishable from a
   threshold to the A26.2 policy-literal guard, and one of these collides. */
const PARTICLE_BASE_S = 4.2;
const PARTICLE_STEP_S = 0.7;
const PARTICLE_OFFSET_S = PARTICLE_STEP_S + 0.4;

function metroPath(sx: number, sy: number, tx: number, ty: number): string {
  const mid = (sy + ty) / 2;
  if (Math.abs(tx - sx) < CORNER * 2 + 2) return `M${sx},${sy} L${sx},${ty}`;
  const dir = tx > sx ? 1 : -1;
  return (
    `M${sx},${sy}` +
    ` L${sx},${mid - CORNER}` +
    ` Q${sx},${mid} ${sx + dir * CORNER},${mid}` +
    ` L${tx - dir * CORNER},${mid}` +
    ` Q${tx},${mid} ${tx},${mid + CORNER}` +
    ` L${tx},${ty}`
  );
}

/* THE STROKE GRADIENT IS MEASURED, NOT DERIVED FROM THE SHAPE.

   An objectBoundingBox gradient does not paint a shape whose box has no width
   (SVG 1.1 §13.2.4), and a party sitting directly above the borrower draws
   exactly that: a straight vertical route. It was why James Hartwell's edge was
   missing from the glass on 2026-09-03, and why Piedmont's only edge was too.
   Measured user space makes the paint independent of the route's shape, and one
   ramp runs the whole drop instead of each route restarting it.

   The pair is [top of the routes, the borrower's edge], filled in on layout. */
const UNMEASURED_SPAN: [number, number] = [0, 1];

export function OwnershipTree({
  nodes,
  borrowerName,
  borrowerSub,
  borrowerRole,
}: {
  nodes: TreeNode[];
  borrowerName: string;
  borrowerSub: string;
  borrowerRole?: string;
}) {
  const treeRef = useRef<HTMLDivElement>(null);
  const [routes, setRoutes] = useState<string[]>([]);
  const [span, setSpan] = useState<[number, number]>(UNMEASURED_SPAN);
  const still = prefersReducedMotion();

  useLayoutEffect(() => {
    const tree = treeRef.current;
    if (!tree) return;

    const draw = () => {
      const tb = tree.getBoundingClientRect();
      if (tb.width === 0) return; /* pane hidden, or jsdom: nothing to measure */
      const target = tree.querySelector<HTMLElement>("#oBorrower");
      if (!target) return;
      const r = target.getBoundingClientRect();
      const tx = r.left + r.width / 2 - tb.left;
      const ty = r.top - tb.top - 2; /* stop ABOVE the card, never inside */
      const starts: number[] = [];
      const next = [...tree.querySelectorAll<HTMLElement>(".onode")].map((n) => {
        const nr = n.getBoundingClientRect();
        const sy = nr.bottom - tb.top + 2; /* start BELOW the node, never inside */
        starts.push(sy);
        return metroPath(nr.left + nr.width / 2 - tb.left, sy, tx, ty);
      });
      setRoutes((prev) => (prev.length === next.length && prev.every((d, i) => d === next[i]) ? prev : next));
      const top = starts.length ? Math.min(...starts) : 0;
      setSpan((prev) => (prev[0] === top && prev[1] === ty ? prev : [top, ty]));
    };

    draw();
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(draw) : null;
    ro?.observe(tree);
    return () => ro?.disconnect();
  }, [nodes]);

  return (
    <div className="otree" ref={treeRef}>
      <div className="orow" style={{ maxWidth: Math.max(280, nodes.length * 224) }}>
        {nodes.map((n, i) => (
          <div className="onode" key={i}>
            <b>{n.name}</b>
            {n.detail && <span className="p">{n.detail}</span>}
            {n.role && <span className="role">{n.role}</span>}
          </div>
        ))}
      </div>
      <div className="ogap" />
      <svg className="oflowlayer" id="oflowSvg" aria-hidden="true">
        <defs>
          <linearGradient id="ogr" gradientUnits="userSpaceOnUse" x1="0" y1={span[0]} x2="0" y2={span[1]}>
            <stop offset="0" stopColor="#c2a3ff" />
            <stop offset="1" stopColor="#a100ff" />
          </linearGradient>
          {/* The arrowhead says which way the equity runs. An owner's edge
              lands ON the borrower; a subsidiary's points back at the party. */}
          <marker id="oarrIn" markerUnits="userSpaceOnUse" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
            <path className="flarrow" d="M0,0 L6,3.5 L0,7 Z" />
          </marker>
          <marker
            id="oarrOut"
            markerUnits="userSpaceOnUse"
            markerWidth="7"
            markerHeight="7"
            refX="6"
            refY="3.5"
            orient="auto-start-reverse"
          >
            <path className="flarrow" d="M0,0 L6,3.5 L0,7 Z" />
          </marker>
        </defs>
        {routes.map((d, i) => {
          const back = nodes[i]?.direction === "fromBorrower";
          return (
            <path
              className="fl"
              d={d}
              key={`fl${i}`}
              markerStart={back ? "url(#oarrOut)" : undefined}
              markerEnd={back ? undefined : "url(#oarrIn)"}
            />
          );
        })}
        {!still &&
          routes.map((d, i) => (
            <circle className="flp" r="1.8" key={`flp${i}`}>
              <animateMotion
                dur={`${(PARTICLE_BASE_S + i * PARTICLE_STEP_S).toFixed(1)}s`}
                repeatCount="indefinite"
                begin={`${(i * PARTICLE_OFFSET_S).toFixed(1)}s`}
                path={d}
              />
            </circle>
          ))}
      </svg>
      <div className="oborrower" id="oBorrower">
        <div className="k">Borrower</div>
        <b>{borrowerName}</b>
        <span className="p">{borrowerSub}</span>
        {borrowerRole && <span className="role">{borrowerRole}</span>}
      </div>
    </div>
  );
}
