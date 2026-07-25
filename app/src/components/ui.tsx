import type { CSSProperties, ReactNode } from "react";
import { useApp } from "../state/appState";
import { STATUS, type Tone } from "../data/finance";
import { AccentureCaretWatermark } from "./brand";

/** Single page container — one max-width, one gutter (A25.3). */
export function PageContainer({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`page ${className}`}>{children}</div>;
}

/** Card. `h-full` + column flex so siblings in a grid row share exact top and
 *  bottom edges (A25.3); hover lift is opt-out for non-interactive panels. */
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
    <div className="inline-flex items-center gap-2.5 rounded-[10px] border border-dashed border-border-strong bg-wash px-3 py-2.5">
      <svg width="15" height="15" viewBox="0 0 16 16" className="flex-none text-ink-faint">
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

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2.5 px-6 py-9 text-center">
      <div className="flex h-[46px] w-[46px] items-center justify-center rounded-full bg-wash-2 text-ink-faint">
        <svg width="22" height="22" viewBox="0 0 22 22">
          <circle cx="11" cy="11" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <path d="M6.5 11h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </div>
      <div className="text-[14px] font-bold text-ink-body-strong">{title}</div>
      <div className="max-w-[420px] text-[12.5px] leading-relaxed text-ink-label">{body}</div>
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

export function StatCell({ label, value, color }: { label: string; value: ReactNode; color?: string }) {
  return (
    <div>
      <div className="text-[11px] font-semibold text-ink-label">{label}</div>
      <div className="tnum mt-0.5 text-[23px] font-extrabold" style={color ? { color } : undefined}>
        {value}
      </div>
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
