import { gradeTone, STATUS } from "../data/finance";

export function GradeBadge({ grade }: { grade: number | null }) {
  const s = STATUS[gradeTone(grade)];
  return (
    <span
      className="tnum inline-flex min-w-[56px] items-center justify-center rounded-[6px] px-2 py-1 text-[11px] font-bold"
      style={{ background: s.bg, color: s.fg }}
    >
      {grade != null ? `Grade ${grade}` : "—"}
    </span>
  );
}
