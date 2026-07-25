import type { ReasonCode } from "../data/contract";
import { REASON_META } from "./reasons";

export function ReasonChip({ code }: { code: ReasonCode }) {
  const m = REASON_META[code];
  return (
    <span
      className="inline-flex items-center whitespace-nowrap rounded-[5px] px-2 py-[3px] text-2xs font-semibold uppercase tracking-wide"
      style={{ background: m.bg, color: m.fg }}
      title={m.label}
    >
      {m.short}
    </span>
  );
}

export function ReasonChips({ codes }: { codes: ReasonCode[] }) {
  if (!codes.length) return <span className="text-ink-faint">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {codes.map((c) => (
        <ReasonChip key={c} code={c} />
      ))}
    </div>
  );
}
