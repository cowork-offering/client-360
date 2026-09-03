import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactElement, type RefObject } from "react";
import type { Facility } from "../../data/contract";
import { fmtMoney } from "../../data/format";
import { Portal } from "../Portal";
import type { Book, ElicitMember } from "../workroom/elicit";
import {
  FACILITY_TOPICS,
  facilityEntries,
  leaves,
  PLACEHOLDER,
  relationshipTopics,
  topicCount,
  type ActionChoice,
  type CatalogAction,
  type CatalogTopic,
  type FacilityEntry,
  type TopicId,
} from "./catalog";
import {
  IconBack,
  IconChevron,
  IconCollateral,
  IconCovenant,
  IconEntity,
  IconException,
  IconFacility,
  IconFees,
  IconPlus,
  IconPricing,
  IconRelationship,
  IconReview,
  IconSearch,
  IconService,
  IconTerms,
} from "./icons";
import "./composer.css";

/* =============================================================================
   THE PLUS, BESIDE THE SEND BUTTON.

   IT WRITES A LINE. IT NEVER SENDS ONE (founder, 2026-09-03). Picking an action
   puts the sentence in the composer with the caret on the first placeholder and
   the placeholder selected, so the next keystroke replaces it. The banker still
   steers it, still adds their own note, and still presses send. That is the
   whole point: a menu that sent would be a menu that guessed.

   THE MENU NEVER OFFERS WHAT THE ROOM REFUSES. Level one is the package the
   room stands in; the facility room lists its members and the relationship room
   opens on its own reviews, because the relationship room answers facility work
   with a handoff and the facility room does not run a review. An action whose
   record list comes back empty is not listed at all, which is why the 8M
   equipment loan has no "leave a covenant off" row: it carries no junction.

   ANCHORED TO THE BUTTON, PORTALLED TO THE BODY. The composer sits inside the
   room's scroll column and the room's own glass creates a stacking context, so
   a panel rendered in place would be clipped by both. It portals like every
   other overlay (see Portal.tsx) and reads --z-palette, the scale the command
   palette already sits on.
   ============================================================================= */

type Room = "facility" | "relationship";

export interface ComposerPlusProps {
  /** Which room this composer belongs to. Decides what level one holds. */
  room: Room;
  /** The room's own eligible members. A member the room will not act on never
   *  reaches the menu. */
  members: ElicitMember[];
  /** The read behind them, for the drawn figure and the maturity on the row. */
  facilities: Facility[];
  /** What the relationship already carries. The record lists come off this. */
  book: Book;
  /** The composer sleeps until the brief lands; so does the plus. */
  disabled?: boolean;
  /** The composer input the picked line lands in. */
  input: RefObject<HTMLInputElement | null>;
  /** The room's own draft setter. */
  onDraft: (next: string) => void;
}

/** The topic icons, by id. One place, so a topic cannot be drawn twice. */
const TOPIC_ICON: Record<TopicId, () => ReactElement> = {
  terms: IconTerms,
  entity: IconEntity,
  covenant: IconCovenant,
  collateral: IconCollateral,
  pricing: IconPricing,
  fees: IconFees,
  exceptions: IconException,
  reviews: IconReview,
  service: IconService,
  relIntake: IconCovenant,
};

/** The relationship stands at level one with no facility behind it. */
const RELATIONSHIP: FacilityEntry = {
  id: "__relationship",
  label: "Relationship",
  key: "Relationship",
  shortName: "Relationship",
  phrase: "relationship",
  committed: null,
  drawn: null,
  maturity: null,
};

/** One row of whatever level is showing. */
interface Row {
  id: string;
  label: string;
  /** The quiet second line: figures on a facility, the record on a choice. */
  sub?: string;
  icon?: () => ReactElement;
  /** A branch shows a chevron and a count; a leaf writes the line. */
  count?: number;
  template?: string;
  /** Where the breadcrumb is after this row is picked. */
  into?: { facility?: FacilityEntry; topic?: CatalogTopic; action?: CatalogAction };
  /** The path a search hit prints above its own label. */
  trail?: string;
}

/** The figures on a level-one row: commitment, drawn, maturity, one line. */
function facilitySub(f: FacilityEntry): string {
  const parts: string[] = [];
  if (f.committed !== null) parts.push(`${fmtMoney(f.committed)} committed`);
  if (f.drawn !== null) parts.push(`${fmtMoney(f.drawn)} drawn`);
  if (f.maturity) parts.push(`matures ${f.maturity}`);
  return parts.join(" · ");
}

