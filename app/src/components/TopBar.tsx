import { useApp } from "../state/appState";
import { fmtDate } from "../data/format";
import { AccentureWordmark } from "./brand";

export function TopBar() {
  const { data } = useApp();
  const meta = data.meta ?? {};
  const user = meta.user ?? "Credit Officer";
  const initials = user.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  // generatedAt is required (F5) — no fallback chain needed.
  const dateStr = fmtDate(meta.generatedAt);

  return (
    <header
      className="flex h-[60px] flex-none items-center gap-3.5 px-6"
      style={{
        zIndex: "var(--z-nav)",
        background: "var(--frost-nav)",
        backdropFilter: "blur(16px) saturate(1.5)",
        WebkitBackdropFilter: "blur(16px) saturate(1.5)",
        boxShadow: "var(--nav-shadow)",
      }}
    >
      <AccentureWordmark />
      <span className="h-[22px] w-px" style={{ background: "var(--border-strong)" }} />
      <span className="text-[15px] font-bold tracking-tight text-ink">Commercial Credit 360</span>

      <div className="ml-auto flex items-center gap-3.5">
        <div className="text-right leading-tight">
          <div className="text-[12.5px] font-semibold text-ink">{user}</div>
          {dateStr && <div className="text-[11px] text-ink-label">{dateStr}</div>}
        </div>
        <div className="flex h-[34px] w-[34px] items-center justify-center rounded-full text-[12px] font-bold tracking-wide" style={{ background: "var(--fill-strong)", color: "var(--ink-inverse)" }}>
          {initials}
        </div>
      </div>
    </header>
  );
}
