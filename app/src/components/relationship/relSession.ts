import { useSyncExternalStore } from "react";
import type { RelRoute, RelOpening } from "./relRoute";

/* =============================================================================
   THE RELATIONSHIP ROOM'S SESSION.

   The mirror of `../workroom/roomSession.ts`, for the second unified room. Same
   store shape, same lifecycle, same reason for being a module store rather than
   a slice of ViewState: the FAB's arc has to be able to open the room from
   outside any provider that owns it, and an unbound room is not a view the
   cockpit persists.

   WHAT DIFFERS FROM THE FACILITY ROOM. There is no PROVISIONAL route here. The
   facility room has to stand on an engine to read the package at all, so it
   opens on `modify` and rebuilds when the banker chooses. The five review routes
   share ONE reader: the room briefs the relationship the same way whichever
   review this turns out to be, and it stages nothing until a route is bound. So
   `route` is simply null until the first question is answered, and the header
   says "Relationship Actions" for exactly as long as that is true.

   ROUTE BINDING IS FINAL PER PLAN. A bound route is never swapped underneath a
   collected parameter set or a staged plan; the room refuses out loud and offers
   a restart, exactly as the facility room does.
   ============================================================================= */

export interface RelSession {
  accountId: string;
  accountName: string;
  /** Null while the room is still asking which review this is. */
  route: RelRoute | null;
  /** The governance signal the room opened on, or null for the neutral question. */
  opening: RelOpening | null;
  /** A typed line that bound the route and still has to be ACTED ON. A banker
   *  who typed "run the covenant review" asked for something, and a room that
   *  only echoed it would have taken the instruction and dropped it. Null for a
   *  chip binding, which answers the question and asks nothing. */
  say: string | null;
  /** The covenant the signal named, where it named one. The covenant route
   *  opens its brief on it rather than making the banker find it again. */
  covenantId: string | null;
}

let session: RelSession | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

/**
 * OPEN THE RELATIONSHIP ROOM on a relationship, unbound.
 *
 * The opener the FAB's arc calls. It takes the same shape as
 * `openFacilityRoom`: the caller names the relationship and hands over the
 * smart opening it derived (or null), and the room's first question decides
 * which of the five reviews takes the session.
 */
export function openRelationshipRoom(context: {
  accountId: string;
  accountName: string;
  opening: RelOpening | null;
}): void {
  session = {
    accountId: context.accountId,
    accountName: context.accountName,
    route: null,
    opening: context.opening,
    say: null,
    covenantId: null,
  };
  emit();
}

/** The route is chosen. The room binds and briefs it. */
export function bindRelRoute(route: RelRoute, opts?: { say?: string | null; covenantId?: string | null }): void {
  if (!session) return;
  session = {
    ...session,
    route,
    say: opts?.say ?? null,
    covenantId: opts?.covenantId ?? null,
  };
  emit();
}

/** The banker discarded what was collected and asked for a different review.
 *  A rebuild, never a quiet re-route. */
export function restartRelRoute(route: RelRoute, say: string): void {
  if (!session) return;
  session = { ...session, route, say, covenantId: null };
  emit();
}

export function closeRelationshipRoom(): void {
  if (!session) return;
  session = null;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot(): RelSession | null {
  return session;
}

/** The open relationship-room session, or null. One mount reads this. */
export function useRelationshipRoom(): RelSession | null {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/* --------------------------------------------------------- the arc's satellite

   THE ORCHESTRATOR WIRES THE ARC, NOT THIS FILE. `ChatFab.tsx` is fenced for
   this build, so the arc's shape is DECLARED here and consumed there. The
   offsets are the dummy's literal --tx/--ty, unchanged: the founder-approved arc
   is these numbers and not a formula (rule 53).

   THE ARC GOES FROM FOUR TO THREE. "Annual review" and "Covenant review" were
   two of the four satellites; both are now routes INSIDE this room, alongside
   three that never had a satellite at all. Two satellites collapse into one, and
   per the arc's own rhythm rule dropping a satellite drops the LAST POSITION and
   keeps the 46px neighbour spacing — so this one takes the third seat
   (-83, -83), byte-identical to the offsets "Annual review" already sat on, and
   the fourth seat retires. */
export const SATELLITE_SPEC = {
  act: "relationship",
  label: "Relationship",
  aria: "Relationship Actions",
  tx: -83,
  ty: -83,
  icon: "review",
  domId: "actRelationship",
  /** What the satellite REPLACES. Both of these retire from the arc; the arc
   *  drops from four seats to three and the last seat goes. */
  replaces: ["annual", "covenant"],
} as const;
