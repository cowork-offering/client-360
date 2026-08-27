import { useState, type CSSProperties, type ReactNode } from "react";
import { useApp } from "../state/appState";
import { STATUS, type Tone } from "../data/finance";
import { AccentureCaretWatermark, BrandGlyph } from "./brand";

/** Single page container — one max-width, one gutter (A25.3). */
export function PageContainer({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`page ${className}`}>{children}</div>;
}

/** Card. `h-full` + column flex so siblings in a grid row share exact top and
 *  bottom edges (A25.3); hover lift is opt-out for non-interactive panels.
 *
 *  `className` lands on the SHELL, and the shell is a column. Anything that
 *  needs a row (a stat strip, a figure beside a divider) must own its own
 *  wrapper inside the card — see StatStrip. Passing `flex-wrap items-center`
 *  to Card instead centred a shrink-wrapped column and read as a broken strip
 *  (founder, 2026-07-29). */
export function Card({
  children,
  watermark = false,
  hover = true,
  className = "",
  style,
}: {
  children: ReactNode;
  watermark?: boolean;
  hover?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={`relative flex h-full flex-col overflow-hidden rounded-[14px] bg-raised ${hover ? "c360-hover-lift" : ""} ${className}`}
      style={{ boxShadow: "var(--shadow-card)", ...style }}
    >
      {watermark && <AccentureCaretWatermark />}
      <div className="relative flex flex-1 flex-col">{children}</div>
    </div>
  );
}

export function Kicker({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div className="kicker" style={style}>
      {children}
    </div>
  );
}

function ExplainButton({ prompt }: { prompt: string }) {
  const { dispatch } = useApp();
  return (
    <button
      type="button"
      onClick={() => {
        dispatch({ type: "SET_PANEL", panel: "chat" });
        dispatch({ type: "SET_DRAFT", draft: prompt });
      }}
      aria-label="Explain this section"
      className="c360-press inline-flex flex-none items-center gap-1.5 rounded-lg border border-border bg-raised px-2.5 py-1 text-[11px] font-semibold text-ink-muted hover:border-accent hover:text-accent"
    >
      <svg width="13" height="13" viewBox="0 0 14 14">
        <circle cx="7" cy="7" r="5.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <path d="M7 4.4v.1M7 6.4v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
      Explain
    </button>
  );
}

/** Section header with legacy kicker + optional subtitle + optional "Explain"
 *  affordance that seeds the chat drawer (SPEC §6.3 — chat replaces the legacy
 *  explain panel). */
export function SectionHead({ kicker, subtitle, explain }: { kicker: string; subtitle?: string; explain?: string }) {
  return (
    <div className="mb-1.5 flex items-start justify-between gap-3" style={{ marginBottom: subtitle ? 14 : 6 }}>
      <div>
        <Kicker>{kicker}</Kicker>
        {subtitle && <div className="mt-0.5 text-[16px] font-bold text-ink">{subtitle}</div>}
      </div>
      {explain && <ExplainButton prompt={explain} />}
    </div>
  );
}

export function GapChip({ title, provenance }: { title: string; provenance?: string }) {
  return (
    <div className="inline-flex items-start gap-2.5 rounded-[10px] border border-dashed border-border-strong bg-wash px-3 py-2.5">
      <svg width="15" height="15" viewBox="0 0 16 16" className="mt-px flex-none text-ink-faint">
        <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
        <path d="M8 5.2v.1M8 7.4v3.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <div>
        <div className="text-[12.5px] font-semibold text-ink-body">{title}</div>
        {provenance && <div className="mt-px text-[11px] text-ink-faint">{provenance}</div>}
      </div>
    </div>
  );
}

/** An empty state is a QUIET VISUAL, not a paragraph. The mark stands in for
 *  the grey circle-with-a-line that used to sit here — the same ">" that
 *  carries every other pause in this app — and the body is one line under a
 *  short title. Nothing here explains the machinery. */
