/* =============================================================================
   THE DISCLOSURE LIST — one primitive, two surfaces.

   FOUNDER READ (2026-09-03): the covenants pane and the collateral block are
   the SAME gesture. List the thing the account holds, one aligned row each;
   click a row and it opens in place into the loans (or the pledges) behind it,
   again one aligned row each. "Keep it elegant, all in one row, all aligned."

   So the row, the header, the caret, the badge, the opened block and the
   keyboard model are written ONCE and both surfaces call them. Two lists that
   look the same because they ARE the same, and a change to the row cannot
   improve one and leave the other behind.

   THE ROW IS A BUTTON. That is the whole accessibility story: the entire row is
   the click target, it takes focus in document order, and Enter and Space
   toggle it with no key handler of ours to get wrong.

   The column templates are the ONLY thing a caller supplies, as two custom
   properties on the list (`--x-row-cols`, `--x-sub-cols`) in styles/panes.css.
   ============================================================================= */

import { useState, type ReactNode } from "react";

export interface DiscloseCell {
  content: ReactNode;
  /** Figures right, text left. Nothing else decides alignment. */
  align?: "r";
  title?: string;
  muted?: boolean;
  /** Two facts in one cell: the first truncates, the second keeps its width.
   *  A descriptor with the org's record name beside it, never cut. */
  split?: boolean;
}

function Cells({ cells, caret }: { cells: readonly DiscloseCell[]; caret?: boolean }) {
  return (
    <>
      {cells.map((c, i) => (
        <span
          key={i}
          className={`xcell${c.align === "r" ? " r" : ""}${c.muted ? " xmuted" : ""}${c.split ? " split" : ""}`}
          title={c.title}
        >
          {caret && i === 0 && <span className="xcaret" aria-hidden="true" />}
          {c.content}
        </span>
      ))}
    </>
  );
}

export function DiscloseList({
  kind,
  kicker,
  children,
}: {
  kind: string;
  kicker?: string;
  children: ReactNode;
}) {
  return (
    <div className={`xlist xlist-${kind}`} data-x-list={kind}>
      {kicker && <div className="kicker xlist-kicker">{kicker}</div>}
      {children}
    </div>
  );
}

export function DiscloseHead({ kind, cells }: { kind: string; cells: readonly DiscloseCell[] }) {
  return (
    <div className="xrow xhead" data-x-head={kind}>
      <Cells cells={cells} />
    </div>
  );
}

export function DiscloseRow({
  kind,
  cells,
  open,
  onToggle,
  label,
}: {
  kind: string;
  cells: readonly DiscloseCell[];
  open: boolean;
  onToggle: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      className={`xrow num${open ? " open" : ""}`}
      data-x-row={kind}
      aria-expanded={open}
      aria-label={label}
      onClick={onToggle}
    >
      <Cells cells={cells} caret />
    </button>
  );
}

/** The opened block. It settles open on the pane's own curve; the animation
 *  lives in panes.css and is switched off with every other one under
 *  prefers-reduced-motion. */
export function DisclosePanel({ kind, children }: { kind: string; children: ReactNode }) {
  return (
    <div className="xexp" data-x-expansion={kind}>
      <div className="xexp-in">{children}</div>
    </div>
  );
}

export function DiscloseSubHead({ kind, cells }: { kind: string; cells: readonly DiscloseCell[] }) {
  return (
    <div className="xsub xsubhead" data-x-subhead={kind}>
      <Cells cells={cells} />
    </div>
  );
}

export function DiscloseSub({ kind, cells }: { kind: string; cells: readonly DiscloseCell[] }) {
  return (
    <div className="xsub num" data-x-sub={kind}>
      <Cells cells={cells} />
    </div>
  );
}

/** The line an opened block shows instead of rows, when there are none. */
export function DiscloseEmpty({ kind, children }: { kind: string; children: ReactNode }) {
  return (
    <p className="xempty" data-x-empty={kind}>
      {children}
    </p>
  );
}

/** Independent rows: opening one never closes another, because comparing two is
 *  the reason to open either. */
export function useDisclosure(): { isOpen: (k: string) => boolean; toggle: (k: string) => void } {
  const [open, setOpen] = useState<string[]>([]);
  return {
    isOpen: (k) => open.includes(k),
    toggle: (k) => setOpen((v) => (v.includes(k) ? v.filter((x) => x !== k) : [...v, k])),
  };
}
