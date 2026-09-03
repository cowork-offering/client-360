import { useCallback, useMemo } from "react";
import { resolveApproverUserId } from "../../channel/writeTools";
import { resolveBundle } from "../../actions/registry";
import { noteFiled } from "../../intent/open";
import { workroomActivityEntry } from "../../actions/executedActivity";
import { askBrain, brainReachable, type BrainEnvelope } from "../../channel/brainLane";
import { bookedFacilities } from "../../data/facilityStage";
import { useApp } from "../../state/appState";
import { createCreateEngine } from "../../workroom/createEngine";
import { type WorkroomEngine } from "../../workroom/engine";
import { createModifyEngine } from "../../workroom/modifyEngine";
import { createRenewEngine } from "../../workroom/renewEngine";
import { closeWorkroom, openWorkroom, useWorkroom, workroomContextFor } from "../../workroom/openWorkroom";
import { stageAction } from "../../channel/writeTools";
import { armStage } from "./orgArms";
import type { WorkroomContext, WorkroomExecution, WorkroomMode } from "../../workroom/types";
import { anchorFacilityRoom, bindFacilityRoute, closeFacilityRoom, useFacilityRoom } from "./roomSession";
import { Workroom, neutralAsk, smartAsk, type WorkroomRouter } from "./Workroom";
import type { ReadSource } from "./readCard";

/** The one mount. Anything, anywhere, calls `openWorkroom(context)` (a caller
 *  that already knows its mode) or `openFacilityRoom(...)` (the FAB, which does
 *  not) and the room appears over the cockpit; nothing else in the tree holds it
 *  open.
 *
 *  IT ALSO PICKS THE ENGINE, because this is the only place in the room's tree
 *  that sits inside the app provider and can see the read. The Workroom itself
 *  takes an engine and asks nothing about where it came from — which is what
 *  keeps the shell testable against a scripted engine and shipping against a
 *  wired one.
 *
 *  AND IT OWNS THE CONSEQUENCE OF THE ROUTE. The room asks which of the three
 *  this is; binding the answer REBUILDS the room on that engine here, keyed on
 *  the route, so a session can never quietly change engine underneath a
 *  manifest. */