export function ComposerPlus({ room, members, facilities, book, disabled, input, onDraft }: ComposerPlusProps) {
  const [open, setOpen] = useState(false);
  const [facility, setFacility] = useState<FacilityEntry | null>(null);
  const [topic, setTopic] = useState<CatalogTopic | null>(null);
  const [action, setAction] = useState<CatalogAction | null>(null);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  /** The placeholder to select once React has put the line in the input. */
  const [pending, setPending] = useState<{ start: number; end: number } | null>(null);

  const button = useRef<HTMLButtonElement | null>(null);
  const panel = useRef<HTMLDivElement | null>(null);
  const field = useRef<HTMLInputElement | null>(null);
  const [anchor, setAnchor] = useState<{ left: number; bottom: number; width: number } | null>(null);

  const entries = useMemo(() => facilityEntries(members, facilities), [members, facilities]);
  const relTopics = useMemo(() => relationshipTopics(), []);

  /* THE ROOM DECIDES WHAT LEVEL ONE IS. The facility room lists the package;
     the relationship room has one subject and opens on its topics. */
  const roots: FacilityEntry[] = room === "facility" ? entries : [RELATIONSHIP];
  const topicsFor = useCallback(
    (f: FacilityEntry): CatalogTopic[] =>
      (f === RELATIONSHIP ? relTopics : FACILITY_TOPICS).filter((t) => topicCount(t, f, book) > 0),
    [book, relTopics],
  );

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setCursor(0);
    setFacility(null);
    setTopic(null);
    setAction(null);
  }, []);

  /* ------------------------------------------------------------- the rows */

  const rows: Row[] = useMemo(() => {
    const q = query.trim().toLowerCase();

    /* A SEARCH READS EVERY LEVEL AT ONCE. Type "guarantor" and the matching
       actions come back under every facility that offers them, with the path
       printed above each one so a hit is never anonymous. */
    if (q) {
      const hits: Row[] = [];
      for (const f of roots) {
        for (const t of topicsFor(f)) {
          for (const a of t.actions) {
            for (const c of leaves(a, f, book)) {
              const hay = `${f.label} ${t.label} ${a.label} ${c.label} ${c.sub ?? ""} ${c.template}`.toLowerCase();
              if (!hay.includes(q)) continue;
              hits.push({
                id: `${f.id}.${c.id}`,
                label: a.choices ? `${a.label}: ${c.label}` : c.label,
                sub: c.sub,
                trail: room === "facility" ? `${f.label} · ${t.label}` : t.label,
                template: c.template,
              });
              if (hits.length >= 60) return hits;
            }
          }
        }
      }
      return hits;
    }

    if (!facility) {
      return roots.map((f) => ({
        id: f.id,
        label: f.label,
        sub: facilitySub(f),
        icon: f === RELATIONSHIP ? IconRelationship : IconFacility,
        count: topicsFor(f).length,
        into: { facility: f },
      }));
    }
    if (!topic) {
      return topicsFor(facility).map((t) => ({
        id: t.id,
        label: t.label,
        icon: TOPIC_ICON[t.id],
        count: topicCount(t, facility, book),
        into: { facility, topic: t },
      }));
    }
    if (!action) {
      return topic.actions
        .map((a) => ({ a, list: leaves(a, facility, book) }))
        .filter(({ list }) => list.length > 0)
        .map(({ a, list }) =>
          a.choices
            ? { id: a.id, label: a.label, count: list.length, into: { facility, topic, action: a } }
            : { id: a.id, label: a.label, template: list[0].template },
        );
    }
    return leaves(action, facility, book).map((c: ActionChoice) => ({
      id: c.id,
      label: c.label,
      sub: c.sub,
      template: c.template,
    }));
  }, [action, book, facility, query, room, roots, topic, topicsFor]);

  useEffect(() => setCursor(0), [facility, topic, action, query]);

  /* ------------------------------------------------------------ the insert */

  const insert = useCallback(
    (template: string) => {
      const el = input.current;
      const held = (el?.value ?? "").trim();
      const next = held ? `${held} ${template}` : template;
      const hole = PLACEHOLDER.exec(next);
      const start = hole ? next.indexOf(hole[0]) : next.length;
      onDraft(next);
      setPending({ start, end: hole ? start + hole[0].length : next.length });
      close();
    },
    [close, input, onDraft],
  );

  /* THE SELECTION LANDS AFTER THE VALUE DOES. The input is controlled, so the
     new text is not in the DOM until React has re-rendered; setting a range
     inside the click handler would select against the old string. */
  useEffect(() => {
    if (!pending) return;
    const el = input.current;
    if (el) {
      el.focus();
      el.setSelectionRange(Math.min(pending.start, el.value.length), Math.min(pending.end, el.value.length));
    }
    setPending(null);
  }, [pending, input]);

  const pick = useCallback(
    (row: Row) => {
      if (row.template) {
        insert(row.template);
        return;
      }
      if (row.into) {
        setFacility(row.into.facility ?? null);
        setTopic(row.into.topic ?? null);
        setAction(row.into.action ?? null);
        setQuery("");
      }
    },
    [insert],
  );

  const back = useCallback(() => {
    if (query) {
      setQuery("");
      return;
    }
    if (action) {
      setAction(null);
      return;
    }
    if (topic) {
      setTopic(null);
      return;
    }
    if (facility && roots.length > 1) setFacility(null);
  }, [action, facility, query, roots.length, topic]);

  /* ------------------------------------------------------ opening and closing */

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = button.current?.getBoundingClientRect();
      if (!rect) return;
      setAnchor({ left: rect.left, bottom: window.innerHeight - rect.top + 10, width: rect.width });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    field.current?.focus();
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panel.current?.contains(t) || button.current?.contains(t)) return;
      close();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [close, open]);

  /* The relationship room has one subject, so its level one is a single row.
     Standing on it is not a choice anyone makes; the panel opens past it. */
  useEffect(() => {
    if (open && roots.length === 1 && !facility) setFacility(roots[0]);
  }, [facility, open, roots]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      input.current?.focus();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => (rows.length ? (c + 1) % rows.length : 0));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => (rows.length ? (c - 1 + rows.length) % rows.length : 0));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const row = rows[cursor];
      if (row) pick(row);
      return;
    }
    if (e.key === "Backspace" && !query) {
      e.preventDefault();
      back();
    }
  };

  const crumbs = [
    facility && facility !== RELATIONSHIP ? facility.label : facility ? "Relationship" : null,
    topic?.label ?? null,
    action?.label ?? null,
  ].filter((c): c is string => Boolean(c));
  const depth = crumbs.length;

  return (
    <>
      <button
        type="button"
        ref={button}
        className="cp-plus"
        aria-label="Actions"
        title="Actions"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <IconPlus />
      </button>
      {open && anchor && (
        <Portal>
          <div
            ref={panel}
            className="cp-panel eg-glass eg-glass-panel"
            role="menu"
            aria-label="Actions"
            style={{ left: anchor.left, bottom: anchor.bottom }}
            onKeyDown={onKeyDown}
          >
            <div className="cp-head">
              {depth > 0 && (
                <button type="button" className="cp-back" aria-label="Back" onClick={back}>
                  <IconBack />
                </button>
              )}
              <div className="cp-crumbs" aria-live="polite">
                {crumbs.length ? (
                  crumbs.map((c, i) => (
                    <span key={c} className="cp-crumb">
                      {i > 0 && <span className="cp-crumb-sep">/</span>}
                      {c}
                    </span>
                  ))
                ) : (
                  <span className="cp-crumb">{room === "facility" ? "Product Package" : "Relationship"}</span>
                )}
              </div>
            </div>
            <div className="cp-find">
              <IconSearch />
              <input
                ref={field}
                className="cp-find-in"
                value={query}
                placeholder="Filter actions"
                aria-label="Filter actions"
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="cp-list" key={`${facility?.id ?? "root"}.${topic?.id ?? ""}.${action?.id ?? ""}.${query ? "q" : ""}`}>
              {rows.length === 0 && <p className="cp-empty">Nothing here on this facility.</p>}
              {rows.map((row, i) => (
                <button
                  type="button"
                  key={row.id}
                  role="menuitem"
                  className={`cp-row${i === cursor ? " on" : ""}`}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => pick(row)}
                >
                  {row.icon && (
                    <span className="cp-ico" aria-hidden="true">
                      {row.icon()}
                    </span>
                  )}
                  <span className="cp-body">
                    {row.trail && <span className="cp-trail">{row.trail}</span>}
                    <span className="cp-label">{row.label}</span>
                    {row.sub && <span className="cp-sub">{row.sub}</span>}
                  </span>
                  {row.count !== undefined ? (
                    <span className="cp-count">{row.count}</span>
                  ) : (
                    <span className="cp-writes">writes</span>
                  )}
                  {row.count !== undefined && (
                    <span className="cp-chev" aria-hidden="true">
                      <IconChevron />
                    </span>
                  )}
                </button>
              ))}
            </div>
            <p className="cp-foot">Picking writes the line into the composer. It never sends it.</p>
          </div>
        </Portal>
      )}
    </>
  );
}
