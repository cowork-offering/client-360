import type { ReactNode } from "react";
import type { WorkroomDelta, PackageMember } from "../../workroom/types";

/* =============================================================================
   THE TYPE-ICON LANGUAGE (rule 35).

   Every credit object in the room carries the SAME 24px rounded-square icon
   wherever it appears — the facility row, the delta card's label, the detail
   card header, the manifest chip, the dossier row. One language everywhere,
   including the committing lane, so a banker learns eight shapes once and reads
   them for the rest of the session.

   13px glyphs, 1.5 stroke, ink-3 on surface-2; purple-deep when selected.

   THE ICON IS RESOLVED FROM THE ENGINE'S OWN WORDS, never assigned by hand at a
   call site. `iconFor` reads the delta the engine staged — its manifest group
   first, because the group is a closed set the engine owns, then its kind and
   title. A room that named its own icons would drift the moment an engine
   staged a kind nobody had thought of; this way an unknown kind lands on the
   commitment icon and is still legible.
   ============================================================================= */

export type IconKind =
  | "revolver"
  | "term"
  | "equipment"
  | "covenant"
  | "pricing"
  | "maturity"
  | "commit"
  | "collateral"
  | "package";

const PATHS: Record<IconKind, ReactNode> = {
  revolver: (
    <>
      <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" />
      <path d="M13.7 1.8v2.6h-2.6" />
    </>
  ),
  term: (
    <>
      <rect x="2" y="3" width="12" height="11" rx="2" />
      <path d="M2 6.5h12M5.5 1.8v2.4M10.5 1.8v2.4" />
    </>
  ),
  equipment: (
    <>
      <path d="M2.5 5.5 8 2.5l5.5 3v5L8 13.5l-5.5-3z" />
      <path d="M8 8v5.5M2.5 5.5 8 8l5.5-2.5" />
    </>
  ),
  covenant: (
    <>
      <path d="M8 1.5 13.5 3.8V8c0 3.4-2.3 5.6-5.5 6.7C4.8 13.6 2.5 11.4 2.5 8V3.8Z" />
      <path d="M5.6 8l1.8 1.8 3.2-3.4" />
    </>
  ),
  pricing: (
    <>
      <path d="M12.5 3.5l-9 9" />
      <circle cx="4.8" cy="4.8" r="1.8" />
      <circle cx="11.2" cy="11.2" r="1.8" />
    </>
  ),
  maturity: (
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 4.5V8l2.6 1.6" />
    </>
  ),
  commit: (
    <>
      <rect x="1.8" y="4" width="12.4" height="8" rx="2" />
      <circle cx="8" cy="8" r="1.9" />
      <path d="M4.2 8h.01M11.8 8h.01" />
    </>
  ),
  collateral: (
    <>
      <rect x="3" y="7" width="10" height="7" rx="1.5" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
    </>
  ),
  package: (
    <>
      <path d="M8 1.8 14 4.6 8 7.4 2 4.6Z" />
      <path d="M2 7.6 8 10.4 14 7.6" />
      <path d="M2 10.6 8 13.4 14 10.6" />
    </>
  ),
};

export function TypeIcon({ kind, className = "" }: { kind: IconKind; className?: string }) {
  return (
    <span className={`tico ${className}`.trim()} aria-hidden="true">
      <svg viewBox="0 0 16 16">{PATHS[kind]}</svg>
    </span>
  );
}

/** The product word a member carries, read the way the org spells it. */
export function iconForProduct(product: string): IconKind {
  const p = product.toLowerCase();
  if (/revolv|line of credit|\bloc\b|working capital/.test(p)) return "revolver";
  if (/equip|machin|vehicle|fleet/.test(p)) return "equipment";
  if (/term|amortis|amortiz|mortgage|real estate|cre\b/.test(p)) return "term";
  return "commit";
}

export function iconForMember(member: PackageMember): IconKind {
  return iconForProduct(member.product || member.key);
}

/** The icon a staged change wears, everywhere it appears. */
export function iconForDelta(delta: Pick<WorkroomDelta, "group" | "kind" | "title">): IconKind {
  if (delta.group === "covenants") return "covenant";
  if (delta.group === "security") return "collateral";
  const words = `${delta.kind} ${delta.title}`.toLowerCase();
  if (/pricing|rate|spread|margin|sofr|fee|percent/.test(words)) return "pricing";
  if (/maturity|matur|tenor|extend|expiry|expiration|date/.test(words)) return "maturity";
  if (/covenant/.test(words)) return "covenant";
  if (/collateral|pledge|security|lien/.test(words)) return "collateral";
  if (delta.group === "structure") return "package";
  return "commit";
}