export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <BrandGlyph className="mb-1 text-[34px] leading-none opacity-20" />
      <div className="text-[14px] font-bold text-ink-body-strong">{title}</div>
      <div className="max-w-[380px] text-[12.5px] leading-relaxed text-ink-label">{body}</div>
    </div>
  );
}

export function NoteCaption({ note }: { note?: string | null }) {
  if (!note) return null;
  return (
    <div className="mt-3 border-t border-divider pt-3 text-[11px] leading-relaxed text-ink-faint" style={{ textWrap: "pretty" as never }}>
      {note}
    </div>
  );
}

/**
 * THE TECHNICAL ACCOUNT, ONE CLICK AWAY (founder finding F4, 2026-08-25).
 *
 * Contract paths, wire field names, tool names and record ids are real and
 * somebody needs them. That somebody is not the banker reading a ticket, who
 * on 2026-08-25 was shown
 * "borrower.covenants.covenants[].actualValue is present but null ·
 * Customer360Covenants" and could act on none of it. Every such string now
 * renders through here: a small labelled affordance, the detail also on the
 * title attribute so a hover answers it without a click.
 */
export function TechnicalToggle({
  label = "Where this comes from",
  detail,
}: {
  label?: string;
  detail?: string | null;
}) {
  const [open, setOpen] = useState(false);
  if (!detail) return null;
  return (
    <div className="mt-1.5">
      <button
        type="button"
        aria-expanded={open}
        title={detail}
        onClick={() => setOpen((v) => !v)}
        // ink-muted, not ink-faint: this affordance renders on three different
        // grounds — the card, the warning banner and the deal header's accent
        // wash — and only ink-muted clears 3:1 on all of them.
        className="c360-press text-[10px] font-semibold text-ink-muted underline decoration-dotted underline-offset-2 hover:text-ink"
      >
        {label}
      </button>
      {open && <div className="mt-1 break-words font-mono text-[10px] leading-relaxed text-ink-muted">{detail}</div>}
    </div>
  );
}

/* -------------------------------------------------------------- stat strip
   The row of headline figures that opens a tab. ONE definition, so Exposure,
   Covenants and the four onboarding tabs cannot drift apart, and so the row is
   a row: the strip lives INSIDE the card body, never as classes on the shell.

   Cells are top-aligned and stretch to the tallest, which puts every label on
   one baseline and every figure on the next, and lets a divider run the full
   height of the strip without being told how tall it is. */

export function StatStrip({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <Card className="px-6 py-4">
      {/* No `items-*` in the base: stretch is already the flex default, and a
          base alignment here would collide with one a caller passes in. */}
      <div className={`flex flex-wrap gap-x-9 gap-y-4 ${className}`}>{children}</div>
    </Card>
  );
}

/** Hairline between two stat cells. Full-height by stretch, never a fixed px. */
export function StatDivider() {
  return <div aria-hidden="true" className="w-px flex-none self-stretch bg-border" />;
}

/** One figure in a stat strip: label above, figure below, both left-aligned on
 *  the strip's shared baselines. Figures are tabular so columns of them line
 *  up digit for digit. */
export function StatCell({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  color?: string;
}) {
  return (
    <div className="flex flex-col justify-start text-left">
      <div className="text-[11px] font-semibold leading-tight text-ink-label">{label}</div>
      <div className="tnum mt-1 text-[23px] font-extrabold leading-none tracking-tight" style={color ? { color } : undefined}>
        {value}
      </div>
      {sub && <div className="mt-1.5 text-[11.5px] leading-tight text-ink-muted">{sub}</div>}
    </div>
  );
}

export function ToneChip({ tone, children }: { tone: Tone; children: ReactNode }) {
  const s = STATUS[tone];
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-[7px] px-2.5 py-1 text-[11px] font-bold"
      style={{ background: s.bg, color: s.fg }}
    >
      {children}
    </span>
  );
}