export function WorkroomHost() {
  /* TWO DOORS, ONE ROOM. `useWorkroom` is the caller that named a mode — the
     command palette, a deep link. `useFacilityRoom` is the unified entry, which
     names a relationship and lets the room's first question pick the engine.
     The unified session wins when both are somehow open: it is the newer
     gesture, and the room it opens is the one the banker is looking at. */
  const named = useWorkroom();
  const session = useFacilityRoom();
  const { data, state, dispatch } = useApp();

  /* THE READ THE ROOM STANDS ON. `resolveBundle` returns the BAKED bundle; the
     live patch a sync sweep landed is merged over it exactly as AppShell does,
     so a banker who syncs and then opens the room is not quietly working on the
     figures from before the sync. */
  const accountId = session?.accountId ?? named?.accountId ?? null;
  const bundle = useMemo(() => {
    if (!accountId) return null;
    const baked = resolveBundle(data, accountId);
    const patch = state.livePatches[accountId];
    return baked && patch ? { ...baked, ...patch } : baked;
  }, [data, state.livePatches, accountId]);

  /* THE CONTEXT IS MEMOISED ON THE SESSION'S FACTS, NOT ON THE SESSION OBJECT.
     Binding a route to the engine the room is ALREADY standing on changes the
     session (it is bound now, and it may carry a line to say) without changing
     which room this is. Keying the context on the object would hand the room a
     new engine for that, and a new engine restarts the ritual — wiping the
     thread the banker is mid-sentence in. */
  const sessionRoute = session?.route ?? null;
  const sessionAccountId = session?.accountId ?? null;
  const sessionAccountName = session?.accountName ?? null;
  const sessionPackageId = session?.productPackageId ?? null;
  const context = useMemo<WorkroomContext | null>(() => {
    if (!sessionRoute || !sessionAccountId) return named;
    return workroomContextFor({
      mode: sessionRoute,
      data,
      bundle,
      accountId: sessionAccountId,
      accountName: sessionAccountName ?? sessionAccountId,
      productPackageId: sessionPackageId,
    });
  }, [bundle, data, named, sessionAccountId, sessionAccountName, sessionPackageId, sessionRoute]);

  /* ALL THREE MODES ARE WIRED. There is no scripted fallback left here: a room
     that reached a storyline when a mode was unrecognised would be a room that
     could quietly stop being real, and the `scripted` badge is the only thing
     the banker has to tell the two apart. The three engines take the same
     arguments and hand back the same seam. */
  const engine = useMemo<WorkroomEngine | null>(() => {
    if (!context) return null;
    const args = { context, data, bundle };
    switch (context.mode) {
      case "renew":
        return createRenewEngine(args);
      case "create":
        return createCreateEngine(args);
      default:
        /* THE ORG ARMS RIDE THE ENGINE'S OWN STAGE DEPENDENCY (2026-09-02).
           The three arms deployed after the engine was fenced, so an arm delta
           travels through it as a sentinel field change and `armStage` lifts
           those back out into `covenantExclusionsJson`, `pledgeExclusionsJson`
           and `covenantAttachesJson` on the way to the org. A plan carrying no
           arm reaches the tool on exactly the payload it always has. */
        return createModifyEngine({
          ...args,
          deps: { stage: armStage((payload) => stageAction("loan-modification", payload)) },
        });
    }
  }, [context, data, bundle]);

  /* WHICH MEMBERS A CREDIT ACTION CAN RUN AGAINST. `bookedFacilities` is the
     function the engines themselves gate on, called once here where the bundle
     lives, so the strip's disabled state and the engine's refusal are the same
     judgement rather than two that agree today. */
  const eligibleMemberIds = useMemo(
    () => new Set(bookedFacilities(bundle).map((f) => f.loanId).filter((id): id is string => !!id)),
    [bundle],
  );

  /* THE READ A QUESTION IS ANSWERED FROM. The same bundle the engine stands on,
     handed to the room so "which borrowers are already in the package" is
     answered from what was read rather than sent to a parser that can only
     propose changes. */
  const reads = useMemo<ReadSource>(
    () => ({
      bundle,
      accountName: context?.accountName ?? sessionAccountName ?? "this relationship",
      productPackageId: context?.productPackageId ?? null,
      // The artifact's own snapshot instant. Every time-based tier in the room
      // layer reads this and nothing reaches a clock.
      generatedAt: data.meta?.generatedAt,
      /* THE TRAIL, FOR THE IN-FLIGHT LOCK (rule 2). It is the only read that
         can tie an unbooked package version to the package it was forked from,
         and it is already in the store: the sync sweep loads it. Undefined
         where no sweep has run, which leaves a version named as in flight and
         no source package locked. */
      history: accountId ? state.actionHistory[accountId] : undefined,
    }),
    [
      accountId,
      bundle,
      context?.accountName,
      context?.productPackageId,
      data.meta?.generatedAt,
      sessionAccountName,
      state.actionHistory,
    ],
  );

  /* THE MAIL TIER HANDS OFF TO THE DESK. The workroom does not read a thread;
     it opens the assist with the question already typed, which is the surface
     that can actually answer it. */
  const openAssist = useCallback(
    (prompt: string) => {
      dispatch({ type: "SET_DRAFT", draft: prompt });
      dispatch({ type: "SET_PANEL", panel: "chat" });
    },
    [dispatch],
  );

  /* THE SECOND LANE, WIRED HERE AND NOWHERE ELSE.
     The room takes a function and asks nothing about what is on the other end
     of it, which is what keeps the shell testable against a stub reply and
     shipping against the live bridge. `brainReachable()` is the mcp capability
     gate: with no capability there is no arm of the bridge that returns a
     reply, so the prop is ABSENT and the composer keeps only the fast lane. */
  const brain = useMemo(() => (brainReachable() ? (envelope: BrainEnvelope) => askBrain(envelope) : undefined), []);

  /* AN EXECUTED PLAN LANDS IN THE TRAIL (A30). The room hands over what it
     already holds; the entry is minted in actions/ where every other executed
     action's entry is minted, and dispatched here where the provider is. */
  const onFiled = useCallback(
    (filed: {
      execution: WorkroomExecution;
      changeCount: number;
      packageHref: string | null;
      arms: string | null;
      pricing: string | null;
    }) => {
      if (!context) return;
      const entry = workroomActivityEntry({
        execution: filed.execution,
        changeCount: filed.changeCount,
        packageName: context.packageName,
        approver: data.meta?.user ?? context.approver,
        packageHref: filed.packageHref,
        productPackageId: context.productPackageId,
        arms: filed.arms,
        pricing: filed.pricing,
      });
      if (entry) dispatch({ type: "LOG_ACTIVITY", accountId: context.accountId, entry });
      /* AN EXECUTED PLAN SPENDS THE INTENT THAT OPENED THE ROOM. Bookkeeping in
         the store for whoever wrote it; never a gate on the dossier. */
      noteFiled(context.accountId);
    },
    [context, data.meta?.user, dispatch],
  );

  const close = useCallback(() => {
    if (!context) return;
    dispatch({ type: "ARM_WASH", accountId: context.accountId });
    closeFacilityRoom();
    closeWorkroom();
  }, [context, dispatch]);

  const router = useMemo<WorkroomRouter | undefined>(() => {
    if (!session) return undefined;
    return {
      question: session.bound
        ? null
        : session.opening
          ? smartAsk(session.opening)
          : neutralAsk(),
      say: session.say,
      preselectMemberId: session.memberId,
      onBind: (route: WorkroomMode, opts) => bindFacilityRoute(route, opts),
      onRestart: (route: WorkroomMode, say: string) => bindFacilityRoute(route, { say }),
    };
  }, [session]);

  if (!context || !engine) return null;
  // Keyed on the context so switching modes or packages rebuilds the room and
  // its engine rather than carrying one storyline's state into another. The
  // PACKAGE is part of that key because one session is one package is one plan:
  // a manifest composed against one package must not survive into another. The
  // MODE is part of it because binding a route is a rebuild, never a swap.
  return (
    <Workroom
      key={`${context.mode}-${context.door}-${context.accountId}-${context.productPackageId ?? "none"}`}
      context={context}
      engine={engine}
      router={router}
      eligibleMemberIds={eligibleMemberIds}
      reads={reads}
      onOpenAssist={openAssist}
      brain={brain}
      /* The org's own Lightning host, never a guessed My Domain. Absent leaves
         the dossier's link unrendered rather than wrong (A29). */
      instanceUrl={data.meta?.instanceUrl}
      approverUserId={resolveApproverUserId(data.meta) ?? undefined}
      onFiled={onFiled}
      /* THE GLASS LIFTS, AND THE WASH SETTLES (rule 62). Every route out of the
         room — the close button, Escape, the scrim — comes through this one
         prop, so arming the wash here catches all three. */
      onClose={close}
      onAnchor={(choice) =>
        session
          ? anchorFacilityRoom(choice.id)
          : openWorkroom({ ...context, productPackageId: choice.id, packageName: choice.label })
      }
      /* WRITE-BACK THROUGH THE GLASS. The room hands over the committed delta
         its own manifest carried; the cockpit's figures roll to it behind the
         blur. This host dispatches rather than the room, because the room has
         no provider above it in its render test — and because a dispatch that
         touched `livePatches` would rebuild the room's engine mid-scene. */
      onExecuted={(committedDeltaMM) =>
        dispatch({ type: "WRITE_BACK", accountId: context.accountId, committedDeltaMM })
      }
    />
  );
}
