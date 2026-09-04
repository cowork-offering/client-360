import { useEffect, useMemo, useState } from "react";
import { useApp } from "../../state/appState";
import { resolveBundle } from "../../actions/registry";
import { packageRecords } from "../../actions/schemas";
import { fetchActionHistory } from "../../channel/cockpitTools";
import { askSession, sampleAvailable } from "../../channel/sampleDoor";
import { buildMemoDossier } from "../../memo/dossier";
import { renderPlanFor } from "../../memo/renderMemo";
import { latestMemo, saveAttestations, saveMemoDraft, type MemoDraft } from "../../memo/store";
import type { ActionHistoryRow } from "../../data/contract";
import { MemoRoom, type MemoContext, type MemoDeps, type MemoNarrator } from "./MemoRoom";
import { closeMemoRoom, useMemoRoom } from "./memoSession";
import { executedRead, memoGreeting } from "./memoGreeting";

/* =============================================================================
   THE ONE MOUNT.

   The third sibling of `WorkroomHost` and `RelationshipRoomHost`, and it exists
   for the same reason both of them do: it is the only place in this room's tree
   that sits inside the app provider and can see the read. The room itself takes
   a context, a dossier and a greeting and asks nothing about where they came
   from, which is what keeps it testable against injected deps and shipping
   against the live doors.

   THREE READS, AND EVERY ONE OF THEM MAY COME BACK EMPTY:

     the bundle          the relationship, as the cockpit staged it. Without it
                         there is no dossier and the room does not open.
     the action trail    what the org records against this package. The sweep
                         has usually loaded it; the room asks again WITH STEP
                         DETAIL, which is Phase B's input and which today's
                         deployed read simply ignores.
     the stored memo     the last memo written for this package, if the artifact
                         has a store at all.

   None of the three is awaited before the room opens. The memo is deterministic
   from the bundle alone, so the room appears immediately and the greeting
   restates itself when the trail lands, which is the same discipline the other
   two rooms follow with their own slow reads.
   ============================================================================= */

/** The session brain, as the memo room's narrator. Absent where the door is
 *  not in this view, which the room reads as "no prose" and says out loud. */
function memoNarrator(): MemoNarrator | undefined {
  if (!sampleAvailable()) return undefined;
  return ({ prompt, onText, signal }) =>
    askSession(prompt, {
      tier: "default",
      kind: "reply",
      rung: 2,
      signal,
      onText: (update) => onText?.(update.text),
    });
}

export function MemoRoomHost() {
  const session = useMemoRoom();
  const { data, state } = useApp();

  const accountId = session?.accountId ?? null;
  const bundle = useMemo(() => {
    if (!accountId) return null;
    const baked = resolveBundle(data, accountId);
    const patch = state.livePatches[accountId];
    return baked && patch ? { ...baked, ...patch } : baked;
  }, [data, state.livePatches, accountId]);

  /* THE PACKAGE THE MEMO IS ABOUT. The caller's anchor wins; a room opened from
     the FAB on a relationship staging one package takes that one. A room with
     no anchor at all renders a memo that says so rather than picking. */
  const packages = useMemo(() => packageRecords(bundle), [bundle]);
  const packageId = session?.productPackageId ?? packages[0]?.id ?? null;
  const packageName = packages.find((p) => p.id === packageId)?.label ?? null;

  /* THE TRAIL, WITH STEP DETAIL WHERE THE ORG CARRIES IT. The sweep's rows are
     the floor; this asks once more for the same account with `includeSteps`, so
     the greeting can state the executed changes the moment Phase B lands them. */
  const [orgRows, setOrgRows] = useState<ActionHistoryRow[] | null>(null);
  useEffect(() => {
    if (!accountId) {
      setOrgRows(null);
      return;
    }
    let alive = true;
    fetchActionHistory(accountId, 25, { includeSteps: true, productPackageId: packageId })
      .then(({ rows }) => {
        if (alive) setOrgRows(rows);
      })
      .catch(() => {
        // A read that did not answer is not an error on the glass: the greeting
        // falls back to the sweep's rows, and says what it is standing on.
      });
    return () => {
      alive = false;
    };
  }, [accountId, packageId]);

  /* THE STORED MEMO, for "Open latest memo". Null covers every absence. */
  const [latest, setLatest] = useState<MemoDraft | null>(null);
  useEffect(() => {
    if (!packageId) {
      setLatest(null);
      return;
    }
    let alive = true;
    void latestMemo(packageId).then((memo) => {
      if (alive) setLatest(memo);
    });
    return () => {
      alive = false;
    };
  }, [packageId]);

  const rows = orgRows ?? (accountId ? state.actionHistory[accountId] : undefined);
  const executed = useMemo(() => executedRead(rows, packageId), [rows, packageId]);

  /* THE CHANGES THIS MEMO IS ABOUT. The org's own step detail is the source of
     truth (requirements, non-negotiable 1); the finale's handover is the
     fallback, and the greeting says which of the two the room is standing on. */
  const changes = executed.hasSteps ? executed.changes : (session?.carried ?? []);

  const dossier = useMemo(() => {
    if (!bundle) return null;
    return buildMemoDossier({
      bundle,
      changes,
      instanceUrl: data.meta?.instanceUrl ?? null,
      productPackageName: packageName,
      creditEvent: session?.trigger === "create" ? "new_relationship" : "existing_material",
    });
  }, [bundle, changes, data.meta?.instanceUrl, packageName, session?.trigger]);

  const greeting = useMemo(() => {
    if (!dossier) return null;
    return memoGreeting({
      packageId,
      trigger: session?.trigger ?? "adhoc",
      executed,
      carried: session?.carried ?? null,
      plan: renderPlanFor(dossier),
      hasStoredMemo: latest !== null,
    });
  }, [dossier, packageId, session?.trigger, session?.carried, executed, latest]);

  const deps = useMemo<MemoDeps>(
    () => ({ narrate: memoNarrator(), save: saveMemoDraft, saveAttestations }),
    [],
  );

  if (!session || !bundle || !dossier || !greeting) return null;

  const ctx: MemoContext = {
    accountId: session.accountId,
    accountName: session.accountName,
    packageId,
    packageName,
    trigger: session.trigger,
    user: data.meta?.user ?? null,
    generatedAt: data.meta?.generatedAt ?? "",
    instanceUrl: data.meta?.instanceUrl ?? null,
    source: session.source,
  };

  return (
    <MemoRoom
      /* Keyed on the package: a memo composed against one version must never
         survive into another, exactly as a manifest must not. */
      key={`memo-${session.accountId}-${packageId ?? "none"}`}
      ctx={ctx}
      dossier={dossier}
      changes={changes}
      greeting={greeting}
      latest={latest}
      deps={deps}
      onClose={closeMemoRoom}
    />
  );
}
